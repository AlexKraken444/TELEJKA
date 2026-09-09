import {VERIFICATION_OWNER_ID} from "./verification";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { FeatureError } from "./api-error";
export const REACTIONS = [
  "😁",
  "😳",
  "🥺",
  "🤮",
  "😮",
  "😱",
  "🤬",
  "😎",
  "👎",
  "👍",
] as const;
const json = (data: unknown) =>
  NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
const uuid = z.uuid();
export async function canContact(sender: string, recipient: string) {
  const [row] =
    await db()`SELECT telejka_can_view(${recipient}::uuid,${sender}::uuid) AS allowed`;
  if (!row?.allowed)
    throw new FeatureError(403, "Пользователь закрыл доступ или заблокирован.");
}
export async function canReadPost(postId: string, userId: string) {
  const [p] =
    await db()`SELECT id FROM posts WHERE id=${postId} AND telejka_can_view(user_id,${userId}::uuid)`;
  if (!p) throw new FeatureError(404, "Публикация недоступна.");
}
export async function canSendChat(chatId: string, userId: string) {
  const [chat] =
    await db()`SELECT c.is_group FROM conversations c JOIN members m ON m.conversation_id=c.id WHERE c.id=${chatId} AND m.user_id=${userId}`;
  if (!chat) throw new FeatureError(404, "Чат не найден.");
  if (!chat.is_group) {
    const [other] =
      await db()`SELECT user_id FROM members WHERE conversation_id=${chatId} AND user_id<>${userId}`;
    if (other) await canContact(userId, other.user_id);
  }
}
async function walletStatus(userId: string) {
  const sql = db();
  const [w] =
    await sql`SELECT w.balance::float8 balance,w.streak,w.last_visit::text last_visit,u.plus_until,COALESCE(u.plus_until>now(),false) plus_active,(now() AT TIME ZONE 'Europe/Moscow')::date::text today FROM wallets w JOIN users u ON u.id=w.user_id WHERE w.user_id=${userId}`;
  const [quest] =
    await sql`SELECT kind,target,progress,claimed FROM daily_quests WHERE user_id=${userId} AND day=(now() AT TIME ZONE 'Europe/Moscow')::date`;
  return { ...w, unlimited:userId===VERIFICATION_OWNER_ID, quest, quest_reward: 30, plus_price: 100 };
}
export async function communityApi(
  req: NextRequest,
  path: string[],
  input: Record<string, unknown>,
  userId: string,
): Promise<Response | undefined> {
  const sql = db(),
    route = path.join("/");
  if (route === "rewards" && req.method === "GET") {
    await sql`INSERT INTO wallets(user_id) VALUES(${userId}) ON CONFLICT DO NOTHING`;
    await sql`SELECT telejka_quest(${userId}::uuid)`;
    return json(await walletStatus(userId));
  }
  if (route === "rewards/visit" && req.method === "POST") {
    const granted = await sql.begin(async (tx) => {
      await tx`INSERT INTO wallets(user_id) VALUES(${userId}) ON CONFLICT DO NOTHING`;
      const [w] =
        await tx`SELECT *,last_visit=(now() AT TIME ZONE 'Europe/Moscow')::date AS claimed,last_visit=(now() AT TIME ZONE 'Europe/Moscow')::date-1 AS consecutive FROM wallets WHERE user_id=${userId} FOR UPDATE`;
      await tx`SELECT telejka_quest(${userId}::uuid)`;
      if (w.claimed) return 0;
      const streak = w.consecutive ? w.streak + 1 : 1,
        amount = streak * 15;
      await tx`INSERT INTO baton_ledger(user_id,ref,amount) VALUES(${userId},'visit:'||(now() AT TIME ZONE 'Europe/Moscow')::date::text,${amount})`;
      await tx`UPDATE wallets SET balance=balance+${amount},streak=${streak},last_visit=(now() AT TIME ZONE 'Europe/Moscow')::date WHERE user_id=${userId}`;
      return amount;
    });
    return json({ ...(await walletStatus(userId)), granted });
  }
  if (route === "rewards/claim" && req.method === "POST") {
    await sql.begin(async (tx) => {
      await tx`INSERT INTO wallets(user_id) VALUES(${userId}) ON CONFLICT DO NOTHING`;
      await tx`SELECT user_id FROM wallets WHERE user_id=${userId} FOR UPDATE`;
      const [q] =
        await tx`SELECT * FROM daily_quests WHERE user_id=${userId} AND day=(now() AT TIME ZONE 'Europe/Moscow')::date FOR UPDATE`;
      if (!q || q.progress < q.target)
        throw new FeatureError(400, "Задание ещё не выполнено.");
      if (q.claimed) return;
      await tx`INSERT INTO baton_ledger(user_id,ref,amount) VALUES(${userId},'quest:'||(now() AT TIME ZONE 'Europe/Moscow')::date::text,30)`;
      await tx`UPDATE wallets SET balance=balance+30 WHERE user_id=${userId}`;
      await tx`UPDATE daily_quests SET claimed=true WHERE user_id=${userId} AND day=(now() AT TIME ZONE 'Europe/Moscow')::date`;
    });
    return json(await walletStatus(userId));
  }
  if (route === "plus/buy" && req.method === "POST") {
    const { requestId } = z.object({ requestId: uuid }).strict().parse(input);
    await sql.begin(async (tx) => {
      await tx`INSERT INTO wallets(user_id) VALUES(${userId}) ON CONFLICT DO NOTHING`;
      const [wallet] =
        await tx`SELECT balance FROM wallets WHERE user_id=${userId} FOR UPDATE`;
      const [old] =
        await tx`SELECT 1 FROM baton_ledger WHERE user_id=${userId} AND ref=${"plus:" + requestId}`;
      if (old) return;
      const unlimited=userId===VERIFICATION_OWNER_ID;
      if (!unlimited && Number(wallet.balance) < 100)
        throw new FeatureError(400, "Нужно 100 БАТОНчиков.");
      if(!unlimited)await tx`UPDATE wallets SET balance=balance-100 WHERE user_id=${userId}`;
      await tx`UPDATE users SET plus_until=greatest(COALESCE(plus_until,now()),now())+interval '1 month' WHERE id=${userId}`;
      await tx`INSERT INTO baton_ledger(user_id,ref,amount) VALUES(${userId},${"plus:" + requestId},${unlimited?0:-100})`;
    });
    return json(await walletStatus(userId));
  }
  if (route === "me/preferences" && req.method === "GET") {
    const [me] =
      await sql`SELECT is_private,name_color,plus_until,COALESCE(plus_until>now(),false) plus_active FROM users WHERE id=${userId}`;
    const allowed =
      await sql`SELECT telejka_user(viewer_id,${userId}::uuid) AS person FROM profile_access WHERE owner_id=${userId}`;
    const blocked =
      await sql`SELECT telejka_user(blocked_id,${userId}::uuid) AS person FROM user_blocks WHERE user_id=${userId}`;
    return json({
      ...me,
      allowed: allowed.map((r) => r.person),
      blocked: blocked.map((r) => r.person),
    });
  }
  if (route === "me/preferences" && req.method === "PATCH") {
    const data = z
      .object({
        is_private: z.boolean(),
        name_color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullable(),
        allowed_ids: z.array(uuid).max(200),
      })
      .strict()
      .parse(input);
    await sql.begin(async (tx) => {
      const [me] =
        await tx`SELECT is_private,name_color,COALESCE(plus_until>now(),false) plus_active FROM users WHERE id=${userId} FOR UPDATE`;
      if (!me.plus_active) {
        if (data.is_private || data.name_color)
          throw new FeatureError(403, "Эта настройка доступна с TELEJKA+.");
      }
      const ids = [...new Set(data.allowed_ids)].filter((x) => x !== userId);
      if (ids.length) {
        const people = await tx`SELECT id FROM users WHERE id IN ${tx(ids)}`;
        if (people.length !== ids.length)
          throw new FeatureError(400, "Пользователь не найден.");
      }
      await tx`UPDATE users SET is_private=${data.is_private},name_color=${data.name_color} WHERE id=${userId}`;
      await tx`DELETE FROM profile_access WHERE owner_id=${userId}`;
      for (const id of ids)
        await tx`INSERT INTO profile_access(owner_id,viewer_id) VALUES(${userId},${id})`;
    });
    return json({ ok: true });
  }
  if (
    path[0] === "users" &&
    path[2] === "block" &&
    path.length === 3 &&
    req.method === "POST"
  ) {
    const target = uuid.parse(path[1]),
      { blocked } = z.object({ blocked: z.boolean() }).strict().parse(input);
    if (target === userId)
      throw new FeatureError(400, "Нельзя заблокировать себя.");
    const [other] = await sql`SELECT id FROM users WHERE id=${target}`;
    if (!other) throw new FeatureError(404, "Пользователь не найден.");
    if (blocked)
      await sql`INSERT INTO user_blocks(user_id,blocked_id) VALUES(${userId},${target}) ON CONFLICT DO NOTHING`;
    else
      await sql`DELETE FROM user_blocks WHERE user_id=${userId} AND blocked_id=${target}`;
    return json({ blocked });
  }
  if (path[0] === "chats" && path.length === 2 && req.method === "DELETE") {
    const chatId = uuid.parse(path[1]);
    const result = await sql.begin(async (tx) => {
      const [chat] =
        await tx`SELECT c.* FROM conversations c JOIN members m ON m.conversation_id=c.id WHERE c.id=${chatId} AND m.user_id=${userId} FOR UPDATE OF c`;
      if (!chat) throw new FeatureError(404, "Чат не найден.");
      if (!chat.is_group) {
        await tx`UPDATE members SET hidden_at=now() WHERE conversation_id=${chatId} AND user_id=${userId}`;
        return "hidden";
      }
      if (chat.created_by === userId) {
        await tx`DELETE FROM conversations WHERE id=${chatId}`;
        return "deleted";
      }
      await tx`DELETE FROM members WHERE conversation_id=${chatId} AND user_id=${userId}`;
      return "left";
    });
    return json({ ok: true, result });
  }
  if (
    (path[0] === "posts" || path[0] === "messages") &&
    path.length === 3 &&
    path[2] === "reactions"
  ) {
    const target = uuid.parse(path[1]),
      isPost = path[0] === "posts";
    if (isPost) await canReadPost(target, userId);
    else {
      const [m] =
        await sql`SELECT m.conversation_id FROM messages m JOIN members mb ON mb.conversation_id=m.conversation_id WHERE m.id=${target} AND mb.user_id=${userId} AND (mb.cleared_at IS NULL OR m.created_at>mb.cleared_at)`;
      if (!m) throw new FeatureError(404, "Сообщение недоступно.");
      if (req.method === "POST") await canSendChat(m.conversation_id, userId);
    }
    if (req.method === "POST") {
      const { emoji, active } = z
        .object({ emoji: z.enum(REACTIONS), active: z.boolean() })
        .strict()
        .parse(input);
      await sql.begin(async (tx) => {
        const [me] =
          await tx`SELECT COALESCE(plus_until>now(),false) plus_active FROM users WHERE id=${userId} FOR UPDATE`;
        const table = isPost ? "post_reactions" : "message_reactions",
          column = isPost ? "post_id" : "message_id";
        if (active) {
          if (!me.plus_active)
            throw new FeatureError(403, "Реакции доступны с TELEJKA+.");
          const rows =
            await tx`SELECT emoji FROM ${tx(table)} WHERE ${tx(column)}=${target} AND user_id=${userId}`;
          if (rows.some((r) => r.emoji === emoji)) return;
          if (rows.length >= 3)
            throw new FeatureError(400, "Можно выбрать максимум 3 реакции.");
          await tx`INSERT INTO ${tx(table)} (${tx(column)},user_id,emoji) VALUES(${target},${userId},${emoji}) ON CONFLICT DO NOTHING`;
        } else
          await tx`DELETE FROM ${tx(table)} WHERE ${tx(column)}=${target} AND user_id=${userId} AND emoji=${emoji}`;
      });
    } else if (req.method !== "GET") return;
    const table = isPost ? "post_reactions" : "message_reactions",
      column = isPost ? "post_id" : "message_id";
    return json(
      await sql`SELECT emoji,count(*)::int count,bool_or(user_id=${userId}) mine FROM ${sql(table)} WHERE ${sql(column)}=${target} GROUP BY emoji ORDER BY emoji`,
    );
  }
}
