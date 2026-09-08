import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { db, ensureDatabase } from "./db";
export const COOKIE = "telejka_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 365;
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db()`INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (${hashToken(token)}, ${userId}, ${new Date(Date.now() + SESSION_SECONDS * 1000)})`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}
export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  await ensureDatabase();
  const [user] =
    await db()`SELECT u.id, u.name, u.bio, u.avatar, u.color, u.created_at FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()`;
  return user ?? null;
}
