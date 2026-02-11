import { describe, expect, test } from 'vitest';
import { buildListingSignalExtracted, buildSignalChangeSummary, signalContentHash } from '../lib/capture/signal';

describe('capture signal', () => {
  test('hash only depends on title/price/images', () => {
    const a = buildListingSignalExtracted({
      title: 'A',
      price: 10,
      rating: 4.9,
      reviewCount: 100,
      imageUrls: ['https://m.media-amazon.com/images/I/AAA._AC_SL1500_.jpg'],
    });
    const b = buildListingSignalExtracted({
      title: 'A',
      price: 10,
      rating: 4.1,
      reviewCount: 101,
      imageUrls: ['https://m.media-amazon.com/images/I/AAA._AC_SL1500_.jpg'],
    });

    expect(signalContentHash(a)).toBe(signalContentHash(b));
  });

  test('detects title change', () => {
    const prev = buildListingSignalExtracted({ title: 'Old', price: 10, imageUrls: [] });
    const curr = buildListingSignalExtracted({ title: 'New', price: 10, imageUrls: [] });
    const s = buildSignalChangeSummary(prev, curr);
    expect(s.titleChanged).toBe(true);
    expect(s.imagesChanged).toBe(false);
  });

  test('computes price deltas', () => {
    const prev = buildListingSignalExtracted({ title: 'A', price: 10, imageUrls: [] });
    const curr = buildListingSignalExtracted({ title: 'A', price: 12, imageUrls: [] });
    const s = buildSignalChangeSummary(prev, curr);
    expect(s.priceBefore).toBe(10);
    expect(s.priceAfter).toBe(12);
    expect(s.priceDeltaAbs).toBe(2);
    expect(s.priceDeltaPct).toBeCloseTo(20, 5);
  });

  test('detects image reorder without add/remove', () => {
    const prev = buildListingSignalExtracted({
      title: 'A',
      price: 10,
      imageUrls: [
        'https://m.media-amazon.com/images/I/AAA._AC_SL1500_.jpg',
        'https://m.media-amazon.com/images/I/BBB._AC_SL1500_.jpg',
        'https://m.media-amazon.com/images/I/CCC._AC_SL1500_.jpg',
      ],
    });
    const curr = buildListingSignalExtracted({
      title: 'A',
      price: 10,
      imageUrls: [
        'https://m.media-amazon.com/images/I/AAA._AC_SL1500_.jpg',
        'https://m.media-amazon.com/images/I/CCC._AC_SL1500_.jpg',
        'https://m.media-amazon.com/images/I/BBB._AC_SL1500_.jpg',
      ],
    });
    const s = buildSignalChangeSummary(prev, curr);
    expect(s.imagesChanged).toBe(true);
    expect(s.mainChanged).toBe(false);
    expect(s.reordered).toBe(true);
    expect(s.addedCount).toBe(0);
    expect(s.removedCount).toBe(0);
  });

  test('detects image add/remove', () => {
    const prev = buildListingSignalExtracted({
      title: 'A',
      price: 10,
      imageUrls: [
        'https://m.media-amazon.com/images/I/AAA._AC_SL1500_.jpg',
        'https://m.media-amazon.com/images/I/BBB._AC_SL1500_.jpg',
      ],
    });
    const curr = buildListingSignalExtracted({
      title: 'A',
      price: 10,
      imageUrls: [
        'https://m.media-amazon.com/images/I/AAA._AC_SL1500_.jpg',
        'https://m.media-amazon.com/images/I/BBB._AC_SL1500_.jpg',
        'https://m.media-amazon.com/images/I/CCC._AC_SL1500_.jpg',
      ],
    });
    const s = buildSignalChangeSummary(prev, curr);
    expect(s.imagesChanged).toBe(true);
    expect(s.addedCount).toBe(1);
    expect(s.removedCount).toBe(0);
  });
});

