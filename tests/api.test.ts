import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import {
  encryptMessage,
  decryptMessage,
  type DeviceIdentity,
  type PublicDevice,
} from "../lib/crypto-chat";
const origin = "http://localhost:3101";
test(
  "full API flow: persistent auth, feed, comments, private chats and groups",
  { timeout: 120000 },
  async (t) => {
    const db = await PGlite.create();
    await db.exec(
      await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"),
    );
    await db.query(
      "INSERT INTO users(name,name_key,password_hash,color) VALUES ('До обновления','до обновления',$1,'#d8efac')",
      [await bcrypt.hash("legacy-password-123", 12)],
    );
    const socket = new PGLiteSocketServer({
      db,
      port: 5434,
      host: "127.0.0.1",
    });
    await socket.start();
    let output = "";
    const server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "-p", "3101"],
      {
        env: {
          ...process.env,
          DATABASE_URL: "",
          POSTGRES_URL: "",
          POSTGRES_URL_NON_POOLING: "",
          NEON_DATABASE_URL:
            "postgresql://postgres:postgres@127.0.0.1:5434/postgres",
          NODE_ENV: "production",
          TELEJKA_DB_POOL_SIZE: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    server.stdout.on("data", (chunk) => (output += chunk));
    server.stderr.on("data", (chunk) => (output += chunk));
    t.after(async () => {
      server.kill();
      await new Promise<void>((resolve) => {
        if (server.exitCode !== null) resolve();
        else server.once("exit", () => resolve());
      });
      await socket.stop();
      await db.close();
    });
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(origin + "/register")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(ready, output);
    async function request(
      path: string,
      method = "GET",
      data?: unknown,
      cookie = "",
    ) {
      const res = await fetch(`${origin}/api/${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          Cookie: cookie,
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return {
        status: res.status,
        body: await res.json(),
        cookie: res.headers.get("set-cookie") || "",
      };
    }
    const accounts: { id: string; cookie: string }[] = [];
    assert.equal(
      (
        await request("auth/login", "POST", {
          name: "До обновления",
          password: "legacy-password-123",
        })
      ).status,
      200,
      "Existing hashes must migrate without resetting passwords",
    );
    for (const name of ["Алиса", "Борис", "Вера", "Глеб"]) {
      const res = await request("auth/register", "POST", {
        name,
        password: "test-password-123",
        bio: "Тестовый профиль",
      });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.match(res.cookie, /HttpOnly/i);
      assert.match(res.cookie, /Secure/i);
      assert.match(res.cookie, /Max-Age=31536000/i);
      accounts.push({ id: res.body.id, cookie: res.cookie.split(";")[0] });
    }
    const [alice, bob, vera, outsider] = accounts;
    for (const name of [" АЛИСА ", "Алиса"]) {
      const duplicate = await request("auth/register", "POST", {
        name,
        password: "other-password-123",
      });
      assert.equal(duplicate.status, 409);
      assert.match(duplicate.body.error, /имя уже занято/i);
    }
    assert.equal(
      (
        await request("auth/register", "POST", {
          name: "алиса",
          password: "test-password-123",
        })
      ).status,
      409,
    );
    assert.equal((await request("me")).status, 401);
    assert.equal(
      (await request("me", "GET", undefined, alice.cookie)).body.name,
      "Алиса",
    );
    assert.equal(
      (
        await request("auth/login", "POST", {
          name: "АЛИСА",
          password: "wrong-password",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("auth/login", "POST", {
          name: "АЛИСА",
          password: "test-password-123",
        })
      ).status,
      200,
    );
    const userRows = await db.query<{ password_hash: string }>(
      "SELECT password_hash FROM telejka_auth.credentials",
    );
    assert.ok(
      userRows.rows.every((row) => row.password_hash.startsWith("$2b$")),
    );
    const post = await request(
      "posts",
      "POST",
      { body: "Привет, TELEJKA! #Привет #привет #NextJS" },
      alice.cookie,
    );
    assert.equal(post.status, 201);
    const profile = await request(
      `users/${alice.id}`,
      "GET",
      undefined,
      bob.cookie,
    );
    assert.equal(profile.status, 200);
    assert.equal(profile.body.name, "Алиса");
    assert.equal(profile.body.post_count, 1);
    assert.equal(profile.body.password_hash, undefined);
    assert.equal(
      (await request(`posts?author=${alice.id}`, "GET", undefined, bob.cookie))
        .body.length,
      1,
    );
    assert.equal(
      (await request(`posts?author=${bob.id}`, "GET", undefined, alice.cookie))
        .body.length,
      0,
    );
    assert.equal(
      (
        await request(
          `users/${crypto.randomUUID()}`,
          "GET",
          undefined,
          bob.cookie,
        )
      ).status,
      404,
    );
    assert.equal((await request(`users/${alice.id}`)).status, 401);
    const trends = await request("hashtags", "GET", undefined, alice.cookie);
    assert.equal(trends.status, 200);
    assert.deepEqual(trends.body, [
      { tag: "nextjs", posts: 1 },
      { tag: "привет", posts: 1 },
    ]);
    assert.equal(
      (
        await request(
          `posts/${post.body.id}/comments`,
          "POST",
          { body: "Привет!" },
          bob.cookie,
        )
      ).status,
      201,
    );
    await request(
      `posts/${post.body.id}/like`,
      "POST",
      { liked: true },
      bob.cookie,
    );
    await request(
      `posts/${post.body.id}/like`,
      "POST",
      { liked: true },
      bob.cookie,
    );
    const feed = await request("posts", "GET", undefined, bob.cookie);
    assert.equal(feed.body[0].likes, 1);
    assert.equal(feed.body[0].comments, 1);
    assert.equal(feed.body[0].liked, true);
    assert.equal(
      (await request(`posts/${post.body.id}`, "DELETE", undefined, bob.cookie))
        .status,
      404,
    );
    const identities: DeviceIdentity[] = [];
    const devices: PublicDevice[] = [];
    for (const account of accounts) {
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
      const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey),
        id = crypto.randomUUID();
      identities.push({
        id,
        userId: account.id,
        privateKey: pair.privateKey,
        publicKey,
      });
      devices.push({ id, user_id: account.id, public_key: publicKey });
      assert.equal(
        (await request("devices", "POST", { id, publicKey }, account.cookie))
          .status,
        200,
      );
    }
    assert.equal(
      (await db.query("SELECT id FROM users WHERE password_hash IS NOT NULL"))
        .rows.length,
      0,
    );
    const direct = await request(
      "chats",
      "POST",
      { userIds: [bob.id], isGroup: false },
      alice.cookie,
    );
    assert.equal(direct.status, 201, JSON.stringify(direct.body));
    const reverse = await request(
      "chats",
      "POST",
      { userIds: [alice.id], isGroup: false },
      bob.cookie,
    );
    assert.equal(reverse.body.id, direct.body.id);
    assert.equal(
      (
        await request(
          `chats/${direct.body.id}/messages`,
          "POST",
          { body: "raw text" },
          alice.cookie,
        )
      ).status,
      400,
    );
    const envelope = await encryptMessage(
      direct.body.id,
      { body: "Личное сообщение", attachments: [] },
      devices.slice(0, 2),
    );
    const clientId = crypto.randomUUID();
    assert.equal(
      (
        await request(
          `chats/${direct.body.id}/messages`,
          "POST",
          { envelope, clientId },
          alice.cookie,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await request(
          `chats/${direct.body.id}/messages`,
          "GET",
          undefined,
          bob.cookie,
        )
      ).body[0].body,
      "🔒 Зашифрованное сообщение",
    );
    assert.equal(
      (
        await request(
          `chats/${direct.body.id}/messages`,
          "GET",
          undefined,
          outsider.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          `chats/${direct.body.id}/messages`,
          "POST",
          { body: "Чужой" },
          outsider.cookie,
        )
      ).status,
      404,
    );
    const received = (
      await request(
        `chats/${direct.body.id}/messages`,
        "GET",
        undefined,
        bob.cookie,
      )
    ).body[0];
    assert.equal(
      (
        await decryptMessage<{ body: string }>(
          direct.body.id,
          received.envelope,
          identities[1],
        )
      ).body,
      "Личное сообщение",
    );
    await request(
      `chats/${direct.body.id}/messages`,
      "POST",
      { envelope, clientId },
      alice.cookie,
    );
    assert.equal(
      (
        await request(
          `chats/${direct.body.id}/messages`,
          "GET",
          undefined,
          bob.cookie,
        )
      ).body.length,
      1,
    );
    const notices = await Promise.all([
      request("notifications", "POST", {}, bob.cookie),
      request("notifications", "POST", {}, bob.cookie),
    ]);
    for (const notice of notices)
      assert.equal(
        notice.status,
        200,
        JSON.stringify(notice.body) + " " + output,
      );
    assert.equal(
      notices.reduce((n, r) => n + r.body.length, 0),
      1,
    );
    assert.deepEqual(
      (await request("notifications", "POST", {}, bob.cookie)).body,
      [],
    );
    const privateUpload = await request(
      "uploads",
      "POST",
      {
        name: "encrypted",
        mime: "application/octet-stream",
        size: 3,
        chatId: direct.body.id,
      },
      alice.cookie,
    );
    assert.equal(privateUpload.status, 201);
    const uid = privateUpload.body.id;
    assert.equal(
      (await request(`uploads/${uid}/0`, "POST", { data: "AQID" }, bob.cookie))
        .status,
      404,
    );
    assert.equal(
      (await request(`uploads/${uid}/complete`, "POST", {}, alice.cookie))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          `uploads/${uid}/0`,
          "POST",
          { data: "AQ==" },
          alice.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `uploads/${uid}/0`,
          "POST",
          { data: "AQID" },
          alice.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request(`uploads/${uid}/complete`, "POST", {}, alice.cookie))
        .status,
      200,
    );
    assert.equal(
      (await request(`uploads/${uid}`, "GET", undefined, bob.cookie)).status,
      404,
    );
    assert.equal(
      (
        await request(
          `chats/${direct.body.id}/messages`,
          "POST",
          { envelope, clientId: crypto.randomUUID(), attachmentIds: [uid] },
          alice.cookie,
        )
      ).status,
      201,
    );
    assert.equal(
      (await request(`uploads/${uid}/0`, "GET", undefined, bob.cookie)).body
        .data,
      "AQID",
    );
    assert.equal(
      (await request(`uploads/${uid}`, "GET", undefined, outsider.cookie))
        .status,
      404,
    );
    assert.equal(
      (
        await request(
          "posts",
          "POST",
          { body: "", attachmentIds: [uid] },
          alice.cookie,
        )
      ).status,
      400,
    );
    const pub = await request(
      "uploads",
      "POST",
      { name: "photo.png", mime: "image/png", size: 3 },
      alice.cookie,
    );
    await request(
      `uploads/${pub.body.id}/0`,
      "POST",
      { data: "AQID" },
      alice.cookie,
    );
    await request(`uploads/${pub.body.id}/complete`, "POST", {}, alice.cookie);
    assert.equal(
      (
        await request(
          "posts",
          "POST",
          { body: "", attachmentIds: [pub.body.id] },
          bob.cookie,
        )
      ).status,
      400,
    );
    const photoPost = await request(
      "posts",
      "POST",
      { body: "", attachmentIds: [pub.body.id] },
      alice.cookie,
    );
    assert.equal(photoPost.status, 201);
    assert.equal(
      (await request(`uploads/${pub.body.id}/0`, "GET", undefined, bob.cookie))
        .status,
      200,
    );
    assert.equal(
      (
        await request(
          "uploads",
          "POST",
          { name: "page.html", mime: "text/html", size: 3 },
          alice.cookie,
        )
      ).status,
      400,
    );
    const group = await request(
      "chats",
      "POST",
      { userIds: [bob.id, vera.id], isGroup: true, title: "Компания" },
      alice.cookie,
    );
    assert.equal(group.status, 201);
    await request(
      `chats/${group.body.id}/messages`,
      "POST",
      {
        envelope: await encryptMessage(
          group.body.id,
          { body: "Всем привет", attachments: [] },
          devices.slice(0, 3),
        ),
        clientId: crypto.randomUUID(),
      },
      vera.cookie,
    );
    assert.equal(
      (
        await request(
          `chats/${group.body.id}/messages`,
          "GET",
          undefined,
          bob.cookie,
        )
      ).body.length,
      1,
    );
    assert.equal(
      (await request("chats", "GET", undefined, outsider.cookie)).body.length,
      0,
    );

    // Economy grants are serialized, idempotent and based on Moscow dates.
    const visits = await Promise.all([
      request("rewards/visit", "POST", {}, alice.cookie),
      request("rewards/visit", "POST", {}, alice.cookie),
    ]);
    for (const v of visits)
      assert.equal(v.status, 200, JSON.stringify(v.body) + output);
    assert.equal(
      visits.reduce((n, v) => n + v.body.granted, 0),
      15,
    );
    assert.equal(
      (await request("rewards", "GET", undefined, alice.cookie)).body.balance,
      15,
    );
    assert.equal(
      (await request("rewards/claim", "POST", {}, outsider.cookie)).status,
      400,
    );
    await db.query(
      "UPDATE wallets SET last_visit=(now() AT TIME ZONE 'Europe/Moscow')::date-1 WHERE user_id=$1",
      [alice.id],
    );
    await db.query(
      "DELETE FROM baton_ledger WHERE user_id=$1 AND ref LIKE 'visit:%'",
      [alice.id],
    );
    assert.equal(
      (await request("rewards/visit", "POST", {}, alice.cookie)).body.granted,
      30,
    );
    await db.query(
      "UPDATE wallets SET last_visit=(now() AT TIME ZONE 'Europe/Moscow')::date-3 WHERE user_id=$1",
      [alice.id],
    );
    await db.query(
      "DELETE FROM baton_ledger WHERE user_id=$1 AND ref LIKE 'visit:%'",
      [alice.id],
    );
    assert.equal(
      (await request("rewards/visit", "POST", {}, alice.cookie)).body.granted,
      15,
    );
    await db.query(
      "UPDATE daily_quests SET kind='comments',target=1,progress=0,claimed=false WHERE user_id=$1",
      [alice.id],
    );
    assert.equal(
      (
        await request(
          "posts/" + post.body.id + "/comments",
          "POST",
          { body: "Квест" },
          alice.cookie,
        )
      ).status,
      201,
    );
    assert.equal(
      (await request("rewards", "GET", undefined, alice.cookie)).body.quest
        .progress,
      1,
    );
    await Promise.all([
      request("rewards/claim", "POST", {}, alice.cookie),
      request("rewards/claim", "POST", {}, alice.cookie),
    ]);
    assert.equal(
      (await request("rewards", "GET", undefined, alice.cookie)).body.balance,
      90,
    );
    assert.equal(
      (
        await request(
          "plus/buy",
          "POST",
          { requestId: crypto.randomUUID() },
          alice.cookie,
        )
      ).status,
      400,
    );
    await db.query("UPDATE wallets SET balance=150 WHERE user_id=$1", [
      alice.id,
    ]);
    const purchase = crypto.randomUUID();
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await request(
            "plus/buy",
            "POST",
            { requestId: purchase },
            alice.cookie,
          )
        ).status,
        200,
      );
    assert.equal(
      (await request("rewards", "GET", undefined, alice.cookie)).body.balance,
      50,
    );
    assert.equal(
      (await request("me", "GET", undefined, alice.cookie)).body.plus_active,
      true,
    );
    for (const emoji of ["😁", "😳", "🥺"])
      assert.equal(
        (
          await request(
            "posts/" + post.body.id + "/reactions",
            "POST",
            { emoji, active: true },
            alice.cookie,
          )
        ).status,
        200,
      );
    assert.equal(
      (
        await request(
          "posts/" + post.body.id + "/reactions",
          "POST",
          { emoji: "😎", active: true },
          alice.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "posts/" + post.body.id + "/reactions",
          "POST",
          { emoji: "👍", active: true },
          bob.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "messages/" + received.id + "/reactions",
          "POST",
          { emoji: "👍", active: true },
          alice.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "messages/" + received.id + "/reactions",
          "GET",
          undefined,
          outsider.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (await request("posts", "GET", undefined, alice.cookie)).body.find(
        (p: any) => p.id === post.body.id,
      ).reactions.length,
      3,
    );
    assert.equal(
      (
        await request(
          "users/" + bob.id + "/verification",
          "PATCH",
          { verified: true },
          alice.cookie,
        )
      ).status,
      403,
    );
    const ownerId = "5158ea3a-fcb5-44cb-8f29-362b94aa1744";
    await db.query(
      "INSERT INTO users(id,name,name_key,color) VALUES($1,'Владелец','владелец','#ffffff')",
      [ownerId],
    );
    await db.query(
      "INSERT INTO telejka_auth.credentials(user_id,password_hash) VALUES($1,$2)",
      [ownerId, await bcrypt.hash("owner-password", 12)],
    );
    const ownerLogin = await request("auth/login", "POST", {
      name: "Владелец",
      password: "owner-password",
    });
    const ownerCookie = ownerLogin.cookie.split(";")[0];
    assert.equal(ownerLogin.body.can_manage_verification, true);
    for (const verified of [true, false]) {
      assert.equal(
        (
          await request(
            "users/" + bob.id + "/verification",
            "PATCH",
            { verified },
            ownerCookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (await request("users/" + bob.id, "GET", undefined, alice.cookie)).body
          .verified,
        verified,
      );
    }
    const prefs = {
      is_private: true,
      name_color: "#ff0000",
      allowed_ids: [bob.id],
    };
    assert.equal(
      (await request("me/preferences", "PATCH", prefs, alice.cookie)).status,
      200,
    );
    assert.equal(
      (await request("me/preferences", "PATCH", prefs, vera.cookie)).status,
      403,
    );
    const locked = await request(
      "users/" + alice.id,
      "GET",
      undefined,
      outsider.cookie,
    );
    assert.equal(locked.body.can_view, false);
    assert.equal(locked.body.bio, "");
    assert.equal(locked.body.post_count, 0);
    assert.equal(
      (
        await request(
          "posts?author=" + alice.id,
          "GET",
          undefined,
          outsider.cookie,
        )
      ).body.length,
      0,
    );
    assert.equal(
      (await request("hashtags", "GET", undefined, outsider.cookie)).body
        .length,
      0,
    );
    assert.equal(
      (
        await request(
          "posts/" + post.body.id + "/comments",
          "GET",
          undefined,
          outsider.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          "posts/" + post.body.id + "/like",
          "POST",
          { liked: true },
          outsider.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          "uploads/" + pub.body.id + "/0",
          "GET",
          undefined,
          outsider.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          "uploads/" + pub.body.id + "/0",
          "GET",
          undefined,
          bob.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "chats",
          "POST",
          { userIds: [alice.id], isGroup: false },
          outsider.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "chats",
          "POST",
          { userIds: [alice.id], isGroup: true, title: "Обход" },
          outsider.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "users/" + bob.id + "/block",
          "POST",
          { blocked: true },
          alice.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "chats/" + direct.body.id + "/messages",
          "POST",
          { envelope, clientId: crypto.randomUUID() },
          bob.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("posts?author=" + alice.id, "GET", undefined, bob.cookie))
        .body.length,
      0,
    );
    await request(
      "users/" + bob.id + "/block",
      "POST",
      { blocked: false },
      alice.cookie,
    );
    assert.ok(
      (await request("posts?author=" + alice.id, "GET", undefined, bob.cookie))
        .body.length > 0,
    );
    await db.query(
      "UPDATE users SET plus_until=now()-interval '1 day' WHERE id=$1",
      [alice.id],
    );
    assert.equal(
      (await request("users/" + alice.id, "GET", undefined, outsider.cookie))
        .body.can_view,
      false,
      "Expired PLUS must not expose private posts",
    );
    assert.equal(
      (
        await request(
          "me/preferences",
          "PATCH",
          { is_private: false, name_color: null, allowed_ids: [] },
          alice.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "chats/" + direct.body.id,
          "DELETE",
          undefined,
          alice.cookie,
        )
      ).body.result,
      "hidden",
    );
    assert.equal(
      (await request("chats", "GET", undefined, alice.cookie)).body.some(
        (c: any) => c.id === direct.body.id,
      ),
      false,
    );
    assert.ok(
      (
        await request(
          "chats/" + direct.body.id + "/messages",
          "GET",
          undefined,
          alice.cookie,
        )
      ).body.length > 0,
      "Removing a contact preserves message history",
    );
    assert.ok(
      (
        await request(
          "chats/" + direct.body.id + "/messages",
          "GET",
          undefined,
          bob.cookie,
        )
      ).body.length > 0,
    );
    assert.equal(
      (
        await request(
          "chats/" + direct.body.id + "/messages",
          "POST",
          { envelope, clientId: crypto.randomUUID() },
          bob.cookie,
        )
      ).status,
      201,
    );
    assert.equal(
      (await request("chats", "GET", undefined, alice.cookie)).body.some(
        (c: any) => c.id === direct.body.id,
      ),
      true,
    );
    assert.equal(
      (
        await request(
          "chats/" + group.body.id,
          "DELETE",
          undefined,
          outsider.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (await request("chats/" + group.body.id, "DELETE", undefined, bob.cookie))
        .body.result,
      "left",
    );
    assert.equal(
      (
        await request(
          "chats/" + group.body.id + "/messages",
          "GET",
          undefined,
          bob.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          "chats/" + group.body.id,
          "DELETE",
          undefined,
          alice.cookie,
        )
      ).body.result,
      "deleted",
    );
    assert.equal(
      (
        await request(
          "chats/" + group.body.id + "/messages",
          "GET",
          undefined,
          vera.cookie,
        )
      ).status,
      404,
    );

    const forged = await fetch(`${origin}/api/posts`, {
      method: "POST",
      headers: { Origin: "https://evil.example", Cookie: alice.cookie },
      body: JSON.stringify({ body: "Forged" }),
    });
    assert.equal(forged.status, 403);
    const updated = await request(
      "me",
      "PATCH",
      { name: "Алиса Новая", bio: "Новое описание", avatar: null },
      alice.cookie,
    );
    assert.equal(updated.status, 200);
    await db.query(
      "INSERT INTO rate_limits(key,count,resets_at) VALUES ($1,120,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET count=120,resets_at=now()+interval '1 minute'",
      ["write:" + outsider.id],
    );
    assert.equal(
      (
        await request(
          "posts",
          "POST",
          { body: "rate limited" },
          outsider.cookie,
        )
      ).status,
      429,
    );
    assert.equal(
      (
        await request("auth/login", "POST", {
          name: "Алиса Новая",
          password: "test-password-123",
        })
      ).status,
      200,
    );
    await request("auth/logout", "POST", {}, alice.cookie);
    assert.equal(
      (await request("me", "GET", undefined, alice.cookie)).status,
      401,
    );
    const login = await request("auth/login", "POST", {
      name: "Алиса Новая",
      password: "test-password-123",
    });
    assert.equal(login.status, 200);
    const freshCookie = login.cookie.split(";")[0];
    assert.equal(
      (await request(`posts/${post.body.id}`, "DELETE", undefined, freshCookie))
        .status,
      200,
    );
    assert.deepEqual(
      (await request("hashtags", "GET", undefined, freshCookie)).body,
      [],
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::int as count FROM comments",
        )
      ).rows[0].count,
      0,
    );
  },
);
