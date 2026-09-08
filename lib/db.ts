import postgres from "postgres";
const globalDb = globalThis as unknown as {
  telejkaSql?: ReturnType<typeof postgres>;
};
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  return (globalDb.telejkaSql ??= postgres(process.env.DATABASE_URL, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  }));
}
