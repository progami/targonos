function normalizeForStableJson(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalizeForStableJson);

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    const entry = record[key];
    if (entry === undefined) continue;
    normalized[key] = normalizeForStableJson(entry);
  }
  return normalized;
}

export function stableStringify(value: unknown): string {
  const json = JSON.stringify(normalizeForStableJson(value));
  return json === undefined ? 'null' : json;
}

