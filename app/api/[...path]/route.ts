import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { createHash, randomInt } from "node:crypto";
import { db, databaseUrl, ensureDatabase } from "@/lib/db";
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

export const runtime = "nodejs";
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
    headers: { "Cache-Control": "no-store" },
  });
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
    if (!databaseUrl())
      throw new ApiError(
        503,
        "Сервер ещё не настроен: подключите PostgreSQL через DATABASE_URL.",
      );
    let input: Record<string, unknown> = {};
    if (writing && req.method !== "DELETE") {
      const text = await req.text();
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
      const [user] =
        await sql`INSERT INTO users(name, name_key, password_hash, bio, avatar, color) VALUES (${data.name}, ${nameKey(data.name)}, ${hash}, ${data.bio}, ${avatar}, ${colors[randomInt(colors.length)]}) RETURNING id, name, bio, avatar, color`;
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
        await sql`SELECT * FROM users WHERE name_key = ${nameKey(name)}`;
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
      });
    }
    const user = await currentUser();
    if (!user) throw new ApiError(401, "Войдите в аккаунт.");
    if (writing) await rateLimit(`write:${user.id}`, 120, 60);
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
        await sql`UPDATE users SET name = ${data.name}, name_key = ${nameKey(data.name)}, bio = ${data.bio}, avatar = ${avatar} WHERE id = ${user.id} RETURNING id, name, bio, avatar, color`;
      return json(updated);
    }
    if (route === "users" && req.method === "GET") {
      const search = (req.nextUrl.searchParams.get("q") ?? "")
        .trim()
        .slice(0, 32);
      return json(
        await sql`SELECT id, name, bio, avatar, color FROM users WHERE id <> ${user.id} AND position(${nameKey(search)} in name_key) > 0 ORDER BY created_at DESC LIMIT 40`,
      );
    }
    if (route === "posts" && req.method === "GET") {
      const offset = Math.min(
        100000,
        Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0),
      );
      const mine = req.nextUrl.searchParams.get("mine") === "true";
      return json(
        await sql`SELECT p.*, json_build_object('id',u.id,'name',u.name,'bio',u.bio,'avatar',u.avatar,'color',u.color) AS author, (SELECT count(*)::int FROM likes l WHERE l.post_id = p.id) AS likes, (SELECT count(*)::int FROM comments c WHERE c.post_id = p.id) AS comments, EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ${user.id}) AS liked FROM posts p JOIN users u ON u.id = p.user_id WHERE (${!mine} OR p.user_id = ${user.id}) ORDER BY p.created_at DESC, p.id DESC LIMIT 20 OFFSET ${offset}`,
      );
    }
    if (route === "posts" && req.method === "POST") {
      const body = bodySchema(2000).parse(input.body);
      const [post] =
        await sql`INSERT INTO posts(user_id, body) VALUES (${user.id}, ${body}) RETURNING id`;
      return json(post, 201);
    }
    if (path[0] === "posts" && path[1]) {
      const id = idSchema.parse(path[1]);
      if (path.length === 2 && req.method === "DELETE") {
        const deleted =
          await sql`DELETE FROM posts WHERE id = ${id} AND user_id = ${user.id} RETURNING id`;
        if (!deleted.length) throw new ApiError(404, "Пост не найден.");
        return json({ ok: true });
      }
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
          await sql`SELECT c.id, c.body, c.created_at, json_build_object('id',u.id,'name',u.name,'avatar',u.avatar,'color',u.color) AS author FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ${id} ORDER BY c.created_at, c.id LIMIT 50 OFFSET ${offset}`,
        );
      }
      if (path[2] === "comments" && req.method === "POST") {
        const body = bodySchema(1000).parse(input.body);
        await sql`INSERT INTO comments(post_id, user_id, body) VALUES (${id}, ${user.id}, ${body})`;
        return json({ ok: true }, 201);
      }
    }
    if (route === "chats" && req.method === "GET") {
      return json(
        await sql`SELECT c.id, c.title, c.is_group, COALESCE(last.created_at,c.created_at) AS updated_at, last.body AS last_body, (SELECT json_agg(json_build_object('id',u.id,'name',u.name,'avatar',u.avatar,'color',u.color)) FROM members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = c.id) AS participants FROM conversations c JOIN members m ON m.conversation_id = c.id AND m.user_id = ${user.id} LEFT JOIN LATERAL (SELECT body, created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) last ON true ORDER BY updated_at DESC`,
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
      const chat = await sql.begin(async (tx) => {
        const key = data.isGroup ? null : [...ids].sort().join(":");
        const [created] =
          await tx`INSERT INTO conversations(title, is_group, direct_key, created_by) VALUES (${data.title ?? null}, ${data.isGroup}, ${key}, ${user.id}) ON CONFLICT (direct_key) DO UPDATE SET direct_key = EXCLUDED.direct_key RETURNING id`;
        for (const id of ids)
          await tx`INSERT INTO members(conversation_id, user_id) VALUES (${created.id}, ${id}) ON CONFLICT DO NOTHING`;
        return created;
      });
      return json(chat, 201);
    }
    if (path[0] === "chats" && path[2] === "messages" && path.length === 3) {
      const id = idSchema.parse(path[1]);
      const [member] =
        await sql`SELECT 1 FROM members WHERE conversation_id = ${id} AND user_id = ${user.id}`;
      if (!member) throw new ApiError(404, "Чат не найден.");
      if (req.method === "GET") {
        const before = req.nextUrl.searchParams.get("before");
        const cutoff = before
          ? z.iso.datetime({ offset: true }).parse(before)
          : new Date(Date.now() + 60000).toISOString();
        const rows =
          await sql`SELECT m.id, m.user_id, m.body, m.created_at, json_build_object('id',u.id,'name',u.name,'avatar',u.avatar,'color',u.color) AS author FROM messages m JOIN users u ON u.id = m.user_id WHERE m.conversation_id = ${id} AND m.created_at < ${cutoff} ORDER BY m.created_at DESC, m.id DESC LIMIT 100`;
        return json(rows.reverse());
      }
      if (req.method === "POST") {
        const body = bodySchema(4000).parse(input.body);
        const [message] =
          await sql`INSERT INTO messages(conversation_id, user_id, body) VALUES (${id}, ${user.id}, ${body}) RETURNING id`;
        return json(message, 201);
      }
    }
    throw new ApiError(404, "Не найдено.");
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        { error: error.issues[0]?.message ?? "Проверьте данные." },
        400,
      );
    if (error instanceof ApiError)
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
