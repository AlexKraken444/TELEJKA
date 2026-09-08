import { test } from "node:test";
import assert from "node:assert/strict";
import { getDatabaseUrl } from "../lib/database-url";
const url = "postgresql://test:test@localhost:5432/test";
test("empty manually-created URL does not hide Neon integration URL", () => {
  assert.equal(
    getDatabaseUrl({ DATABASE_URL: "", NEON_DATABASE_URL: url }),
    url,
  );
  assert.equal(
    getDatabaseUrl({ DATABASE_URL: "  ", STORAGE_POSTGRES_URL: url }),
    url,
  );
});
test("accepts non-pooling and custom-prefixed connection variables", () => {
  assert.equal(getDatabaseUrl({ POSTGRES_URL_NON_POOLING: url }), url);
  assert.equal(getDatabaseUrl({ TELEJKA_POSTGRES_URL_NON_POOLING: url }), url);
});
test("ignores malformed placeholders and unrelated URLs", () => {
  assert.equal(
    getDatabaseUrl({ DATABASE_URL: "placeholder", NEON_DATABASE_URL: url }),
    url,
  );
  assert.equal(
    getDatabaseUrl({ DATABASE_URL: "https://example.com", OTHER_URL: url }),
    undefined,
  );
});
test("explicit valid database URL takes precedence", () => {
  assert.equal(
    getDatabaseUrl({ DATABASE_URL: ` ${url} `, NEON_DATABASE_URL: url + "2" }),
    url,
  );
});
