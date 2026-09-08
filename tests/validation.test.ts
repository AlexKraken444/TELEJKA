import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registerSchema,
  nameKey,
  bodySchema,
  avatarSchema,
} from "../lib/validation";
test("registration accepts Cyrillic and optional profile fields", () => {
  const user = registerSchema.parse({
    name: "  Саша  ",
    password: "correct-horse-42",
  });
  assert.equal(user.name, "Саша");
  assert.equal(user.bio, "");
  assert.equal(nameKey("САША"), nameKey("саша"));
});
test("rejects short passwords and bcrypt byte truncation", () => {
  assert.equal(
    registerSchema.safeParse({ name: "Саша", password: "123" }).success,
    false,
  );
  assert.equal(
    registerSchema.safeParse({ name: "Саша", password: "я".repeat(40) })
      .success,
    false,
  );
});
test("rejects empty posts, overly long comments and active avatar formats", () => {
  assert.equal(bodySchema(2000).safeParse("  ").success, false);
  assert.equal(bodySchema(1000).safeParse("x".repeat(1001)).success, false);
  assert.equal(
    avatarSchema.safeParse("data:image/svg+xml;base64,AAAA").success,
    false,
  );
  assert.equal(
    avatarSchema.safeParse("https://other.example/avatar.png").success,
    false,
  );
});
