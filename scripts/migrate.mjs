import postgres from "postgres";
import { readFile } from "node:fs/promises";
if (!process.env.DATABASE_URL)
  throw new Error("Добавьте DATABASE_URL в .env.local или окружение.");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const schema = await readFile(
    new URL("../db/schema.sql", import.meta.url),
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(schema);
  });
  console.log("Схема TELEJKA готова.");
} finally {
  await sql.end();
}
