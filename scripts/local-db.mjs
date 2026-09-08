// Development and tests only. Production always uses an external PostgreSQL database.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFile } from "node:fs/promises";
const db = await PGlite.create(process.env.LOCAL_DB_PATH || "./.local-db");
await db.exec(
  await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"),
);
const server = new PGLiteSocketServer({ db, port: 5433, host: "127.0.0.1" });
await server.start();
console.log(
  "Локальная БД готова: postgresql://postgres:postgres@127.0.0.1:5433/postgres",
);
async function stop() {
  await server.stop();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
