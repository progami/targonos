function normalizeEnvValue(value: string | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export function envFlag(name: string): boolean {
  const v = normalizeEnvValue(process.env[name]);
  return v === "1" || v === "true" || v === "yes";
}

export function isHermesDryRun(): boolean {
  return envFlag("HERMES_DRY_RUN");
}

