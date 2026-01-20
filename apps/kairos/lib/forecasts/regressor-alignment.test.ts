import { describe, expect, it } from 'vitest';

import { alignPointsToDs } from '@/lib/forecasts/regressor-alignment';

describe('alignPointsToDs', () => {
  it('aligns points to ds values', () => {
    const ds = [1, 2, 3];
    const points = [
      { t: new Date(1000), value: 10 },
      { t: new Date(2000), value: 11 },
      { t: new Date(3000), value: 12 },
    ];

    expect(alignPointsToDs({ ds, points, label: 'Regressor' })).toEqual([10, 11, 12]);
  });

  it('throws when a ds timestamp is missing', () => {
    const ds = [1, 2, 3];
    const points = [
      { t: new Date(1000), value: 10 },
      { t: new Date(3000), value: 12 },
    ];

    expect(() => alignPointsToDs({ ds, points, label: 'Regressor' })).toThrow(
      'Regressor is missing a value for 1970-01-01T00:00:02.000Z.',
    );
  });
});

