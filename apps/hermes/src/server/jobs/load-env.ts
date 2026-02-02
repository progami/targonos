import * as nextEnv from "@next/env";

let loaded = false;

export function loadHermesEnv(): void {
  if (loaded) return;
  loaded = true;

  const nodeEnv = process.env.NODE_ENV;
  const dev = typeof nodeEnv === "string" ? nodeEnv !== "production" : false;

  nextEnv.loadEnvConfig(process.cwd(), dev);
}
