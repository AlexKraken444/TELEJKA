import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { FeatureError } from "./api-error";
export { FeatureError } from "./api-error";
import { canSendChat } from "./community-api";
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const id = z.uuid(),
  b64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);
export const envelopeSchema = z
  .object({
    v: z.literal(1),
    iv: b64.length(16),
    ciphertext: b64.min(24).max(50000),
    keys: z.record(id, b64.min(344).max(344)),
  })
  .strict();
async function membership(chatId: string, userId: string) {
  const [m] =
    await db()`SELECT 1 FROM members WHERE conversation_id=${chatId} AND user_id=${userId}`;
  if (!m) throw new FeatureError(404, "Чат не найден.");
}
export async function attachmentMetadata(
  ids: unknown,
  userId: string,
  chatId: string | null = null,
) {
  const list = z
    .array(id)
    .max(4)
    .parse(ids ?? []);
  if (new Set(list).size !== list.length)
    throw new FeatureError(400, "Вложение указано дважды.");
  if (!list.length) return [];
  const sql = db();
  const rows =
    await sql`SELECT id,name,mime,size FROM uploads WHERE id IN ${sql(list)} AND owner_id=${userId} AND ready=true AND published=false AND chat_id IS NOT DISTINCT FROM ${chatId}::uuid`;
  if (rows.length !== list.length)
    throw new FeatureError(400, "Вложения недоступны или ещё загружаются.");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    mime: r.mime,
    size: r.size,
  }));
}
export async function featureApi(
  req: NextRequest,
  path: string[],
  input: Record<string, unknown>,
  userId: string,
): Promise<Response | undefined> {
  const sql = db(),
    route = path.join("/");
  if (route === "devices" && req.method === "POST") {
    const data = z
      .object({
        id,
        publicKey: z
          .object({
            kty: z.literal("RSA"),
            n: z.string().regex(/^[A-Za-z0-9_-]{342}$/),
            e: z.literal("AQAB"),
            alg: z.literal("RSA-OAEP-256").optional(),
            ext: z.boolean().optional(),
            key_ops: z.array(z.literal("encrypt")).optional(),
          })
          .strict(),
      })
      .parse(input);
    const [existing] =
      await sql`SELECT user_id,public_key FROM device_keys WHERE id=${data.id}`;
    if (existing) {
      if (
        existing.user_id !== userId ||
        existing.public_key.n !== data.publicKey.n
      )
        throw new FeatureError(409, "Ключ устройства не совпадает.");
    } else {
      const [count] =
        await sql`SELECT count(*)::int n FROM device_keys WHERE user_id=${userId}`;
      if (count.n >= 10)
        throw new FeatureError(
          400,
          "Достигнут лимит 10 устройств. Импортируйте ключ с другого устройства.",
        );
      await sql`INSERT INTO device_keys(id,user_id,public_key) VALUES (${data.id},${userId},${sql.json(data.publicKey)}) ON CONFLICT DO NOTHING`;
    }
    return reply({ ok: true });
  }
  if (path[0] === "chats" && path[2] === "keys" && req.method === "GET") {
    const chatId = id.parse(path[1]);
    await membership(chatId, userId);
    return reply(
      await sql`SELECT d.id,d.user_id,d.public_key FROM device_keys d JOIN members m ON m.user_id=d.user_id WHERE m.conversation_id=${chatId} ORDER BY d.user_id,d.id`,
    );
  }
  if (route === "notifications" && req.method === "POST") {
    // Claim rows atomically: a reload or second tab cannot show a notification twice.
    return reply(
      await sql`WITH candidates AS (
    SELECT m.id FROM messages m JOIN members mb ON mb.conversation_id=m.conversation_id
    WHERE mb.user_id=${userId} AND m.user_id<>${userId}
    AND (mb.cleared_at IS NULL OR m.created_at>mb.cleared_at)
    AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=${userId} AND b.blocked_id=m.user_id) OR (b.blocked_id=${userId} AND b.user_id=m.user_id))
    AND m.created_at >= (SELECT notification_since FROM users WHERE id=${userId})
    AND NOT EXISTS(SELECT 1 FROM notification_deliveries nd WHERE nd.user_id=${userId} AND nd.message_id=m.id)
    ORDER BY m.created_at,m.id LIMIT 30
   ), claimed AS (
    INSERT INTO notification_deliveries(user_id,message_id) SELECT ${userId},id FROM candidates ON CONFLICT DO NOTHING RETURNING message_id
   ) SELECT m.id,m.conversation_id,u.name FROM messages m JOIN claimed c ON c.message_id=m.id JOIN users u ON u.id=m.user_id ORDER BY m.created_at`,
    );
  }
  if (route === "uploads" && req.method === "POST") {
    const data = z
      .object({
        name: z.string().min(1).max(160),
        mime: z.string().max(100),
        size: z.number().int().min(1).max(26214416),
        chatId: id.nullable().default(null),
      })
      .parse(input);
    if (data.chatId) await membership(data.chatId, userId);
    else if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "video/mp4",
        "video/webm",
        "video/ogg",
        "video/quicktime",
      ].includes(data.mime)
    )
      throw new FeatureError(
        400,
        "Для постов и комментариев разрешены фото и видео.",
      );
    const [created] = await sql.begin(async (tx) => {
      await tx`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
      const [usage] =
        await tx`SELECT COALESCE(sum(size),0)::bigint total,COALESCE(sum(size) FILTER(WHERE created_at>now()-interval '1 day'),0)::bigint daily FROM uploads WHERE owner_id=${userId}`;
      if (
        Number(usage.daily) + data.size > 104857600 ||
        Number(usage.total) + data.size > 1073741824
      )
        throw new FeatureError(
          429,
          "Лимит вложений: 100 МБ в сутки и 1 ГБ на аккаунт.",
        );
      return await tx`INSERT INTO uploads(owner_id,chat_id,name,mime,size,chunks) VALUES (${userId},${data.chatId},${data.chatId ? "encrypted" : data.name},${data.chatId ? "application/octet-stream" : data.mime},${data.size},${Math.ceil(data.size / 262144)}) RETURNING id,chunks`;
    });
    return reply(created, 201);
  }
  if (path[0] === "uploads" && path[1]) {
    const uploadId = id.parse(path[1]);
    const [file] = await sql`SELECT * FROM uploads WHERE id=${uploadId}`;
    if (!file) throw new FeatureError(404, "Файл не найден.");
    if (req.method === "GET") {
      if (file.owner_id !== userId) {
        if (!file.published || !file.ready)
          throw new FeatureError(404, "Файл не найден.");
        if (file.chat_id) await membership(file.chat_id, userId);
        else {
          const [visible] =
            await sql`SELECT 1 FROM posts p WHERE p.attachments @> ${sql.json([{ id: uploadId }])}::jsonb AND telejka_can_view(p.user_id,${userId}::uuid)
          UNION ALL SELECT 1 FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.attachments @> ${sql.json([{ id: uploadId }])}::jsonb AND telejka_can_view(p.user_id,${userId}::uuid) AND telejka_can_view(c.user_id,${userId}::uuid) LIMIT 1`;
          if (!visible) throw new FeatureError(404, "Файл недоступен.");
        }
      }
      if (path.length === 2)
        return reply({
          id: file.id,
          name: file.name,
          mime: file.mime,
          size: file.size,
          chunks: file.chunks,
        });
      const idx = z.coerce
        .number()
        .int()
        .min(0)
        .max(file.chunks - 1)
        .parse(path[2]);
      const [chunk] =
        await sql`SELECT data FROM upload_chunks WHERE upload_id=${uploadId} AND idx=${idx}`;
      if (!chunk) throw new FeatureError(404, "Часть файла не найдена.");
      return reply({ data: Buffer.from(chunk.data).toString("base64") });
    }
    if (file.owner_id !== userId)
      throw new FeatureError(404, "Файл не найден.");
    if (req.method === "POST" && path[2] === "complete") {
      const [count] =
        await sql`SELECT count(*)::int n,COALESCE(sum(octet_length(data)),0)::int size FROM upload_chunks WHERE upload_id=${uploadId}`;
      if (count.n !== file.chunks || count.size !== file.size)
        throw new FeatureError(400, "Файл загружен не полностью.");
      await sql`UPDATE uploads SET ready=true WHERE id=${uploadId}`;
      return reply({ ok: true });
    }
    if (req.method === "POST" && path[2]) {
      if (file.ready) throw new FeatureError(409, "Файл уже завершён.");
      const idx = z.coerce
        .number()
        .int()
        .min(0)
        .max(file.chunks - 1)
        .parse(path[2]);
      const data = Buffer.from(b64.max(349528).parse(input.data), "base64");
      const expected =
        idx === file.chunks - 1 ? file.size - idx * 262144 : 262144;
      if (data.length !== expected)
        throw new FeatureError(400, "Неверный размер части файла.");
      await sql`INSERT INTO upload_chunks(upload_id,idx,data) VALUES (${uploadId},${idx},${data}) ON CONFLICT(upload_id,idx) DO NOTHING`;
      return reply({ ok: true });
    }
  }
  if (path[0] === "chats" && path[2] === "messages" && req.method === "POST") {
    const chatId = id.parse(path[1]);
    await membership(chatId, userId);
    await canSendChat(chatId, userId);
    const data = z
      .object({
        envelope: envelopeSchema,
        clientId: id,
        attachmentIds: z.array(id).max(4).default([]),
      })
      .strict()
      .parse(input);
    const devices =
      await sql`SELECT d.id,d.user_id FROM device_keys d JOIN members m ON m.user_id=d.user_id WHERE m.conversation_id=${chatId}`;
    const members =
      await sql`SELECT user_id FROM members WHERE conversation_id=${chatId}`;
    if (members.some((m) => !devices.some((d) => d.user_id === m.user_id)))
      throw new FeatureError(
        409,
        "Все участники должны хотя бы один раз открыть обновлённую TELEJKA для создания ключей.",
      );
    if (
      Object.keys(data.envelope.keys).length !== devices.length ||
      devices.some((d) => !data.envelope.keys[d.id])
    )
      throw new FeatureError(
        409,
        "Список устройств изменился. Отправьте сообщение ещё раз.",
      );
    const [previous] =
      await sql`SELECT id FROM messages WHERE user_id=${userId} AND client_id=${data.clientId}`;
    if (previous) return reply(previous);
    await attachmentMetadata(data.attachmentIds, userId, chatId);
    const result = await sql.begin(async (tx) => {
      const [message] =
        await tx`INSERT INTO messages(conversation_id,user_id,body,envelope,client_id) VALUES (${chatId},${userId},'🔒 Зашифрованное сообщение',${tx.json(data.envelope)},${data.clientId}) ON CONFLICT(user_id,client_id) WHERE client_id IS NOT NULL DO UPDATE SET client_id=EXCLUDED.client_id RETURNING id`;
      if (data.attachmentIds.length) {
        const claimed =
          await tx`UPDATE uploads SET published=true WHERE id IN ${tx(data.attachmentIds)} AND owner_id=${userId} AND published=false RETURNING id`;
        if (claimed.length !== data.attachmentIds.length)
          throw new FeatureError(409, "Вложение уже опубликовано.");
      }
      return message;
    });
    return reply(result, 201);
  }
}
