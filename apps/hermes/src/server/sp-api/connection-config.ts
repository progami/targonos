import type { SpApiConfig } from "./client";

function getEnvOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required for Hermes SP-API calls`);
  return v;
}

function getBool(name: string, fallback: boolean = false): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

/**
 * Hermes stores marketplace connections elsewhere in TargonOS.
 *
 * For this standalone app package, we support a pragmatic dev mapping via env:
 * - global SPAPI_* env vars for a single connection
 * - OR a JSON array of per-connection overrides in HERMES_CONNECTIONS_JSON
 *
 * Production recommendation:
 * - load per-connection refresh tokens from your encrypted connection store
 * - do NOT keep refresh tokens in env
 */
export function loadSpApiConfigForConnection(connectionId: string): SpApiConfig {
  const mappingRaw = process.env.HERMES_CONNECTIONS_JSON;
  let mapping: any | undefined;

  if (mappingRaw) {
    try {
      const parsed = JSON.parse(mappingRaw);
      if (Array.isArray(parsed)) {
        mapping = parsed.find((x) => x?.connectionId === connectionId);
      }
    } catch {
      // ignore
    }
  }

  const region = (mapping?.region ?? process.env.SPAPI_REGION ?? "NA") as "NA" | "EU" | "FE";
  const sandbox = Boolean(mapping?.sandbox ?? getBool("SPAPI_SANDBOX", false));

  return {
    region,
    sandbox,
    endpointOverride:
      (mapping?.endpointOverride ?? process.env.SPAPI_ENDPOINT_OVERRIDE) || undefined,
    awsRegionOverride:
      (mapping?.awsRegionOverride ?? process.env.SPAPI_AWS_REGION_OVERRIDE) || undefined,
    lwaClientId: getEnvOrThrow("SPAPI_LWA_CLIENT_ID"),
    lwaClientSecret: getEnvOrThrow("SPAPI_LWA_CLIENT_SECRET"),
    lwaRefreshToken: mapping?.lwaRefreshToken ?? getEnvOrThrow("SPAPI_LWA_REFRESH_TOKEN"),
    awsAccessKeyId: getEnvOrThrow("SPAPI_AWS_ACCESS_KEY_ID"),
    awsSecretAccessKey: getEnvOrThrow("SPAPI_AWS_SECRET_ACCESS_KEY"),
    awsRoleArn: (mapping?.awsRoleArn ?? process.env.SPAPI_AWS_ROLE_ARN) || undefined,
    userAgent: mapping?.userAgent ?? process.env.SPAPI_USER_AGENT ?? "targon-hermes/0.1",
  };
}
