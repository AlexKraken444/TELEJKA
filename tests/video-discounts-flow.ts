import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
export async function videoDiscountsFlow({ db, request, alice, bob }: any) {
  const hash = await bcrypt.hash("local-discount-test", 4);
  async function account(name: string) {
    const id = crypto.randomUUID();
    await db.query(
      "INSERT INTO users(id,name,name_key,color) VALUES($1,$2,$2,$3)",
      [id, name, "#aabbcc"],
    );
    await db.query(
      "INSERT INTO telejka_auth.credentials(user_id,password_hash) VALUES($1,$2)",
      [id, hash],
    );
    const login = await request("auth/login", "POST", {
      name,
      password: "local-discount-test",
    });
    assert.equal(login.status, 200);
    const cookie = login.cookie.split(";")[0];
    await request("rewards", "GET", undefined, cookie);
    return { id, cookie };
  }
  const buyer = await account("discount-test");
  const status = await request(
    "subscriptions/discount",
    "GET",
    undefined,
    buyer.cookie,
  );
  assert.deepEqual(status.body, { available: true, percent: 0 });
  const spins = await Promise.all(
    [1, 2, 3].map(() =>
      request("subscriptions/discount/spin", "POST", {}, buyer.cookie),
    ),
  );
  assert.ok(spins.every((r) => r.status === 200));
  const percent = spins[0].body.percent;
  assert.ok([10, 20, 30, 40, 50].includes(percent));
  assert.ok(spins.every((r) => r.body.percent === percent));
  assert.equal(
    (await request("subscriptions/discount", "GET", undefined, buyer.cookie))
      .body.percent,
    percent,
  );
  assert.equal(
    (
      await request(
        "mini/buy",
        "POST",
        { requestId: crypto.randomUUID() },
        buyer.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request("subscriptions/discount", "GET", undefined, buyer.cookie))
      .body.percent,
    percent,
    "Insufficient funds must not consume the discount",
  );
  await db.query("UPDATE wallets SET balance=2000 WHERE user_id=$1", [
    buyer.id,
  ]);
  const purchase = { requestId: crypto.randomUUID() };
  const result = await request("mini/buy", "POST", purchase, buyer.cookie);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(
    Number(result.body.balance),
    2000 - Math.ceil((150 * (100 - percent)) / 100),
  );
  assert.equal(result.body.discount.available, false);
  assert.equal(
    (await request("mini/buy", "POST", purchase, buyer.cookie)).body.balance,
    result.body.balance,
  );
  assert.equal(
    (await request("subscriptions/discount/spin", "POST", {}, buyer.cookie))
      .status,
    409,
  );
  const plus = await request(
    "plus/buy",
    "POST",
    { requestId: crypto.randomUUID() },
    buyer.cookie,
  );
  assert.equal(Number(plus.body.balance), Number(result.body.balance) - 1000);
  const concurrent = await account("discount-race");
  await db.query("UPDATE wallets SET balance=3000 WHERE user_id=$1", [
    concurrent.id,
  ]);
  const raceSpin = await request(
    "subscriptions/discount/spin",
    "POST",
    {},
    concurrent.cookie,
  );
  const race = await Promise.all(
    ["plus", "mini"].map((tier) =>
      request(
        tier + "/buy",
        "POST",
        { requestId: crypto.randomUUID() },
        concurrent.cookie,
      ),
    ),
  );
  assert.ok(race.every((r) => r.status === 200));
  const ledger = (
    await db.query(
      "SELECT amount::int amount FROM baton_ledger WHERE user_id=$1 AND ref ~ '^(plus|mini):'",
      [concurrent.id],
    )
  ).rows;
  const total = ledger.reduce((n: number, r: any) => n - r.amount, 0),
    p = raceSpin.body.percent;
  assert.ok(
    [
      1000 + Math.ceil((150 * (100 - p)) / 100),
      150 + Math.ceil((1000 * (100 - p)) / 100),
    ].includes(total),
    "Only one simultaneous purchase can receive the discount",
  );
  assert.equal(
    (await request("subscriptions/discount/spin", "POST", {}, bob.cookie))
      .status,
    409,
    "An existing purchaser cannot claim a first-purchase discount",
  );
  // Video feed must omit ordinary posts and preserve account access rules.
  const videoId = crypto.randomUUID(),
    imageId = crypto.randomUUID();
  const video = {
    id: crypto.randomUUID(),
    name: "test.mp4",
    mime: "video/mp4",
    size: 3,
  };
  await db.query(
    "INSERT INTO posts(id,user_id,body,attachments) VALUES($1,$2,'Video',$3),($4,$2,'Photo',$5)",
    [
      videoId,
      buyer.id,
      JSON.stringify([video]),
      imageId,
      JSON.stringify([{ ...video, mime: "image/png" }]),
    ],
  );
  let feed = await request(
    "posts?videos=true&author=" + buyer.id,
    "GET",
    undefined,
    alice.cookie,
  );
  assert.equal(feed.status, 200);
  assert.deepEqual(
    feed.body.map((r: any) => r.id),
    [videoId],
  );
  assert.deepEqual(
    (
      await request(
        "posts?videos=true&author=" + buyer.id + "&offset=1",
        "GET",
        undefined,
        alice.cookie,
      )
    ).body,
    [],
  );
  await db.query("UPDATE users SET is_private=true WHERE id=$1", [buyer.id]);
  assert.deepEqual(
    (
      await request(
        "posts?videos=true&author=" + buyer.id,
        "GET",
        undefined,
        alice.cookie,
      )
    ).body,
    [],
  );
  assert.equal(
    (
      await request(
        "posts?videos=true&mine=true",
        "GET",
        undefined,
        buyer.cookie,
      )
    ).body[0].id,
    videoId,
  );
  await db.query("UPDATE users SET is_private=false WHERE id=$1", [buyer.id]);
  await request(
    "users/" + buyer.id + "/block",
    "POST",
    { blocked: true },
    alice.cookie,
  );
  assert.deepEqual(
    (
      await request(
        "posts?videos=true&author=" + buyer.id,
        "GET",
        undefined,
        alice.cookie,
      )
    ).body,
    [],
  );
  await request(
    "users/" + buyer.id + "/block",
    "POST",
    { blocked: false },
    alice.cookie,
  );
}
