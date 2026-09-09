import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { getDatabaseUrl } from "../lib/database-url.ts";
const databaseUrl = getDatabaseUrl();
if (!databaseUrl)
  throw new Error("Добавьте DATABASE_URL в .env.local или окружение.");
const sql = postgres(databaseUrl, { max: 1 });
try {
  const schema = await readFile(
    new URL("../db/schema.sql", import.meta.url),
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(847291063)`;
    await tx.unsafe(schema);
    await tx`CREATE TABLE IF NOT EXISTS telejka_migrations(name text PRIMARY KEY)`;
    const [done] =
      await tx`SELECT 1 FROM telejka_migrations WHERE name='encrypted-media-v1'`;
    if (!done) {
      await tx.unsafe(
        await readFile(new URL("../db/features.sql", import.meta.url), "utf8"),
      );
      await tx`INSERT INTO telejka_migrations(name) VALUES ('encrypted-media-v1')`;
    }
    const [badges] =
      await tx`SELECT 1 FROM telejka_migrations WHERE name='verification-v1'`;
    if (!badges) {
      await tx`ALTER TABLE users ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false`;
      await tx`UPDATE users SET verified=true WHERE id='5158ea3a-fcb5-44cb-8f29-362b94aa1744'`;
      await tx`INSERT INTO telejka_migrations(name) VALUES ('verification-v1')`;
    }
    const [community] =
      await tx`SELECT 1 FROM telejka_migrations WHERE name='community-v1'`;
    if (!community) {
      await tx.unsafe(
        await readFile(new URL("../db/community.sql", import.meta.url), "utf8"),
      );
      await tx`INSERT INTO telejka_migrations(name) VALUES ('community-v1')`;
    }
  });
  console.log("Схема TELEJKA готова.");
} finally {
  await sql.end();
}
