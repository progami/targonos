import { readFileSync } from "fs";
import { join } from "path";
// NOTE: use relative imports so this module can run both in Next.js and in a standalone worker.
import { getPgPool } from "./pool";

let didRun = false;

/**
 * Dev convenience: auto-create Hermes tables if HERMES_AUTO_MIGRATE=1.
 *
 * Production recommendation: run db/schema.sql via your normal migration system.
 */
export async function maybeAutoMigrate(): Promise<void> {
  if (didRun) return;
  didRun = true;

  if (process.env.HERMES_AUTO_MIGRATE !== "1") return;

  const pool = getPgPool();
  const schemaPath = join(process.cwd(), "db", "schema.sql");
  const sql = readFileSync(schemaPath, "utf8");
  await pool.query(sql);
}
