import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptMessage,
  decryptMessage,
  encryptFile,
  decryptFile,
  from64,
  bytes64,
  type DeviceIdentity,
} from "../lib/crypto-chat";
async function device(): Promise<DeviceIdentity> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  return {
    id: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    privateKey: pair.privateKey,
    publicKey: await crypto.subtle.exportKey("jwk", pair.publicKey),
  };
}
test("only recipient keys decrypt; tampering and cross-chat replay fail", async () => {
  const a = await device(),
    b = await device(),
    outsider = await device();
  const devices = [a, b].map((d) => ({
    id: d.id,
    user_id: d.userId,
    public_key: d.publicKey,
  }));
  const envelope = await encryptMessage(
    "chat-one",
    { body: "Секрет" },
    devices,
  );
  for (const d of [a, b])
    assert.deepEqual(await decryptMessage("chat-one", envelope, d), {
      body: "Секрет",
    });
  await assert.rejects(decryptMessage("chat-one", envelope, outsider));
  await assert.rejects(decryptMessage("chat-two", envelope, b));
  const bytes = from64(envelope.ciphertext);
  bytes[0] ^= 1;
  await assert.rejects(
    decryptMessage("chat-one", { ...envelope, ciphertext: bytes64(bytes) }, b),
  );
  assert.ok(!JSON.stringify(envelope).includes("Секрет"));
});
test("attachment encryption authenticates contents", async () => {
  const plain = new TextEncoder().encode("private attachment");
  const file = await encryptFile(plain.buffer);
  assert.deepEqual(
    new Uint8Array(await decryptFile(file.data, file.key, file.iv)),
    plain,
  );
  file.data[0] ^= 1;
  await assert.rejects(decryptFile(file.data, file.key, file.iv));
});
