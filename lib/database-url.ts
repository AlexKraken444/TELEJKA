type Environment = Record<string, string | undefined>;

function postgresUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (
      (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
      url.hostname
    )
      return trimmed;
  } catch {
    /* Ignore empty or invalid placeholders; try the integration variables. */
  }
  return undefined;
}

// Vercel integrations may add a custom prefix. An empty manual DATABASE_URL
// must not hide the actual connection supplied by the integration.
export function getDatabaseUrl(env: Environment = process.env) {
  for (const name of [
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
  ]) {
    const value = postgresUrl(env[name]);
    if (value) return value;
  }
  for (const name of Object.keys(env).sort()) {
    if (
      name.endsWith("_DATABASE_URL") ||
      name.endsWith("_POSTGRES_URL") ||
      name.endsWith("_POSTGRES_URL_NON_POOLING")
    ) {
      const value = postgresUrl(env[name]);
      if (value) return value;
    }
  }
  return undefined;
}
