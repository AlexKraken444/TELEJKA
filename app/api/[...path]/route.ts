import { communityApi, canContact, canReadPost } from "@/lib/community-api";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { createHash, randomInt } from "node:crypto";
import { db, databaseUrl, ensureDatabase } from "@/lib/db";
import { canManageVerification } from "@/lib/verification";
import { COOKIE, createSession, currentUser, hashToken } from "@/lib/auth";
import {
  registerSchema,
  profileSchema,
  bodySchema,
  idSchema,
  nameKey,
  nameSchema,
  passwordSchema,
} from "@/lib/validation";

import {
  featureApi,
  FeatureError,
  attachmentMetadata,
} from "@/lib/feature-api";
export const runtime = "nodejs";
export const maxDuration=60;
export const dynamic = "force-dynamic";
class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
const SHARED_BACKEND = "https://1234news.vercel.app/api/telejka";
async function boundedBody(req: NextRequest) {
  if (Number(req.headers.get("content-length")) > 450000)
    throw new ApiError(413, "Запрос слишком большой.");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 450000) {
        await reader.cancel();
        throw new ApiError(413, "Запрос слишком большой.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes;
}
async function proxyToSharedBackend(req: NextRequest, path: string[]) {
  const headers = new Headers();
  for (const name of ["content-type"]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const session = req.cookies.get(COOKIE)?.value;
  if (session && /^[a-f0-9]{64}$/.test(session)) {
    headers.set("cookie", `${COOKIE}=${session}`);
  }
  const target = `${SHARED_BACKEND}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body:
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : await boundedBody(req),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  const responseHeaders = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": upstream.headers.get("content-type") || "application/json",
  });
  const setCookie = upstream.headers.get("set-cookie");
  const retry = upstream.headers.get("retry-after");
  if (retry) responseHeaders.set("retry-after", retry);
  if (setCookie?.startsWith(`${COOKIE}=`))
    responseHeaders.set("set-cookie", setCookie);
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
async function rateLimit(key: string, max: number, seconds: number) {
  const [row] =
    await db()`INSERT INTO rate_limits(key, count, resets_at) VALUES (${key}, 1, ${new Date(Date.now() + seconds * 1000)}) ON CONFLICT (key) DO UPDATE SET count = CASE WHEN rate_limits.resets_at < now() THEN 1 ELSE rate_limits.count + 1 END, resets_at = CASE WHEN rate_limits.resets_at < now() THEN EXCLUDED.resets_at ELSE rate_limits.resets_at END RETURNING count`;
  if (row.count > max)
    throw new ApiError(429, "Слишком много попыток. Подождите немного.");
}
async function safeAvatar(data?: string | null) {
  if (!data) return null;
  try {
    const buffer = await sharp(Buffer.from(data.split(",")[1], "base64"), {
      limitInputPixels: 16000000,
    })
      .rotate()
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 80 })
      .toBuffer();
    return `data:image/webp;base64,${buffer.toString("base64")}`;
  } catch {
    throw new ApiError(
      400,
      "Не удалось прочитать аватарку. Выберите другое изображение.",
    );
  }
}
async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await ctx.params).path;
    const route = path.join("/");
    const writing = req.method !== "GET";
    if (writing) {
      const origin = req.headers.get("origin");
      if (origin && origin !== req.nextUrl.origin)
        throw new ApiError(403, "Недопустимый источник запроса.");
    }
    if (!databaseUrl()) return await proxyToSharedBackend(req, path);
    let input: Record<string, unknown> = {};
    if (writing && req.method !== "DELETE") {
      const text = new TextDecoder().decode(await boundedBody(req));
      if (text.length > 450000)
        throw new ApiError(413, "Файл слишком большой.");
      try {
        input = JSON.parse(text || "{}");
      } catch {
        throw new ApiError(400, "Неверный формат запроса.");
      }
    }
    await ensureDatabase();
    const sql = db();
    if (route === "auth/register" && req.method === "POST") {
      const ip =
        req.headers.get("x-vercel-forwarded-for") ??
        req.headers.get("x-forwarded-for")?.split(",")[0] ??
        "local";
      await rateLimit(`register:${ip}`, 15, 3600);
      const data = registerSchema.parse(input);
      const [taken] =
        await sql`SELECT 1 FROM users WHERE name_key=${nameKey(data.name)}`;
      if (taken)
        throw new ApiError(409, "Это имя уже занято. Выберите другое.");
      const avatar = await safeAvatar(data.avatar);
      const hash = await bcrypt.hash(data.password, 12);
      const colors = [
        "#d8efac",
        "#ffd4b8",
        "#c6d7ff",
        "#efc9ed",
        "#bce7dc",
        "#f5dc95",
      ];
      const user = await sql.begin(async (tx) => {
        const [created] =
          await tx`INSERT INTO users(name,name_key,bio,avatar,color) VALUES (${data.name},${nameKey(data.name)},${data.bio},${avatar},${colors[randomInt(colors.length)]}) RETURNING id,name,bio,avatar,color`;
        await tx`INSERT INTO telejka_auth.credentials(user_id,password_hash) VALUES (${created.id},${hash})`;
        return created;
      });
      await createSession(user.id);
      return json(user, 201);
    }
    if (route === "auth/login" && req.method === "POST") {
      const name = nameSchema.parse(input.name);
      const password = passwordSchema.parse(input.password);
      const ip =
        req.headers.get("x-vercel-forwarded-for") ??
        req.headers.get("x-forwarded-for")?.split(",")[0] ??
        "local";
      await rateLimit(`login-ip:${ip}`, 40, 900);
      await rateLimit(
        `login-name:${createHash("sha256").update(nameKey(name)).digest("hex")}`,
        20,
        900,
      );
      const [user] =
        await sql`SELECT u.*,c.password_hash AS password_hash FROM users u JOIN telejka_auth.credentials c ON c.user_id=u.id WHERE u.name_key = ${nameKey(name)}`;
      const valid = await bcrypt.compare(
        password,
        user?.password_hash ??
          "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW",
      );
      if (!user || !valid) throw new ApiError(401, "Неверное имя или пароль.");
      await createSession(user.id);
      return json({
        id: user.id,
        name: user.name,
        bio: user.bio,
        avatar: user.avatar,
        color: user.color,
        verified: user.verified,
        can_manage_verification: canManageVerification(user.id),
      });
    }
    const user = await currentUser();
    if (!user) throw new ApiError(401, "Войдите в аккаунт.");
    await rateLimit(
      `${path[0] === "uploads" ? "upload" : writing ? "write" : "read"}:${user.id}`,
      path[0] === "uploads" ? 1200 : writing ? 120 : 360,
      60,
    );
    const community = await communityApi(req, path, input, user.id);
    if (community) return community;
    const feature = await featureApi(req, path, input, user.id);
    if (feature) return feature;
    if (route === "auth/logout" && req.method === "POST") {
      const jar = await cookies();
      const token = jar.get(COOKIE)?.value;
      if (token)
        await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
      jar.delete(COOKIE);
      return json({ ok: true });
    }
    if (route === "me" && req.method === "GET") return json(user);
    if (route === "me" && req.method === "PATCH") {
      const data = profileSchema.parse(input);
      const avatar = await safeAvatar(data.avatar);
      const [updated] =
        await sql`UPDATE users SET name = ${data.name}, name_key = ${nameKey(data.name)}, bio = ${data.bio}, avatar = ${avatar} WHERE id = ${user.id} RETURNING id, name, bio, avatar, color, verified`;
      return json(await currentUser());
    }
    if (
      path[0] === "users" &&
      path.length === 3 &&
      path[2] === "verification" &&
      req.method === "PATCH"
    ) {
      if (!canManageVerification(user.id))
        throw new ApiError(
          403,
          "Только владелец TELEJKA может управлять галочками.",
        );
      const id = idSchema.parse(path[1]);
      const { verified } = z
        .object({ verified: z.boolean() })
        .strict()
        .parse(input);
      const [updated] =
        await sql`UPDATE users SET verified=${verified} WHERE id=${id} RETURNING id,verified`;
      if (!updated) throw new ApiError(404, "Пользователь не найден.");
      return json(updated);
    }
    if (path[0] === "users" && path.length === 2 && req.method === "GET") {
      const id = idSchema.parse(path[1]);
      const [profile] =
        await sql`SELECT telejka_user(u.id,${user.id}::uuid) AS person,u.created_at,(SELECT count(*)::int FROM posts p WHERE p.user_id=u.id AND telejka_can_view(u.id,${user.id}::uuid)) AS post_count FROM users u WHERE u.id=${id}`;
      if (!profile) throw new ApiError(404, "Пользователь не найден.");
      return json({
        ...profile.person,
        created_at: profile.created_at,
        post_count: profile.post_count,
      });
    }
    if (route === "users" && req.method === "GET") {
      const search = (req.nextUrl.searchParams.get("q") ?? "")
        .trim()
        .slice(0, 32);
      return json(
        (
          await sql`SELECT telejka_user(id,${user.id}::uuid) AS person FROM users WHERE id <> ${user.id} AND position(${nameKey(search)} in name_key) > 0 ORDER BY created_at DESC LIMIT 40`
        ).map((r) => r.person),
      );
    }
    if (route === "hashtags" && req.method === "GET") {
      return json(
        await sql`SELECT lower(matches[2]) AS tag, count(DISTINCT p.id)::int AS posts
        FROM posts p CROSS JOIN LATERAL regexp_matches(p.body, '(^|[^[:alnum:]_])#([[:alnum:]_]+)', 'g') AS matches
        WHERE telejka_can_view(p.user_id,${user.id}::uuid) GROUP BY lower(matches[2]) ORDER BY posts DESC, tag ASC LIMIT 10`,
      );
    }
    if (route === "posts" && req.method === "GET") {
      const offset = Math.min(
        100000,
        Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0),
      );
      const mine = req.nextUrl.searchParams.get("mine") === "true";
      const authorParam = req.nextUrl.searchParams.get("author");
      const author = authorParam ? idSchema.parse(authorParam) : null;
      return json(
        await sql`SELECT p.*, (SELECT id FROM polls WHERE post_id=p.id) poll_id, telejka_post_reactions(p.id,${user.id}::uuid) AS reactions, telejka_user(u.id,${user.id}::uuid) AS author, (SELECT count(*)::int FROM likes l WHERE l.post_id = p.id) AS likes, (SELECT count(*)::int FROM comments c WHERE c.post_id = p.id) AS comments, EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ${user.id}) AS liked FROM posts p JOIN users u ON u.id = p.user_id WHERE telejka_can_view(p.user_id,${user.id}::uuid) AND (${!mine} OR p.user_id = ${user.id}) AND (${author}::uuid IS NULL OR p.user_id=${author}::uuid) ORDER BY p.created_at DESC, p.id DESC LIMIT 20 OFFSET ${offset}`,
      );
    }
    if (route === "posts" && req.method === "POST") {
      const body = z
        .string()
        .trim()
        .max(2000)
        .parse(input.body ?? "");
      const attachments = await attachmentMetadata(
        input.attachmentIds,
        user.id,
      );
      if (!body && !attachments.length)
        throw new ApiError(400, "Добавьте текст, фото или видео.");
      const post = await sql.begin(async (tx) => {
        const [created] =
          await tx`INSERT INTO posts(user_id,body,attachments) VALUES (${user.id},${body},${tx.json(attachments)}) RETURNING id`;
        if (attachments.length) {
          const claimed =
            await tx`UPDATE uploads SET published=true WHERE id IN ${tx(attachments.map((a) => a.id))} AND published=false RETURNING id`;
          if (claimed.length !== attachments.length)
            throw new ApiError(409, "Вложение уже опубликовано.");
        }
        return created;
      });
      return json(post, 201);
    }
    if (path[0] === "posts" && path[1]) {
      const id = idSchema.parse(path[1]);
      if (path.length === 2 && req.method === "DELETE") {
        await sql.begin(async (tx) => {
          const [post] =
            await tx`SELECT attachments FROM posts WHERE id=${id} AND user_id=${user.id} FOR UPDATE`;
          if (!post) throw new ApiError(404, "Пост не найден.");
          const comments =
            await tx`SELECT attachments FROM comments WHERE post_id=${id}`;
          const ids = [post, ...comments].flatMap((r) =>
            (r.attachments as { id: string }[]).map((a) => a.id),
          );
          await tx`DELETE FROM posts WHERE id=${id}`;
          if (ids.length)
            await tx`DELETE FROM uploads WHERE id IN ${tx(ids)} AND chat_id IS NULL`;
        });
        return json({ ok: true });
      }
      await canReadPost(id, user.id);
      const [post] = await sql`SELECT id FROM posts WHERE id = ${id}`;
      if (!post) throw new ApiError(404, "Пост не найден.");
      if (path[2] === "like" && req.method === "POST") {
        const liked = z.boolean().parse(input.liked);
        if (liked)
          await sql`INSERT INTO likes(post_id, user_id) VALUES (${id}, ${user.id}) ON CONFLICT DO NOTHING`;
        else
          await sql`DELETE FROM likes WHERE post_id = ${id} AND user_id = ${user.id}`;
        return json({ ok: true });
      }
      if (path[2] === "comments" && req.method === "GET") {
        const offset = Math.max(
          0,
          Number(req.nextUrl.searchParams.get("offset")) || 0,
        );
        return json(
          await sql`SELECT c.id, c.body, c.attachments, c.created_at, telejka_user(u.id,${user.id}::uuid) AS author FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ${id} AND telejka_can_view(c.user_id,${user.id}::uuid) ORDER BY c.created_at, c.id LIMIT 50 OFFSET ${offset}`,
        );
      }
      if (path[2] === "comments" && req.method === "POST") {
        const body = z
          .string()
          .trim()
          .max(1000)
          .parse(input.body ?? "");
        const attachments = await attachmentMetadata(
          input.attachmentIds,
          user.id,
        );
        if (!body && !attachments.length)
          throw new ApiError(400, "Добавьте текст, фото или видео.");
        await sql.begin(async (tx) => {
          await tx`INSERT INTO comments(post_id,user_id,body,attachments) VALUES (${id},${user.id},${body},${tx.json(attachments)})`;
          if (attachments.length) {
            const claimed =
              await tx`UPDATE uploads SET published=true WHERE id IN ${tx(attachments.map((a) => a.id))} AND published=false RETURNING id`;
            if (claimed.length !== attachments.length)
              throw new ApiError(409, "Вложение уже опубликовано.");
          }
        });
        return json({ ok: true }, 201);
      }
    }
    if (route === "chats" && req.method === "GET") {
      return json(
        await sql`SELECT c.id, c.title, c.is_group, c.created_by, COALESCE(last.created_at,c.created_at) AS updated_at, last.body AS last_body, (SELECT json_agg(telejka_user(u.id,${user.id}::uuid)) FROM members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = c.id) AS participants FROM conversations c JOIN members m ON m.conversation_id = c.id AND m.user_id = ${user.id} LEFT JOIN LATERAL (SELECT body, created_at FROM messages WHERE conversation_id = c.id AND (m.cleared_at IS NULL OR created_at>m.cleared_at) ORDER BY created_at DESC, id DESC LIMIT 1) last ON true WHERE (m.hidden_at IS NULL OR last.created_at>m.hidden_at) ORDER BY updated_at DESC`,
      );
    }
    if (route === "chats" && req.method === "POST") {
      const data = z
        .object({
          userIds: z.array(idSchema).min(1).max(49),
          title: z.string().trim().max(80).optional(),
          isGroup: z.boolean(),
        })
        .parse(input);
      const ids = [...new Set([user.id as string, ...data.userIds])];
      if (ids.length < 2 || (!data.isGroup && ids.length !== 2))
        throw new ApiError(400, "Выберите участников.");
      if (data.isGroup && !data.title)
        throw new ApiError(400, "Укажите название группы.");
      const found = await sql`SELECT id FROM users WHERE id IN ${sql(ids)}`;
      if (found.length !== ids.length)
        throw new ApiError(400, "Пользователь не найден.");
      for (const id of ids) if (id !== user.id) await canContact(user.id, id);
      const chat = await sql.begin(async (tx) => {
        const key = data.isGroup ? null : [...ids].sort().join(":");
        const [created] =
          await tx`INSERT INTO conversations(title, is_group, direct_key, created_by) VALUES (${data.title ?? null}, ${data.isGroup}, ${key}, ${user.id}) ON CONFLICT (direct_key) DO UPDATE SET direct_key = EXCLUDED.direct_key RETURNING id`;
        for (const id of ids)
          await tx`INSERT INTO members(conversation_id, user_id) VALUES (${created.id}, ${id}) ON CONFLICT DO NOTHING`;
        await tx`UPDATE members SET hidden_at=NULL WHERE conversation_id=${created.id} AND user_id=${user.id}`;
        return created;
      });
      return json(chat, 201);
    }
    if (path[0] === "chats" && path[2] === "messages" && path.length === 3) {
      const id = idSchema.parse(path[1]);
      const [member] =
        await sql`SELECT cleared_at FROM members WHERE conversation_id = ${id} AND user_id = ${user.id}`;
      if (!member) throw new ApiError(404, "Чат не найден.");
      if (req.method === "GET") {
        const before = req.nextUrl.searchParams.get("before");
        const cutoff = before
          ? z.iso.datetime({ offset: true }).parse(before)
          : new Date(Date.now() + 60000).toISOString();
        const rows =
          await sql`SELECT telejka_message_reactions(m.id,${user.id}::uuid) AS reactions,m.id, (SELECT id FROM polls WHERE message_id=m.id) poll_id, m.user_id, m.body, m.envelope, m.created_at, telejka_user(u.id,${user.id}::uuid) AS author FROM messages m JOIN users u ON u.id = m.user_id WHERE m.conversation_id = ${id} AND (${member.cleared_at}::timestamptz IS NULL OR m.created_at>${member.cleared_at}::timestamptz) AND m.created_at < ${cutoff} ORDER BY m.created_at DESC, m.id DESC LIMIT 100`;
        return json(rows.reverse());
      }
      if (req.method === "POST") {
        throw new ApiError(400, "Требуется зашифрованное сообщение.");
      }
    }
    throw new ApiError(404, "Не найдено.");
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        { error: error.issues[0]?.message ?? "Проверьте данные." },
        400,
      );
    if (error instanceof ApiError || error instanceof FeatureError)
      return json({ error: error.message }, error.status);
    if ((error as { code?: string }).code === "23505")
      return json({ error: "Это имя уже занято. Выберите другое." }, 409);
    console.error(
      "TELEJKA API error",
      (error as { code?: string }).code ?? "unknown",
    );
    return json(
      { error: "Сервер временно недоступен. Попробуйте ещё раз." },
      503,
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
