import assert from "node:assert/strict";
import sharp from "sharp";
import bcrypt from "bcryptjs";
// Runs against the real API and local PostgreSQL fixture, never production.
export async function commerceFlow({
  db,
  request,
  alice,
  bob,
  vera,
  direct,
  changedEnvelope,
  origin,
}: any) {
  await db.query("UPDATE users SET is_private=false WHERE id IN ($1,$2)", [
    alice.id,
    bob.id,
  ]);
  await db.query("UPDATE wallets SET balance=1000 WHERE user_id=$1", [bob.id]);
  await db.query("UPDATE wallets SET balance=0 WHERE user_id=$1", [alice.id]);
  const path = "chats/" + direct.body.id + "/batons";
  for (const amount of [0, 1001, 1.5])
    assert.equal(
      (
        await request(
          path,
          "POST",
          { amount, requestId: crypto.randomUUID() },
          bob.cookie,
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await request(
        path,
        "POST",
        { amount: 1, requestId: crypto.randomUUID() },
        vera.cookie,
      )
    ).status,
    403,
  );
  const transfer = { amount: 600, requestId: crypto.randomUUID() };
  const sent = await Promise.all([
    request(path, "POST", transfer, bob.cookie),
    request(path, "POST", transfer, bob.cookie),
  ]);
  assert.ok(
    sent.every((r) => r.status === 200),
    JSON.stringify(sent),
  );
  assert.equal(sent[0].body.message_id, sent[1].body.message_id);
  async function balance(who: any) {
    return Number(
      (await request("economy", "GET", undefined, who.cookie)).body.balance,
    );
  }
  assert.equal(await balance(bob), 400);
  assert.equal(await balance(alice), 600);
  assert.equal(
    (await request(path, "POST", { ...transfer, amount: 1 }, bob.cookie))
      .status,
    409,
  );
  assert.equal(
    (
      await request(
        path,
        "POST",
        { amount: 401, requestId: crypto.randomUUID() },
        bob.cookie,
      )
    ).status,
    400,
  );
  const race = await Promise.all(
    [1, 2].map(() =>
      request(
        path,
        "POST",
        { amount: 300, requestId: crypto.randomUUID() },
        bob.cookie,
      ),
    ),
  );
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 400]);
  assert.equal(await balance(bob), 100);
  const receipt = (
    await request(
      "chats/" + direct.body.id + "/messages",
      "GET",
      undefined,
      alice.cookie,
    )
  ).body.find((m: any) => m.id === sent[0].body.message_id);
  assert.equal(receipt.baton_amount, 600);
  assert.equal(
    (
      await request(
        "chats/" + direct.body.id + "/messages/" + receipt.id,
        "PATCH",
        { envelope: changedEnvelope },
        bob.cookie,
      )
    ).status,
    404,
  );
  const group = await request(
    "chats",
    "POST",
    { isGroup: true, title: "No transfers", userIds: [bob.id, vera.id] },
    alice.cookie,
  );
  assert.equal(
    (
      await request(
        "chats/" + group.body.id + "/batons",
        "POST",
        { amount: 1, requestId: crypto.randomUUID() },
        bob.cookie,
      )
    ).status,
    403,
  );
  await request(
    "users/" + bob.id + "/block",
    "POST",
    { blocked: true },
    alice.cookie,
  );
  assert.equal(
    (
      await request(
        path,
        "POST",
        { amount: 1, requestId: crypto.randomUUID() },
        bob.cookie,
      )
    ).status,
    403,
  );
  await request(
    "users/" + bob.id + "/block",
    "POST",
    { blocked: false },
    alice.cookie,
  );
  const ownerBefore = await balance(alice);
  assert.equal(
    (
      await request(
        path,
        "POST",
        { amount: 1000, requestId: crypto.randomUUID() },
        alice.cookie,
      )
    ).status,
    200,
  );
  assert.equal(await balance(alice), ownerBefore);
  assert.equal(await balance(bob), 1100);
  const image =
    "data:image/webp;base64," +
    (
      await sharp({
        create: { width: 10, height: 10, channels: 3, background: "#81aa43" },
      })
        .webp()
        .toBuffer()
    ).toString("base64");
  const draft = { slot: 1, image, link: "", requestId: crypto.randomUUID() };
  const ad = await request("ads", "POST", draft, bob.cookie);
  assert.equal(ad.status, 200, JSON.stringify(ad.body));
  assert.equal(
    (await request("ads", "POST", draft, bob.cookie)).body.id,
    ad.body.id,
  );
  assert.equal(await balance(bob), 1085);
  const slots = (await request("ads", "GET", undefined, vera.cookie)).body
    .slots;
  assert.equal(slots.length, 5);
  assert.equal(slots[0].available, false);
  assert.equal(slots[0].id, undefined);
  assert.equal(
    (
      await request(
        "ads",
        "POST",
        { ...draft, requestId: crypto.randomUUID() },
        alice.cookie,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        "ads",
        "POST",
        {
          ...draft,
          slot: 2,
          link: "javascript:alert(1)",
          requestId: crypto.randomUUID(),
        },
        bob.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "adadmin/login",
        "POST",
        { password: "anything" },
        bob.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(origin + "/api/ads/" + ad.body.id + "/image", {
        headers: { Cookie: vera.cookie },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("adadmin", "GET", undefined, alice.cookie)).status,
    403,
  );
  const password = "local-test-password";
  await db.query("UPDATE telejka_auth.ad_settings SET password_hash=$1", [
    await bcrypt.hash(password, 4),
  ]);
  assert.equal(
    (
      await request(
        "adadmin/login",
        "POST",
        { password: "wrong" },
        alice.cookie,
      )
    ).status,
    403,
  );
  const login = await request(
    "adadmin/login",
    "POST",
    { password },
    alice.cookie,
  );
  assert.equal(login.status, 200);
  const admin = alice.cookie + "; " + login.cookie.split(";")[0];
  assert.equal(
    (await request("adadmin", "GET", undefined, admin)).body.length,
    1,
  );
  assert.equal(
    (
      await request(
        "adadmin/" + ad.body.id,
        "POST",
        { approve: false },
        bob.cookie + "; " + login.cookie.split(";")[0],
      )
    ).status,
    403,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await request(
          "adadmin/" + ad.body.id,
          "POST",
          { approve: false },
          admin,
        )
      ).status,
      200,
    );
  assert.equal(await balance(bob), 1100);
  const next = await request(
    "ads",
    "POST",
    { ...draft, requestId: crypto.randomUUID() },
    bob.cookie,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await request(
          "adadmin/" + next.body.id,
          "POST",
          { approve: true },
          admin,
        )
      ).status,
      200,
    );
  assert.equal(
    (await request("ads", "GET", undefined, vera.cookie)).body.slots[0].id,
    next.body.id,
  );
  const photo = await fetch(origin + "/api/ads/" + next.body.id + "/image", {
    headers: { Cookie: vera.cookie },
  });
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("content-type"), "image/webp");
  assert.equal(
    (
      await db.query(
        "SELECT extract(epoch FROM ends_at-starts_at)::int seconds FROM advertisements WHERE id=$1",
        [next.body.id],
      )
    ).rows[0].seconds,
    604800,
  );
  const pref = {
    is_private: false,
    name_color: null,
    allowed_ids: [],
    ad_block: true,
  };
  assert.equal(
    (await request("me/preferences", "PATCH", pref, bob.cookie)).status,
    403,
  );
  assert.equal(
    (await request("me/preferences", "PATCH", pref, alice.cookie)).status,
    200,
  );
  assert.deepEqual(
    (await request("ads", "GET", undefined, alice.cookie)).body,
    { hidden: true, slots: [] },
  );
  await db.query(
    "UPDATE users SET plus_until=now()-interval '1 minute' WHERE id=$1",
    [alice.id],
  );
  assert.equal(
    (await request("ads", "GET", undefined, alice.cookie)).body.slots.length,
    5,
  );
  await db.query(
    "UPDATE advertisements SET ends_at=now()-interval '1 minute' WHERE id=$1",
    [next.body.id],
  );
  assert.equal(
    (await request("ads", "GET", undefined, bob.cookie)).body.slots[0]
      .available,
    true,
  );
  assert.equal(
    (
      await request(
        "ads",
        "POST",
        { ...draft, requestId: crypto.randomUUID() },
        bob.cookie,
      )
    ).status,
    200,
  );
  for (let slot = 2; slot <= 5; slot++)
    assert.equal(
      (
        await request(
          "ads",
          "POST",
          { ...draft, slot, requestId: crypto.randomUUID() },
          bob.cookie,
        )
      ).status,
      200,
    );
  assert.equal(
    (
      await request(
        "ads",
        "POST",
        { ...draft, slot: 6, requestId: crypto.randomUUID() },
        bob.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request("ads", "GET", undefined, bob.cookie)).body.slots.filter(
      (s: any) => s.available,
    ).length,
    0,
  );
}
