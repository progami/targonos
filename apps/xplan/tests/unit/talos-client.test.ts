import { describe, expect, it } from 'vitest';
import { validateTalosDatabaseUrl } from '@/lib/integrations/talos-url';

describe('talos-client', () => {
  it('throws when schema is still using main_wms_*', () => {
    expect(() =>
      validateTalosDatabaseUrl(
        'US',
        'postgresql://user:pass@localhost:5432/portal_db?schema=main_wms_us',
      ),
    ).toThrow(/main_wms_us/);
  });

  it('throws when schema suffix does not match region', () => {
    expect(() =>
      validateTalosDatabaseUrl(
        'US',
        'postgresql://user:pass@localhost:5432/portal_db?schema=main_talos_uk',
      ),
    ).toThrow(/does not match region/);
  });
});
