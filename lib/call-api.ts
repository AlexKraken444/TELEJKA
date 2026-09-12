import { NextRequest, NextResponse, after } from "next/server";
import { db } from "./db";
import { FeatureError } from "./api-error";
import { canSendChat } from "./community-api";
import {
  callCreateSchema,
  callUpdateSchema,
  callIceServers,
} from "./call-validation";
import { z } from "zod";
import { sendCallPush } from "./push-api";
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function device(userId: string, deviceId: string) {
  const [d] =
    await db()`SELECT 1 FROM device_keys WHERE id=${deviceId} AND user_id=${userId}`;
  if (!d) throw new FeatureError(403, "Устройство не зарегистрировано.");
}
async function expire(userId: string) {
  await db()`UPDATE voice_calls SET state=CASE WHEN state='ringing' THEN 'missed' ELSE 'failed' END,ended_at=now(),offer=NULL,answer=NULL WHERE (caller_id=${userId} OR callee_id=${userId}) AND state IN ('ringing','connecting','active') AND ((state='ringing' AND created_at<now()-interval '60 seconds') OR (state<>'ringing' AND (caller_seen<now()-interval '45 seconds' OR callee_seen<now()-interval '45 seconds')))`;
}
export async function callApi(
  req: NextRequest,
  path: string[],
  input: Record<string, unknown>,
  userId: string,
) {
  if (path[0] !== "calls") return;
  const sql = db();
  await expire(userId);
  if (path[1] === "config" && req.method === "GET")
    return json(callIceServers());
  if (path.length === 1 && req.method === "GET") {
    const history = req.nextUrl.searchParams.get("history") === "1";
    return json(
      await sql`SELECT c.id,c.conversation_id,c.caller_id,c.callee_id,c.caller_device,c.callee_device,c.state,c.created_at,c.answered_at,c.ended_at,telejka_user(CASE WHEN c.caller_id=${userId} THEN c.callee_id ELSE c.caller_id END,${userId}::uuid) AS peer FROM voice_calls c WHERE (c.caller_id=${userId} OR c.callee_id=${userId}) AND (${history} OR c.state IN ('ringing','connecting','active')) ORDER BY c.created_at DESC LIMIT 30`,
    );
  }
  if (path.length === 1 && req.method === "POST") {
    const d = callCreateSchema.parse(input);
    await device(userId, d.deviceId);
    await canSendChat(d.chatId, userId);
    const [chat] =
      await sql`SELECT c.is_group FROM conversations c JOIN members m ON m.conversation_id=c.id WHERE c.id=${d.chatId} AND m.user_id=${userId}`;
    if (!chat || chat.is_group)
      throw new FeatureError(400, "Звонки доступны в личных чатах.");
    const [peer] =
      await sql`SELECT user_id FROM members WHERE conversation_id=${d.chatId} AND user_id<>${userId}`;
    if (!peer) throw new FeatureError(404, "Собеседник не найден.");
    const keys =
      await sql`SELECT id FROM device_keys WHERE user_id=${peer.user_id}`;
    if (!keys.length || keys.some((k) => !d.offer.keys[k.id]))
      throw new FeatureError(
        409,
        "Собеседнику нужно открыть TELEJKA на своём устройстве.",
      );
    await expire(peer.user_id);
    const created = await sql.begin(async (tx) => {
      await tx`SELECT id FROM users WHERE id IN (${userId},${peer.user_id}) ORDER BY id FOR UPDATE`;
      const [existing] =
        await tx`SELECT caller_id,caller_device FROM voice_calls WHERE id=${d.id}`;
      if (existing) {
        if (
          existing.caller_id === userId &&
          existing.caller_device === d.deviceId
        )
          return false;
        throw new FeatureError(409, "Звонок уже существует.");
      }
      const [busy] =
        await tx`SELECT 1 FROM voice_calls WHERE state IN ('ringing','connecting','active') AND (caller_id IN (${userId},${peer.user_id}) OR callee_id IN (${userId},${peer.user_id}))`;
      if (busy)
        throw new FeatureError(
          409,
          "Ты или собеседник уже участвуете в звонке.",
        );
      await tx`INSERT INTO voice_calls(id,conversation_id,caller_id,callee_id,caller_device,offer) VALUES(${d.id},${d.chatId},${userId},${peer.user_id},${d.deviceId},${tx.json(d.offer)})`;
      return true;
    });
    if (created)
      after(async () => {
        try {
          await sendCallPush(peer.user_id, d.id, d.chatId);
        } catch {
          console.error("Call push failed");
        }
      });
    return json({ id: d.id }, 201);
  }
  const callId = z.uuid().parse(path[1]);
  const [call] =
    await sql`SELECT * FROM voice_calls WHERE id=${callId} AND (caller_id=${userId} OR callee_id=${userId})`;
  if (!call) throw new FeatureError(404, "Звонок не найден.");
  if (req.method === "GET") return json(call);
  if (req.method === "POST") {
    const d = callUpdateSchema.parse(input);
    await device(userId, d.deviceId);
    const caller = call.caller_id === userId;
    if (caller && call.caller_device !== d.deviceId)
      throw new FeatureError(409, "Звонок открыт на другом устройстве.");
    if (!caller && call.callee_device && call.callee_device !== d.deviceId)
      throw new FeatureError(
        409,
        "На звонок уже ответили на другом устройстве.",
      );
    if (d.action === "accept") {
      if (caller || !d.answer)
        throw new FeatureError(400, "Неверный ответ на звонок.");
      await canSendChat(call.conversation_id, userId);
      if (!d.answer.keys[call.caller_device])
        throw new FeatureError(400, "Нет ключа вызывающего устройства.");
      const rows =
        await sql`UPDATE voice_calls SET callee_device=${d.deviceId},answer=${sql.json(d.answer)},state='connecting',answered_at=now(),callee_seen=now() WHERE id=${callId} AND state='ringing' RETURNING id`;
      if (!rows.length)
        throw new FeatureError(409, "Звонок уже завершён или принят.");
    } else if (d.action === "heartbeat") {
      if (!caller && !call.callee_device)
        throw new FeatureError(409, "Сначала прими звонок.");
      await sql`UPDATE voice_calls SET ${sql(caller ? "caller_seen" : "callee_seen")}=now(),state=CASE WHEN state='connecting' THEN 'active' ELSE state END WHERE id=${callId} AND state IN ('ringing','connecting','active')`;
    } else {
      const state =
        d.action === "decline" && !caller
          ? "declined"
          : d.action === "fail"
            ? "failed"
            : "ended";
      await sql`UPDATE voice_calls SET state=${state},ended_at=now(),offer=NULL,answer=NULL WHERE id=${callId} AND state IN ('ringing','connecting','active')`;
    }
    return json({ ok: true });
  }
}
