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

/**
 * Singleton PG pool (works in Next.js dev/hmr without opening many connections).
 */
export function getPgPool(): Pool {
  if (!globalThis.__hermesPgPool) {
    globalThis.__hermesPgPool = new Pool({ connectionString: getDatabaseUrl() });
  }
  return globalThis.__hermesPgPool;
}
