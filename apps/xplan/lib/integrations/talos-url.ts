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

  const invalidSchemas = new Set(['main_wms_us', 'main_wms_uk', 'dev_wms_us', 'dev_wms_uk']);
  if (invalidSchemas.has(normalized)) {
    const expected =
      normalized.startsWith('dev_')
        ? region === 'UK'
          ? 'dev_talos_uk'
          : 'dev_talos_us'
        : region === 'UK'
          ? 'main_talos_uk'
          : 'main_talos_us';

    throw new Error(
      `${talosKey} schema "${schema}" is invalid. Use schema="${expected}" (Talos schemas: dev_talos_us/dev_talos_uk or main_talos_us/main_talos_uk).`,
    );
  }

  if (normalized.endsWith('_us') || normalized.endsWith('_uk')) {
    const expectedSuffix = region === 'UK' ? '_uk' : '_us';
    if (!normalized.endsWith(expectedSuffix)) {
      throw new Error(`${talosKey} schema "${schema}" does not match region ${region}.`);
    }
  }
}

