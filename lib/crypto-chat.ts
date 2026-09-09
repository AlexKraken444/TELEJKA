// Browser-only encryption. Private keys and backup passwords never go to the API.
export type DeviceIdentity = {
  id: string;
  userId: string;
  privateKey: CryptoKey;
  publicKey: JsonWebKey;
};
export type PublicDevice = {
  id: string;
  user_id: string;
  public_key: JsonWebKey;
};
export type Envelope = {
  v: 1;
  iv: string;
  ciphertext: string;
  keys: Record<string, string>;
};
export const bytes64 = (bytes: Uint8Array) => {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
};
export const from64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const encode = (value: string) => new TextEncoder().encode(value);
async function keyStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("telejka-private-keys", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("keys");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function stored(userId: string): Promise<DeviceIdentity | undefined> {
  const db = await keyStore();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction("keys").objectStore("keys").get(userId);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
async function save(identity: DeviceIdentity) {
  const db = await keyStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite");
      tx.objectStore("keys").put(identity, identity.userId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
const identities = new Map<string, Promise<DeviceIdentity>>();
export function identityFor(userId: string): Promise<DeviceIdentity> {
  let value = identities.get(userId);
  if (!value) {
    const create = async () => {
      const old = await stored(userId);
      if (old) return old;
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
      const identity = {
        id: crypto.randomUUID(),
        userId,
        privateKey: pair.privateKey,
        publicKey: await crypto.subtle.exportKey("jwk", pair.publicKey),
      };
      await save(identity);
      return identity;
    };
    value = (async () =>
      typeof navigator !== "undefined" && navigator.locks
        ? await navigator.locks.request("telejka-key:" + userId, create)
        : await create())();
    identities.set(userId, value);
    value.catch(() => identities.delete(userId));
  }
  return value;
}
export async function fingerprint(key: JsonWebKey) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    encode(`${key.kty}:${key.n}:${key.e}`),
  );
  return [...new Uint8Array(hash)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .match(/.{1,8}/g)!
    .join(" ");
}
export async function encryptMessage(
  chatId: string,
  value: unknown,
  devices: PublicDevice[],
): Promise<Envelope> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const raw = await crypto.subtle.exportKey("raw", key),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encode(chatId) },
    key,
    encode(JSON.stringify(value)),
  );
  const keys: Record<string, string> = {};
  await Promise.all(
    devices.map(async (device) => {
      const publicKey = await crypto.subtle.importKey(
        "jwk",
        device.public_key,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"],
      );
      keys[device.id] = bytes64(
        new Uint8Array(
          await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, raw),
        ),
      );
    }),
  );
  return {
    v: 1,
    iv: bytes64(iv),
    ciphertext: bytes64(new Uint8Array(ciphertext)),
    keys,
  };
}
export async function decryptMessage<T>(
  chatId: string,
  envelope: Envelope,
  identity: DeviceIdentity,
): Promise<T> {
  const wrapped = envelope.keys[identity.id];
  if (!wrapped)
    throw new Error(
      "Нет ключа для этого устройства. Импортируйте резервную копию ключа с прежнего устройства.",
    );
  const raw = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    identity.privateKey,
    from64(wrapped),
  );
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "decrypt",
  ]);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: from64(envelope.iv),
      additionalData: encode(chatId),
    },
    key,
    from64(envelope.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
export async function encryptFile(buffer: ArrayBuffer) {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    buffer,
  );
  return {
    data: new Uint8Array(data),
    key: bytes64(new Uint8Array(await crypto.subtle.exportKey("raw", key))),
    iv: bytes64(iv),
  };
}
export async function decryptFile(data: Uint8Array, key64: string, iv: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    from64(key64),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: from64(iv) },
    key,
    data as BufferSource,
  );
}
async function backupKey(password: string, salt: Uint8Array) {
  if (password.length < 12)
    throw new Error("Для резервной копии нужен пароль не короче 12 символов.");
  const material = await crypto.subtle.importKey(
    "raw",
    encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 600000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function exportBackup(userId: string, password: string) {
  const identity = await identityFor(userId),
    salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const privateKey = await crypto.subtle.exportKey("jwk", identity.privateKey);
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await backupKey(password, salt),
    encode(
      JSON.stringify({
        id: identity.id,
        userId,
        privateKey,
        publicKey: identity.publicKey,
      }),
    ),
  );
  return JSON.stringify({
    format: "telejka-key-v1",
    salt: bytes64(salt),
    iv: bytes64(iv),
    data: bytes64(new Uint8Array(data)),
  });
}
export async function importBackup(
  userId: string,
  password: string,
  text: string,
) {
  if (text.length > 30000) throw new Error("Неверный файл ключа.");
  const backup = JSON.parse(text);
  if (backup.format !== "telejka-key-v1")
    throw new Error("Неверный формат ключа.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: from64(backup.iv) },
    await backupKey(password, from64(backup.salt)),
    from64(backup.data),
  );
  const data = JSON.parse(new TextDecoder().decode(decrypted));
  if (data.userId !== userId)
    throw new Error("Ключ принадлежит другому аккаунту.");
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    data.privateKey,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"],
  );
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    data.publicKey,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const proof = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, challenge),
  );
  if (bytes64(new Uint8Array(proof)) !== bytes64(challenge))
    throw new Error("Ключ повреждён.");
  const identity = {
    id: data.id,
    userId,
    privateKey,
    publicKey: data.publicKey,
  };
  await save(identity);
  identities.set(userId, Promise.resolve(identity));
}
