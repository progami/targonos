import type { StrategyRegion } from '@/lib/strategy-region';

type TalosRegion = Extract<StrategyRegion, 'US' | 'UK'>;

export function schemaFromDatabaseUrl(url: string): string | null {
  const schema = new URL(url).searchParams.get('schema');
  if (!schema) return null;
  const trimmed = schema.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateTalosDatabaseUrl(region: TalosRegion, url: string) {
  const schema = schemaFromDatabaseUrl(url);
  if (!schema) return;

  const talosKey = region === 'UK' ? 'TALOS_DATABASE_URL_UK' : 'TALOS_DATABASE_URL_US';
  const normalized = schema.toLowerCase();

  if (normalized.endsWith('_us') || normalized.endsWith('_uk')) {
    const expectedSuffix = region === 'UK' ? '_uk' : '_us';
    if (!normalized.endsWith(expectedSuffix)) {
      throw new Error(`${talosKey} schema "${schema}" does not match region ${region}.`);
    }

    if (!normalized.includes('talos')) {
      const devExpected = region === 'UK' ? 'dev_talos_uk' : 'dev_talos_us';
      const mainExpected = region === 'UK' ? 'main_talos_uk' : 'main_talos_us';
      throw new Error(
        `${talosKey} schema "${schema}" is invalid. Use schema="${devExpected}" or schema="${mainExpected}".`,
      );
    }
  }
}
