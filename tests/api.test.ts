import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
const origin = "http://localhost:3101";
test(
  "full API flow: persistent auth, feed, comments, private chats and groups",
  { timeout: 120000 },
  async (t) => {
    const db = await PGlite.create();
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
      "SELECT password_hash FROM users",
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
    const trends = await request('hashtags', 'GET', undefined, alice.cookie);
    assert.equal(trends.status, 200);
    assert.deepEqual(trends.body, [{tag: 'nextjs', posts: 1}, {tag: 'привет', posts: 1}]);
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
          { body: "Личное сообщение" },
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
      "Личное сообщение",
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
      { body: "Всем привет" },
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
    assert.deepEqual((await request('hashtags', 'GET', undefined, freshCookie)).body, []);
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
