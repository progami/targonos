export type HermesConnectionTarget = {
  connectionId: string;
  marketplaceIds: string[];
};

function csvToList(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickDefaultMarketplaceIds(): string[] {
  const csv = process.env.HERMES_DEFAULT_MARKETPLACE_IDS ?? process.env.HERMES_DEFAULT_MARKETPLACE_ID;
  return csvToList(csv);
}

/**
 * Hermes stores connections elsewhere in TargonOS.
 *
 * For this standalone app package we support:
 * - HERMES_CONNECTIONS_JSON='[{connectionId, marketplaceIds:[...], ...}]'
 * - OR a single "default" connection via SPAPI_* + HERMES_DEFAULT_MARKETPLACE_IDS
 */
export function listConnectionTargets(): HermesConnectionTarget[] {
  const mappingRaw = process.env.HERMES_CONNECTIONS_JSON;

  // 1) Prefer explicit mapping list
  if (mappingRaw) {
    try {
      const parsed = JSON.parse(mappingRaw);
      if (Array.isArray(parsed)) {
        const out: HermesConnectionTarget[] = [];
        for (const x of parsed) {
          const connectionId = typeof x?.connectionId === "string" ? x.connectionId : null;
          if (!connectionId) continue;

          const mids =
            Array.isArray(x?.marketplaceIds)
              ? (x.marketplaceIds as any[])
                  .filter((v) => typeof v === "string" && v.trim())
                  .map((v) => String(v).trim())
              : typeof x?.marketplaceIds === "string"
                ? csvToList(x.marketplaceIds)
                : typeof x?.marketplaceId === "string"
                  ? [String(x.marketplaceId).trim()].filter(Boolean)
                  : [];

          const marketplaceIds = mids.length > 0 ? mids : pickDefaultMarketplaceIds();
          if (marketplaceIds.length === 0) continue;

          out.push({ connectionId, marketplaceIds });
        }
        if (out.length > 0) return out;
      }
    } catch {
      // ignore
    }
  }

  // 2) Fallback: single default connection
  const connectionId = process.env.HERMES_DEFAULT_CONNECTION_ID ?? "default";
  const marketplaceIds = pickDefaultMarketplaceIds();
  if (marketplaceIds.length === 0) {
    // No targets configured — return empty so the worker can log a clear message.
    return [];
  }
  return [{ connectionId, marketplaceIds }];
}
