import type { SpApiConfig } from "./client";

type HermesConnectionMapping = {
  connectionId?: string;
  region?: "NA" | "EU" | "FE";
  sandbox?: boolean;
  endpointOverride?: string;
  awsRegionOverride?: string;
  lwaRefreshToken?: string;
  awsRoleArn?: string;
  userAgent?: string;
};

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

function parseConnectionMappings(): HermesConnectionMapping[] | null {
  const mappingRaw = process.env.HERMES_CONNECTIONS_JSON;
  if (!mappingRaw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(mappingRaw);
  } catch {
    throw new Error("HERMES_CONNECTIONS_JSON must be valid JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("HERMES_CONNECTIONS_JSON must be a JSON array");
  }

  return parsed as HermesConnectionMapping[];
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
  const mappings = parseConnectionMappings();
  let mapping: HermesConnectionMapping | null = null;

  if (mappings) {
    for (const item of mappings) {
      if (item?.connectionId === connectionId) {
        mapping = item;
        break;
      }
    }

    if (!mapping) {
      const configuredIds = mappings
        .map((item) => {
          if (typeof item?.connectionId !== "string") return null;
          const trimmed = item.connectionId.trim();
          if (!trimmed) return null;
          return trimmed;
        })
        .filter((id): id is string => Boolean(id));
      const configuredIdsLabel = configuredIds.length > 0 ? configuredIds.join(", ") : "none";

      throw new Error(
        `Unknown Hermes connectionId "${connectionId}" for SP-API config (configured: ${configuredIdsLabel})`
      );
    }
  } else {
    const defaultConnectionId = process.env.HERMES_DEFAULT_CONNECTION_ID ?? "default";
    if (connectionId !== defaultConnectionId) {
      throw new Error(
        `Unknown Hermes connectionId "${connectionId}" for SP-API config (expected default "${defaultConnectionId}")`
      );
    }
  }

  const region = (mapping?.region ?? process.env.SPAPI_REGION ?? "NA") as "NA" | "EU" | "FE";
  const sandbox = Boolean(mapping?.sandbox ?? getBool("SPAPI_SANDBOX", false));

  return {
    region,
    sandbox,
    endpointOverride:
      mapping?.endpointOverride ?? process.env.SPAPI_ENDPOINT_OVERRIDE,
    awsRegionOverride:
      mapping?.awsRegionOverride ?? process.env.SPAPI_AWS_REGION_OVERRIDE,
    lwaClientId: getEnvOrThrow("SPAPI_LWA_CLIENT_ID"),
    lwaClientSecret: getEnvOrThrow("SPAPI_LWA_CLIENT_SECRET"),
    lwaRefreshToken: mapping?.lwaRefreshToken ?? getEnvOrThrow("SPAPI_LWA_REFRESH_TOKEN"),
    awsAccessKeyId: getEnvOrThrow("SPAPI_AWS_ACCESS_KEY_ID"),
    awsSecretAccessKey: getEnvOrThrow("SPAPI_AWS_SECRET_ACCESS_KEY"),
    awsRoleArn: mapping?.awsRoleArn ?? process.env.SPAPI_AWS_ROLE_ARN,
    userAgent: mapping?.userAgent ?? process.env.SPAPI_USER_AGENT ?? "targon-hermes/0.1",
  };
}
