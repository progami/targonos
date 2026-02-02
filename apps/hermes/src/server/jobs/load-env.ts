import { createRequire } from "module";

let loaded = false;

const require = createRequire(import.meta.url);
const nextEnv = require("@next/env") as { loadEnvConfig: (dir: string, dev: boolean) => void };

export function loadHermesEnv(): void {
  if (loaded) return;
  loaded = true;

  const nodeEnv = process.env.NODE_ENV;
  const dev = typeof nodeEnv === "string" ? nodeEnv !== "production" : false;

  nextEnv.loadEnvConfig(process.cwd(), dev);
}
