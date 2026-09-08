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
    max: 3,
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
      });
    })().catch((error) => {
      globalDb.telejkaSchema = undefined;
      throw error;
    });
  }
  return globalDb.telejkaSchema;
}
