import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { FeatureError } from "./api-error";
import { callIceServers } from "./call-validation";

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
const uuid = z.uuid();
const description = (type: "offer" | "answer") =>
  z
    .object({ type: z.literal(type), sdp: z.string().min(10).max(35000) })
    .strict();
export async function streamApi(
  req: NextRequest,
  path: string[],
  input: Record<string, unknown>,
  userId: string,
) {
  if (path[0] !== "streams") return;
  const sql = db(),
    method = req.method;
  if (path.length === 2 && path[1] === "config" && method === "GET")
    return json({ ...callIceServers(), maxViewers: 8 });
  if (path.length === 1 && method === "GET")
    return json(
      await sql`SELECT s.id,s.title,s.host_id,s.created_at,json_build_object('id',u.id,'name',u.name,'color',u.color,'verified',u.verified) author,(SELECT count(*)::int FROM live_stream_peers p WHERE p.stream_id=s.id AND p.ready AND p.seen_at>now()-interval '30 seconds' AND telejka_can_view(s.host_id,p.user_id)) viewers FROM live_streams s JOIN users u ON u.id=s.host_id WHERE s.ended_at IS NULL AND s.seen_at>now()-interval '40 seconds' AND telejka_can_view(s.host_id,${userId}::uuid) ORDER BY s.created_at DESC LIMIT 40`,
    );
  if (path.length === 1 && method === "POST") {
    const d = z
      .object({
        id: uuid,
        hostKey: uuid,
        title: z.string().trim().min(1).max(100),
      })
      .strict()
      .parse(input);
    await sql.begin(async (tx) => {
      await tx`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
      const [old] =
        await tx`SELECT host_id,host_key,ended_at,seen_at>now()-interval '40 seconds' fresh FROM live_streams WHERE id=${d.id}`;
      if (old) {
        if (
          old.host_id === userId &&
          old.host_key === d.hostKey &&
          !old.ended_at &&
          old.fresh
        )
          return;
        throw new FeatureError(
          409,
          "Эфир уже завершён или принадлежит другому пользователю.",
        );
      }
      const [busy] =
        await tx`SELECT 1 FROM live_streams WHERE host_id=${userId} AND ended_at IS NULL AND seen_at>now()-interval '40 seconds'`;
      if (busy)
        throw new FeatureError(
          409,
          "У тебя уже идёт эфир. Заверши его в другой вкладке или подожди 40 секунд.",
        );
      await tx`DELETE FROM live_streams WHERE seen_at<now()-interval '1 day'`;
      await tx`INSERT INTO live_streams(id,host_id,host_key,title) VALUES(${d.id},${userId},${d.hostKey},${d.title})`;
    });
    return json({ id: d.id }, 201);
  }
  const id = uuid.parse(path[1]);
  const [stream] =
    await sql`SELECT id,host_id,host_key,title,ended_at,seen_at>now()-interval '40 seconds' fresh FROM live_streams WHERE id=${id} AND telejka_can_view(host_id,${userId}::uuid)`;
  if (!stream) throw new FeatureError(404, "Эфир недоступен.");
  const host = stream.host_id === userId && input.hostKey === stream.host_key;
  if (path[2] === "end" && method === "POST") {
    if (!host)
      throw new FeatureError(
        403,
        "Завершить эфир может только ведущий на устройстве трансляции.",
      );
    await sql.begin(async (tx) => {
      await tx`UPDATE live_streams SET ended_at=COALESCE(ended_at,now()) WHERE id=${id}`;
      await tx`DELETE FROM live_stream_peers WHERE stream_id=${id}`;
    });
    return json({ ok: true });
  }
  if (path[2] === "leave" && method === "POST") {
    const peerId = uuid.parse(input.peerId);
    await sql`DELETE FROM live_stream_peers WHERE id=${peerId} AND stream_id=${id} AND user_id=${userId}`;
    return json({ ok: true });
  }
  if (stream.ended_at || !stream.fresh) {
    if (path[2] === "sync")
      return json({ ended: true, peers: [], messages: [], viewers: 0 });
    throw new FeatureError(410, "Эфир завершён.");
  }
  if (path[2] === "join" && method === "POST") {
    const d = z
      .object({ peerId: uuid, offer: description("offer") })
      .strict()
      .parse(input);
    await sql.begin(async (tx) => {
      const [live] =
        await tx`SELECT id FROM live_streams WHERE id=${id} AND ended_at IS NULL AND seen_at>now()-interval '40 seconds' FOR UPDATE`;
      if (!live) throw new FeatureError(410, "Эфир завершён.");
      await tx`DELETE FROM live_stream_peers WHERE stream_id=${id} AND seen_at<now()-interval '30 seconds'`;
      const [old] =
        await tx`SELECT user_id,stream_id FROM live_stream_peers WHERE id=${d.peerId}`;
      if (old) {
        if (old.user_id === userId && old.stream_id === id) return;
        throw new FeatureError(409, "Соединение уже существует.");
      }
      const [count] =
        await tx`SELECT count(*)::int n FROM live_stream_peers WHERE stream_id=${id}`;
      if (count.n >= 8)
        throw new FeatureError(
          409,
          "Все 8 мест в эфире заняты. Попробуй позже.",
        );
      await tx`INSERT INTO live_stream_peers(id,stream_id,user_id,offer) VALUES(${d.peerId},${id},${userId},${tx.json(d.offer)})`;
    });
    return json({ ok: true });
  }
  if (path[2] === "sync" && method === "POST") {
    const d = z
      .object({
        hostKey: uuid.optional(),
        peerId: uuid.optional(),
        after: z
          .string()
          .regex(/^\d{1,18}$/)
          .default("0"),
        ack: z.boolean().default(false),
        ready: z.boolean().default(false),
        answers: z
          .array(z.object({ peerId: uuid, answer: description("answer") }))
          .max(8)
          .default([]),
      })
      .strict()
      .parse(input);
    if (host) {
      const updated =
        await sql`UPDATE live_streams SET seen_at=now() WHERE id=${id} AND ended_at IS NULL AND seen_at>now()-interval '40 seconds' RETURNING id`;
      if (!updated.length)
        return json({ ended: true, peers: [], messages: [], viewers: 0 });
      await sql`DELETE FROM live_stream_peers WHERE stream_id=${id} AND (seen_at<now()-interval '30 seconds' OR NOT telejka_can_view(${userId}::uuid,user_id))`;
      for (const a of d.answers)
        await sql`UPDATE live_stream_peers SET answer=${sql.json(a.answer)} WHERE id=${a.peerId} AND stream_id=${id} AND answer IS NULL`;
    } else {
      if (!d.peerId || d.answers.length || d.hostKey)
        throw new FeatureError(403, "Нет доступа к управлению эфиром.");
      const updated =
        await sql`UPDATE live_stream_peers SET seen_at=now(),ready=${d.ready} WHERE id=${d.peerId} AND stream_id=${id} AND user_id=${userId} RETURNING id`;
      if (!updated.length)
        throw new FeatureError(409, "Подключение истекло. Подключись заново.");
    }
    const peers = host
      ? await sql`SELECT id,CASE WHEN answer IS NULL THEN offer ELSE NULL END offer FROM live_stream_peers WHERE stream_id=${id}`
      : [];
    const [peer] =
      !host && !d.ack
        ? await sql`SELECT answer FROM live_stream_peers WHERE id=${d.peerId!} AND user_id=${userId}`
        : [];
    const [count] =
      await sql`SELECT count(*)::int n FROM live_stream_peers WHERE stream_id=${id} AND ready AND seen_at>now()-interval '30 seconds'`;
    const messages =
      await sql`SELECT m.id::text,m.body,m.created_at,json_build_object('id',u.id,'name',u.name,'color',u.color,'verified',u.verified) author FROM live_stream_messages m JOIN users u ON u.id=m.user_id WHERE m.stream_id=${id} AND m.id>${d.after}::bigint AND telejka_can_view(u.id,${userId}::uuid) ORDER BY m.id DESC LIMIT 50`;
    return json({
      ended: false,
      peers,
      answer: peer?.answer || null,
      viewers: count.n,
      messages: messages.reverse(),
    });
  }
  if (path[2] === "messages" && method === "POST") {
    const d = z
      .object({
        id: uuid,
        body: z.string().trim().min(1).max(500),
        hostKey: uuid.optional(),
        peerId: uuid.optional(),
      })
      .strict()
      .parse(input);
    if (!host) {
      const [peer] = d.peerId
        ? await sql`SELECT 1 FROM live_stream_peers WHERE id=${d.peerId} AND stream_id=${id} AND user_id=${userId} AND seen_at>now()-interval '30 seconds'`
        : [];
      if (!peer) throw new FeatureError(403, "Сначала подключись к эфиру.");
    }
    await sql.begin(async (tx) => {
      await tx`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
      const [old] =
        await tx`SELECT user_id,stream_id FROM live_stream_messages WHERE request_id=${d.id}`;
      if (old) {
        if (old.user_id === userId && old.stream_id === id) return;
        throw new FeatureError(409, "Сообщение уже существует.");
      }
      const [fast] =
        await tx`SELECT 1 FROM live_stream_messages WHERE stream_id=${id} AND user_id=${userId} AND created_at>now()-interval '2 seconds' LIMIT 1`;
      if (fast)
        throw new FeatureError(
          429,
          "Подожди пару секунд перед следующим сообщением.",
        );
      await tx`INSERT INTO live_stream_messages(request_id,stream_id,user_id,body) VALUES(${d.id},${id},${userId},${d.body})`;
      await tx`DELETE FROM live_stream_messages WHERE stream_id=${id} AND id NOT IN (SELECT id FROM live_stream_messages WHERE stream_id=${id} ORDER BY id DESC LIMIT 200)`;
    });
    return json({ ok: true });
  }
  throw new FeatureError(404, "Действие не найдено.");
}
