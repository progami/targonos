import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __hermesPgPool: Pool | undefined;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Hermes requires a database to enforce idempotency (no duplicate review requests)."
    );
  }
  return url;
}

function getDatabaseOptions(): string | undefined {
  const schema = process.env.HERMES_DB_SCHEMA;
  if (typeof schema !== "string") return undefined;
  const trimmed = schema.trim();
  if (trimmed.length === 0) return undefined;

  return `-c search_path=${trimmed}`;
}

/**
 * Singleton PG pool (works in Next.js dev/hmr without opening many connections).
 */
export function getPgPool(): Pool {
  if (!globalThis.__hermesPgPool) {
    const connectionString = getDatabaseUrl();
    const options = getDatabaseOptions();
    globalThis.__hermesPgPool = new Pool(
      options ? { connectionString, options } : { connectionString }
    );
  }
  return globalThis.__hermesPgPool;
}
