import assert from "node:assert/strict";
export async function streamsFlow({ db, request, alice, bob, vera }: any) {
  const previousPrivacy = (
    await db.query("SELECT is_private FROM users WHERE id=$1", [bob.id])
  ).rows[0].is_private;
  await db.query("UPDATE users SET is_private=false WHERE id=$1", [bob.id]);
  const id = crypto.randomUUID(),
    hostKey = crypto.randomUUID(),
    peerId = crypto.randomUUID();
  const route = `streams/${id}`;
  const offer = { type: "offer", sdp: "v=0\r\no=local-test-offer\r\n" },
    answer = { type: "answer", sdp: "v=0\r\no=local-test-answer\r\n" };
  const create = { id, hostKey, title: "Тестовый эфир" };
  assert.equal(
    (await request("streams", "POST", create, alice.cookie)).status,
    201,
  );
  assert.equal(
    (await request("streams", "POST", create, alice.cookie)).status,
    201,
    "Retry creates no duplicate",
  );
  assert.equal(
    (
      await request(
        "streams",
        "POST",
        { ...create, id: crypto.randomUUID() },
        alice.cookie,
      )
    ).status,
    409,
  );
  const listed = await request("streams", "GET", undefined, bob.cookie);
  assert.ok(listed.body.some((s: any) => s.id === id));
  assert.ok(!JSON.stringify(listed.body).includes(hostKey));
  assert.equal(
    (
      await request(
        route + "/sync",
        "POST",
        { hostKey: crypto.randomUUID() },
        bob.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request(route + "/end", "POST", { hostKey }, bob.cookie)).status,
    403,
  );
  assert.equal(
    (
      await request(
        route + "/messages",
        "POST",
        { id: crypto.randomUUID(), body: "intruder" },
        bob.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request(route + "/join", "POST", { peerId, offer }, bob.cookie))
      .status,
    200,
  );
  assert.equal(
    (await request(route + "/join", "POST", { peerId, offer }, vera.cookie))
      .status,
    409,
  );
  const hostState = await request(
    route + "/sync",
    "POST",
    { hostKey },
    alice.cookie,
  );
  assert.equal(hostState.status, 200, JSON.stringify(hostState.body));
  assert.deepEqual(hostState.body.peers[0].offer, offer);
  assert.equal(
    (await request(route + "/sync", "POST", { peerId }, vera.cookie)).status,
    409,
  );
  assert.equal(
    (
      await request(
        route + "/sync",
        "POST",
        { peerId, answers: [{ peerId, answer }] },
        bob.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        route + "/sync",
        "POST",
        { hostKey, answers: [{ peerId, answer }] },
        alice.cookie,
      )
    ).status,
    200,
  );
  const viewer = await request(
    route + "/sync",
    "POST",
    { peerId, ready: true },
    bob.cookie,
  );
  assert.deepEqual(viewer.body.answer, answer);
  assert.deepEqual(viewer.body.peers, []);
  assert.equal(viewer.body.viewers, 1);
  assert.equal(
    (await request(route + "/sync", "POST", { peerId, ack: true }, bob.cookie))
      .body.answer,
    null,
  );
  assert.equal(
    (await request(route + "/sync", "POST", { hostKey }, alice.cookie)).body
      .peers[0].offer,
    null,
    "Do not resend SDP every poll",
  );
  const message = { id: crypto.randomUUID(), peerId, body: "Привет из чата" };
  assert.equal(
    (await request(route + "/messages", "POST", message, bob.cookie)).status,
    200,
  );
  assert.equal(
    (await request(route + "/messages", "POST", message, bob.cookie)).status,
    200,
  );
  assert.equal(
    (
      await request(
        route + "/messages",
        "POST",
        { ...message, id: crypto.randomUUID() },
        bob.cookie,
      )
    ).status,
    429,
  );
  const chat = await request(
    route + "/sync",
    "POST",
    { hostKey },
    alice.cookie,
  );
  assert.equal(chat.body.messages.length, 1);
  assert.equal(chat.body.messages[0].body, message.body);
  assert.equal(
    (
      await request(
        route + "/sync",
        "POST",
        { hostKey, after: chat.body.messages[0].id },
        alice.cookie,
      )
    ).body.messages.length,
    0,
  );
  // Joining is serialized: simultaneous requests cannot exceed the limit.
  const joins = await Promise.all(
    Array.from({ length: 9 }, () =>
      request(
        route + "/join",
        "POST",
        { peerId: crypto.randomUUID(), offer },
        bob.cookie,
      ),
    ),
  );
  assert.equal(joins.filter((r: any) => r.status === 200).length, 7);
  assert.equal(joins.filter((r: any) => r.status === 409).length, 2);
  await request(
    `users/${alice.id}/block`,
    "POST",
    { blocked: true },
    bob.cookie,
  );
  assert.ok(
    !(await request("streams", "GET", undefined, bob.cookie)).body.some(
      (s: any) => s.id === id,
    ),
  );
  assert.equal(
    (await request(route + "/sync", "POST", { peerId }, bob.cookie)).status,
    404,
  );
  assert.equal(
    (await request(route + "/sync", "POST", { hostKey }, alice.cookie)).body
      .peers.length,
    0,
  );
  await request(
    `users/${alice.id}/block`,
    "POST",
    { blocked: false },
    bob.cookie,
  );
  assert.equal(
    (await request(route + "/end", "POST", { hostKey }, alice.cookie)).status,
    200,
  );
  assert.equal(
    (await request(route + "/sync", "POST", { peerId }, bob.cookie)).body.ended,
    true,
  );
  assert.equal(
    (await request(route + "/join", "POST", { peerId, offer }, bob.cookie))
      .status,
    410,
  );
  assert.equal(
    (await request("streams", "POST", create, alice.cookie)).status,
    409,
    "Ended stream cannot be revived",
  );
  const second = {
    id: crypto.randomUUID(),
    hostKey: crypto.randomUUID(),
    title: "Пропал ведущий",
  };
  await request("streams", "POST", second, alice.cookie);
  await db.query(
    "UPDATE live_streams SET seen_at=now()-interval '41 seconds' WHERE id=$1",
    [second.id],
  );
  assert.equal(
    (
      await request(
        `streams/${second.id}/sync`,
        "POST",
        { hostKey: second.hostKey },
        alice.cookie,
      )
    ).body.ended,
    true,
  );
  assert.ok(
    !(await request("streams", "GET", undefined, bob.cookie)).body.some(
      (s: any) => s.id === second.id,
    ),
  );
  await db.query("UPDATE users SET is_private=$2 WHERE id=$1", [
    bob.id,
    previousPrivacy,
  ]);
}
