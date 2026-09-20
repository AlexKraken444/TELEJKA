import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { FeatureError } from "./api-error";
import { canManageVerification } from "./verification";
import { scheduleMessagePush } from "./push-api";

const reply = (value: unknown) =>
  NextResponse.json(value, { headers: { "Cache-Control": "no-store" } });
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const linkSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    try {
      const u = new URL(value);
      return (
        ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
      );
    } catch {
      return false;
    }
  }, "Укажите ссылку с https:// или оставьте поле пустым.");
async function requireAdmin(req: NextRequest, userId: string) {
  if (!(await canManageVerification(userId)))
    throw new FeatureError(
      403,
      "Только владелец TELEJKA может модерировать рекламу.",
    );
  const token = req.cookies.get("telejka_ad_admin")?.value || "";
  if (
    !(
      await db()`SELECT 1 FROM telejka_auth.ad_sessions WHERE token_hash=${hash(token)} AND user_id=${userId} AND expires_at>now()`
    ).length
  )
    throw new FeatureError(403, "Введите пароль модерации.");
}
export async function commerceApi(
  req: NextRequest,
  path: string[],
  input: Record<string, unknown>,
  userId: string,
) {
  const route = path.join("/");
  if (
    path[0] !== "ads" &&
    path[0] !== "adadmin" &&
    !(path[0] === "chats" && path[2] === "batons" && path.length === 3)
  )
    return;
  const sql = db();
  if (path[0] === "chats" && req.method === "POST") {
    const chatId = z.uuid().parse(path[1]);
    const { amount, requestId } = z
      .object({
        amount: z.number().int().min(1).max(1000),
        requestId: z.uuid(),
      })
      .strict()
      .parse(input);
    const unlimited = await canManageVerification(userId);
    const result = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(847291064)`;
      const [old] =
        await tx`SELECT message_id,amount,conversation_id FROM baton_transfers WHERE sender_id=${userId} AND request_id=${requestId}`;
      if (old) {
        if (old.amount !== amount || old.conversation_id !== chatId)
          throw new FeatureError(
            409,
            "Этот запрос уже использован для другого перевода.",
          );
        return old;
      }
      const [chat] =
        await tx`SELECT c.id FROM conversations c JOIN members m ON m.conversation_id=c.id WHERE c.id=${chatId} AND NOT c.is_group AND m.user_id=${userId} FOR UPDATE OF c`;
      const members =
        await tx`SELECT user_id FROM members WHERE conversation_id=${chatId}`;
      const recipient = members.find((m) => m.user_id !== userId)?.user_id;
      if (!chat || members.length !== 2 || !recipient)
        throw new FeatureError(403, "Переводы доступны только в личном чате.");
      const [access] =
        await tx`SELECT telejka_can_view(${recipient}::uuid,${userId}::uuid) allowed`;
      if (!access.allowed)
        throw new FeatureError(
          403,
          "Пользователь закрыл доступ или заблокирован.",
        );
      await tx`INSERT INTO wallets(user_id) VALUES(${userId}),(${recipient}) ON CONFLICT DO NOTHING`;
      await tx`SELECT user_id FROM wallets WHERE user_id IN (${userId},${recipient}) ORDER BY user_id FOR UPDATE`;
      const [wallet] =
        await tx`SELECT balance>=${amount} enough FROM wallets WHERE user_id=${userId}`;
      if (!unlimited && !wallet.enough)
        throw new FeatureError(400, "Недостаточно БАТОНчиков.");
      if (!unlimited)
        await tx`UPDATE wallets SET balance=balance-${amount} WHERE user_id=${userId}`;
      await tx`UPDATE wallets SET balance=balance+${amount} WHERE user_id=${recipient}`;
      await tx`INSERT INTO baton_ledger(user_id,ref,amount) VALUES(${userId},${"transfer-out:" + requestId},${unlimited ? 0 : -amount}),(${recipient},${"transfer-in:" + userId + ":" + requestId},${amount})`;
      const [message] =
        await tx`INSERT INTO messages(conversation_id,user_id,body,baton_amount) VALUES(${chatId},${userId},${"Перевод: " + amount + " БАТОНчиков"},${amount}) RETURNING id`;
      await tx`INSERT INTO baton_transfers(sender_id,request_id,recipient_id,conversation_id,amount,message_id) VALUES(${userId},${requestId},${recipient},${chatId},${amount},${message.id})`;
      return { message_id: message.id, amount, conversation_id: chatId };
    });
    scheduleMessagePush(result.message_id);
    return reply(result);
  }
  if (route === "adadmin/login" && req.method === "POST") {
    if (!(await canManageVerification(userId)))
      throw new FeatureError(403, "Только владелец TELEJKA.");
    const password = z.string().max(200).parse(input.password);
    const [limit] =
      await sql`INSERT INTO rate_limits(key,count,resets_at) VALUES(${"ad-login:" + userId},1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.resets_at<now() THEN 1 ELSE rate_limits.count+1 END,resets_at=CASE WHEN rate_limits.resets_at<now() THEN now()+interval '15 minutes' ELSE rate_limits.resets_at END RETURNING count`;
    if (limit.count > 8)
      throw new FeatureError(429, "Слишком много попыток. Подождите 15 минут.");
    const [settings] =
      await sql`SELECT password_hash FROM telejka_auth.ad_settings WHERE singleton=true`;
    if (!(await bcrypt.compare(password, settings.password_hash)))
      throw new FeatureError(403, "Неверный пароль.");
    const token = randomBytes(32).toString("hex");
    await sql`DELETE FROM telejka_auth.ad_sessions WHERE expires_at<now() OR user_id=${userId}`;
    await sql`INSERT INTO telejka_auth.ad_sessions(token_hash,user_id,expires_at) VALUES(${hash(token)},${userId},now()+interval '8 hours')`;
    const response = reply({ ok: true });
    response.cookies.set("telejka_ad_admin", token, {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 28800,
    });
    return response;
  }
  if (path[0] === "adadmin") {
    await requireAdmin(req, userId);
    if (path.length === 1 && req.method === "GET")
      return reply(
        await sql`SELECT a.id,a.slot,a.owner_id,u.name,a.link,a.status,a.created_at,a.ends_at FROM advertisements a JOIN users u ON u.id=a.owner_id WHERE a.status='pending' OR (a.status='active' AND a.ends_at>now()) ORDER BY a.created_at`,
      );
    if (path.length === 2 && req.method === "POST") {
      const adId = z.uuid().parse(path[1]),
        { approve } = z.object({ approve: z.boolean() }).strict().parse(input);
      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(847291064)`;
        const [ad] =
          await tx`SELECT * FROM advertisements WHERE id=${adId} FOR UPDATE`;
        if (!ad) throw new FeatureError(404, "Заявка не найдена.");
        if (ad.status !== "pending") {
          if (
            (approve && ad.status === "active") ||
            (!approve && ad.status === "rejected")
          )
            return;
          throw new FeatureError(409, "Заявка уже рассмотрена.");
        }
        if (approve)
          await tx`UPDATE advertisements SET status='active',starts_at=now(),ends_at=now()+interval '7 days' WHERE id=${adId}`;
        else {
          await tx`UPDATE wallets SET balance=balance+${ad.paid} WHERE user_id=${ad.owner_id}`;
          await tx`INSERT INTO baton_ledger(user_id,ref,amount) VALUES(${ad.owner_id},${"ad-refund:" + adId},${ad.paid})`;
          await tx`UPDATE advertisements SET status='rejected' WHERE id=${adId}`;
        }
      });
      return reply({ ok: true });
    }
  }
  if (route === "ads" && req.method === "GET") {
    const [u] =
      await sql`SELECT ad_block AND COALESCE(plus_until>now(),false) hidden FROM users WHERE id=${userId}`;
    if (u.hidden) return reply({ hidden: true, slots: [] });
    const rows =
      await sql`SELECT slot,id,owner_id,link,status,ends_at FROM advertisements WHERE status='pending' OR (status='active' AND ends_at>now())`;
    return reply({
      hidden: false,
      slots: Array.from({ length: 5 }, (_, i) => {
        const ad = rows.find((r) => r.slot === i + 1);
        return ad?.status === "active"
          ? { ...ad, available: false }
          : { slot: i + 1, available: !ad };
      }),
    });
  }
  if (route === "ads/mine" && req.method === "GET")
    return reply(
      await sql`SELECT id,slot,status,ends_at,created_at,link FROM advertisements WHERE owner_id=${userId} ORDER BY created_at DESC LIMIT 30`,
    );
  if (
    path[0] === "ads" &&
    path.length === 3 &&
    path[2] === "image" &&
    req.method === "GET"
  ) {
    const adId = z.uuid().parse(path[1]);
    const [ad] =
      await sql`SELECT image,owner_id,status,ends_at FROM advertisements WHERE id=${adId}`;
    if (!ad) throw new FeatureError(404, "Реклама не найдена.");
    if (
      !(
        ad.status === "active" && new Date(ad.ends_at).getTime() > Date.now()
      ) &&
      ad.owner_id !== userId
    )
      await requireAdmin(req, userId);
    return new NextResponse(Buffer.from(ad.image, "base64"), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (route === "ads" && req.method === "POST") {
    const { slot, image, link, requestId } = z
      .object({
        slot: z.number().int().min(1).max(5),
        image: z
          .string()
          .max(350000)
          .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
        link: linkSchema,
        requestId: z.uuid(),
      })
      .strict()
      .parse(input);
    const unlimited = await canManageVerification(userId);
    let encoded: string;
    try {
      encoded = (
        await sharp(Buffer.from(image.split(",")[1], "base64"), {
          limitInputPixels: 16000000,
        })
          .rotate()
          .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 75 })
          .toBuffer()
      ).toString("base64");
    } catch {
      throw new FeatureError(
        400,
        "Не удалось прочитать изображение. Выберите PNG, JPG или WebP.",
      );
    }
    return reply(
      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(847291064)`;
        const [old] =
          await tx`SELECT id FROM advertisements WHERE owner_id=${userId} AND request_id=${requestId}`;
        if (old) return old;
        await tx`UPDATE advertisements SET status='expired' WHERE status='active' AND ends_at<=now()`;
        if (
          (
            await tx`SELECT id FROM advertisements WHERE slot=${slot} AND status IN ('pending','active')`
          ).length
        )
          throw new FeatureError(409, "Это место уже занято. Выберите другое.");
        await tx`INSERT INTO wallets(user_id) VALUES(${userId}) ON CONFLICT DO NOTHING`;
        const [w] =
          await tx`SELECT balance>=15 enough FROM wallets WHERE user_id=${userId} FOR UPDATE`;
        if (!unlimited && !w.enough)
          throw new FeatureError(400, "Нужно 15 БАТОНчиков.");
        if (!unlimited)
          await tx`UPDATE wallets SET balance=balance-15 WHERE user_id=${userId}`;
        const [ad] =
          await tx`INSERT INTO advertisements(owner_id,request_id,slot,image,link,paid) VALUES(${userId},${requestId},${slot},${encoded},${link},${unlimited ? 0 : 15}) RETURNING id`;
        await tx`INSERT INTO baton_ledger(user_id,ref,amount) VALUES(${userId},${"ad:" + ad.id},${unlimited ? 0 : -15})`;
        return ad;
      }),
    );
  }
}
