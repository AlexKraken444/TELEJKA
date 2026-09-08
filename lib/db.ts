import postgres from "postgres";
const globalDb = globalThis as unknown as {
  telejkaSql?: ReturnType<typeof postgres>;
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
  return process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
}
