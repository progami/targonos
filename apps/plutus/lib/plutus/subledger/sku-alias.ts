export type SkuAliasCandidate = {
  canonicalProductId: string;
  marketplace: string;
  aliasType: string;
  value: string;
};

export function normalizeAliasLookupValue(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function resolveCanonicalProductAlias(
  aliases: SkuAliasCandidate[],
  marketplace: string,
  aliasType: string,
  value: string,
): string | null {
  const normalizedMarketplace = marketplace.trim();
  const normalizedAliasType = aliasType.trim().toUpperCase();
  const normalizedValue = normalizeAliasLookupValue(value);

  if (normalizedMarketplace === '') return null;
  if (normalizedAliasType === '') return null;
  if (normalizedValue === '') return null;

  for (const alias of aliases) {
    if (alias.marketplace !== normalizedMarketplace) continue;
    if (alias.aliasType.trim().toUpperCase() !== normalizedAliasType) continue;
    if (normalizeAliasLookupValue(alias.value) !== normalizedValue) continue;
    return alias.canonicalProductId;
  }

  return null;
}
