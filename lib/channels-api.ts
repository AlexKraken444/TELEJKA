import { NextRequest, NextResponse, after } from "next/server";
import sharp from "sharp";
import { avatarSchema } from "./validation";
import { z } from "zod";
import { db } from "./db";
import { FeatureError } from "./api-error";
import { sendChannelPush } from "./push-api";
const uuid = z.uuid();
const json = (v: unknown) =>
  NextResponse.json(v, { headers: { "Cache-Control": "no-store" } });
export async function channelsApi(
  req: NextRequest,
  path: string[],
  input: Record<string, unknown>,
  userId: string,
) {
  if (path[0] !== "channels") return;
  const sql = db();
  if (path.length === 1) {
    if (req.method === "GET")
      return json(
        await sql`SELECT c.*,(SELECT count(*)::int FROM channel_members WHERE channel_id=c.id) subscribers,EXISTS(SELECT 1 FROM channel_members WHERE channel_id=c.id AND user_id=${userId}) subscribed FROM channels c ORDER BY c.created_at DESC LIMIT 100`,
      );
    if (req.method === "POST") {
      const data = z
        .object({
          title: z.string().trim().min(1).max(80),
          description: z.string().trim().max(500).default(""),
          avatar: avatarSchema,
        })
        .strict()
        .parse(input);
      const avatar = await channelAvatar(data.avatar);
      const result = await sql.begin(async (tx) => {
        const [me] =
          await tx`SELECT plus_until>now() active FROM users WHERE id=${userId} FOR UPDATE`;
        if (!me?.active)
          throw new FeatureError(403, "Создание каналов доступно с PLUS.");
        const [c] =
          await tx`INSERT INTO channels(owner_id,title,description,avatar) VALUES(${userId},${data.title},${data.description},${avatar}) RETURNING *`;
        await tx`INSERT INTO channel_members(channel_id,user_id) VALUES(${c.id},${userId})`;
        return c;
      });
      return json(result);
    }
  }
  const channelId = uuid.parse(path[1]);
  const [channel] =
    await sql`SELECT c.*,(SELECT count(*)::int FROM channel_members WHERE channel_id=c.id) subscribers,EXISTS(SELECT 1 FROM channel_members WHERE channel_id=c.id AND user_id=${userId}) subscribed,COALESCE((SELECT notifications FROM channel_members WHERE channel_id=c.id AND user_id=${userId}),false) notifications FROM channels c WHERE c.id=${channelId}`;
  if (!channel) throw new FeatureError(404, "Канал не найден.");
  if (path.length === 2 && req.method === "GET") return json(channel);
  if (path.length === 2 && req.method === "PATCH") {
    if (channel.owner_id !== userId)
      throw new FeatureError(403, "Изменять канал может только владелец.");
    const data = z
      .object({
        title: z.string().trim().min(1).max(80),
        description: z.string().trim().max(500),
        avatar: avatarSchema,
      })
      .strict()
      .parse(input);
    const avatar = await channelAvatar(data.avatar);
    await sql`UPDATE channels SET title=${data.title},description=${data.description},avatar=${avatar} WHERE id=${channelId}`;
    return json({ ok: true });
  }
  if (path.length === 2 && req.method === "DELETE") {
    if (channel.owner_id !== userId)
      throw new FeatureError(403, "Удалить канал может только владелец.");
    await sql`DELETE FROM channels WHERE id=${channelId}`;
    return json({ ok: true });
  }
  if (
    path[2] === "subscription" &&
    path.length === 3 &&
    req.method === "POST"
  ) {
    const data = z
      .object({
        subscribed: z.boolean(),
        notifications: z.boolean().default(true),
      })
      .strict()
      .parse(input);
    if (data.subscribed)
      await sql`INSERT INTO channel_members(channel_id,user_id,notifications) VALUES(${channelId},${userId},${data.notifications}) ON CONFLICT(channel_id,user_id) DO UPDATE SET notifications=EXCLUDED.notifications`;
    else
      await sql`DELETE FROM channel_members WHERE channel_id=${channelId} AND user_id=${userId}`;
    return json({ ok: true });
  }
  if (path[2] === "posts" && path.length === 3) {
    if (req.method === "GET") {
      const before = req.nextUrl.searchParams.get("before");
      if (before) z.iso.datetime({ offset: true }).parse(before);
      return json(
        await sql`SELECT p.*,(SELECT count(*)::int FROM channel_comments WHERE post_id=p.id) comment_count FROM channel_posts p WHERE p.channel_id=${channelId} AND (${before}::timestamptz IS NULL OR p.created_at<${before}::timestamptz) ORDER BY p.created_at DESC LIMIT 30`,
      );
    }
    if (req.method === "POST") {
      if (channel.owner_id !== userId)
        throw new FeatureError(
          403,
          "Публиковать может только владелец канала.",
        );
      const data = z
        .object({
          body: z.string().trim().max(5000),
          requestId: uuid,
          attachmentIds: z.array(uuid).max(4).default([]),
        })
        .strict()
        .parse(input);
      if (!data.body && !data.attachmentIds.length)
        throw new FeatureError(400, "Добавь текст или фото / видео.");
      let inserted = false;
      const post = await sql.begin(async (tx) => {
        await tx`SELECT id FROM channels WHERE id=${channelId} FOR UPDATE`;
        const [old] =
          await tx`SELECT * FROM channel_posts WHERE channel_id=${channelId} AND request_id=${data.requestId}`;
        if (old) return old;
        const ids = [...new Set(data.attachmentIds)];
        const files = ids.length
          ? await tx`SELECT id,name,mime,size FROM uploads WHERE id IN ${tx(ids)} AND owner_id=${userId} AND chat_id IS NULL AND ready AND NOT published AND (mime LIKE 'image/%' OR mime LIKE 'video/%') FOR UPDATE`
          : [];
        if (files.length !== ids.length)
          throw new FeatureError(400, "Файл недоступен.");
        const [created] =
          await tx`INSERT INTO channel_posts(channel_id,body,request_id,attachments) VALUES(${channelId},${data.body},${data.requestId},${tx.json(files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size })))}) RETURNING *`;
        if (ids.length)
          await tx`UPDATE uploads SET published=true WHERE id IN ${tx(ids)}`;
        inserted = true;
        return created;
      });
      if (inserted)
        after(async () => {
          try {
            await sendChannelPush(channelId, post.id);
          } catch {
            console.error("Channel notification failed");
          }
        });
      return json(
        post ||
          (
            await sql`SELECT * FROM channel_posts WHERE channel_id=${channelId} AND request_id=${data.requestId}`
          )[0],
      );
    }
  }
  if (path[2] === "posts" && path[3]) {
    const postId = uuid.parse(path[3]);
    const [post] =
      await sql`SELECT id FROM channel_posts WHERE id=${postId} AND channel_id=${channelId}`;
    if (!post) throw new FeatureError(404, "Публикация не найдена.");
    if (path.length === 4 && req.method === "DELETE") {
      if (channel.owner_id !== userId)
        throw new FeatureError(403, "Нет доступа.");
      await sql`DELETE FROM channel_posts WHERE id=${postId}`;
      return json({ ok: true });
    }
    if (path[4] === "comments" && path.length === 5) {
      if (req.method === "GET")
        return json(
          await sql`SELECT c.id,c.body,c.created_at,telejka_user(c.user_id,${userId}::uuid) author FROM channel_comments c WHERE c.post_id=${postId} ORDER BY c.created_at DESC LIMIT 100`,
        );
      if (req.method === "POST") {
        const data = z
          .object({ body: z.string().trim().min(1).max(2000) })
          .strict()
          .parse(input);
        const [row] =
          await sql`INSERT INTO channel_comments(post_id,user_id,body) VALUES(${postId},${userId},${data.body}) RETURNING id`;
        return json(row);
      }
    }
  }
  throw new FeatureError(404, "Действие не найдено.");
}

async function channelAvatar(value: string | null | undefined) {
  if (!value) return null;
  try {
    const b = await sharp(Buffer.from(value.split(",")[1], "base64"), {
      limitInputPixels: 16000000,
    })
      .rotate()
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 80 })
      .toBuffer();
    return "data:image/webp;base64," + b.toString("base64");
  } catch {
    throw new FeatureError(400, "Не удалось прочитать аватар канала.");
  }
}
