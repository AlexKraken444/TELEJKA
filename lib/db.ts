import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDatabaseUrl } from "./database-url";
const globalDb = globalThis as unknown as {
  telejkaSql?: ReturnType<typeof postgres>;
  telejkaSchema?: Promise<void>;
};
export function db() {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_NOT_CONFIGURED");
  return (globalDb.telejkaSql ??= postgres(url, {
    max: process.env.TELEJKA_DB_POOL_SIZE === "1" ? 1 : 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  }));
}
export function databaseUrl() {
  return getDatabaseUrl();
}

export function ensureDatabase() {
  if (!globalDb.telejkaSchema) {
    globalDb.telejkaSchema = (async () => {
      const schema = await readFile(
        join(process.cwd(), "db", "schema.sql"),
        "utf8",
      );
      await db().begin(async (tx) => {
        // Serialize first-run setup across concurrent Vercel functions.
        await tx`SELECT pg_advisory_xact_lock(847291063)`;
        await tx.unsafe(schema);
        await tx`CREATE TABLE IF NOT EXISTS telejka_migrations (name text PRIMARY KEY)`;
        const [done] =
          await tx`SELECT 1 FROM telejka_migrations WHERE name='encrypted-media-v1'`;
        if (!done) {
          await tx.unsafe(
            await readFile(join(process.cwd(), "db", "features.sql"), "utf8"),
          );
          await tx`INSERT INTO telejka_migrations(name) VALUES ('encrypted-media-v1')`;
        }
      });
    })().catch((error) => {
      globalDb.telejkaSchema = undefined;
      throw error;
    });
  }
  return globalDb.telejkaSchema;
}
