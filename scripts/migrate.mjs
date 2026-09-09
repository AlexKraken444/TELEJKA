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
    await tx.unsafe(schema);
    await tx.unsafe(await readFile(new URL("../db/features.sql", import.meta.url), "utf8"));
  });
  console.log("Схема TELEJKA готова.");
} finally {
  await sql.end();
}
