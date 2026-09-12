import { z } from "zod";
const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);
export const callEnvelopeSchema = z
  .object({
    v: z.literal(1),
    iv: base64.length(16),
    ciphertext: base64.min(24).max(100000),
    keys: z
      .record(z.uuid(), base64.length(344))
      .refine((v) => Object.keys(v).length > 0 && Object.keys(v).length <= 20),
  })
  .strict();
export const callCreateSchema = z
  .object({
    id: z.uuid(),
    chatId: z.uuid(),
    deviceId: z.uuid(),
    offer: callEnvelopeSchema,
  })
  .strict();
export const callUpdateSchema = z
  .object({
    action: z.enum([
      "accept",
      "heartbeat",
      "end",
      "decline",
      "fail",
      "candidates",
    ]),
    deviceId: z.uuid(),
    answer: callEnvelopeSchema.optional(),
    signal: callEnvelopeSchema.optional(),
  })
  .strict();
export function callIceServers() {
  const servers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }> = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];
  let relayConfigured = false;
  const urls = (process.env.TELEJKA_TURN_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    urls.length &&
    urls.every((s) => /^turns?:[^\s/]+$/i.test(s)) &&
    process.env.TELEJKA_TURN_USERNAME &&
    process.env.TELEJKA_TURN_PASSWORD
  ) {
    servers.push({
      urls,
      username: process.env.TELEJKA_TURN_USERNAME,
      credential: process.env.TELEJKA_TURN_PASSWORD,
    });
    relayConfigured = true;
  }
  return { iceServers: servers, relayConfigured };
}
