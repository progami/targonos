import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __hermesPgPool: Pool | undefined;
}

function withSchemaOverride(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set("application_name", "hermes");

  const schema = process.env.HERMES_DB_SCHEMA;
  if (typeof schema !== "string") return url.toString();
  const trimmed = schema.trim();
  if (trimmed.length === 0) return url.toString();

  const existingOptions = url.searchParams.get("options");
  if (typeof existingOptions !== "string" || existingOptions.trim().length === 0) {
    url.searchParams.set("options", `-c search_path=${trimmed}`);
    return url.toString();
  }

  if (!existingOptions.includes("search_path=")) {
    url.searchParams.set("options", `${existingOptions.trim()} -c search_path=${trimmed}`);
    return url.toString();
  }

  url.searchParams.set(
    "options",
    existingOptions.replace(/search_path=([^\s]+)/g, `search_path=${trimmed}`)
  );

  return url.toString();
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Hermes requires a database to enforce idempotency (no duplicate review requests)."
    );
  }
  return withSchemaOverride(url);
}

/**
 * Singleton PG pool (works in Next.js dev/hmr without opening many connections).
 */
export function getPgPool(): Pool {
  if (!globalThis.__hermesPgPool) {
    const connectionString = getDatabaseUrl();
    globalThis.__hermesPgPool = new Pool({ connectionString });
  }
  return globalThis.__hermesPgPool;
}
