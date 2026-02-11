import { describe, expect, test } from 'vitest';
import { evaluateListingImageCompliance } from '../lib/listing-images/compliance';

describe('evaluateListingImageCompliance', () => {
  test('requires at least one image', () => {
    const res = evaluateListingImageCompliance([]);
    expect(res.setErrors).toContain('Add at least 1 image.');
  });

  test('blocks more than 9 images', () => {
    const slots = Array.from({ length: 10 }).map((_, i) => ({
      position: i + 1,
      byteSize: 1000,
      width: 2000,
      height: 2000,
    }));
    const res = evaluateListingImageCompliance(slots);
    expect(res.setErrors).toContain('Max 9 images per version.');
  });

  test('warns when main image is not square', () => {
    const res = evaluateListingImageCompliance([
      { position: 1, byteSize: 1000, width: 2000, height: 1500 },
    ]);
    expect(res.slots[0]?.warnings.join(' ')).toContain('Main image should be square.');
  });

  test('warns when shortest side is below 1000px', () => {
    const res = evaluateListingImageCompliance([
      { position: 1, byteSize: 1000, width: 999, height: 2000 },
    ]);
    expect(res.slots[0]?.warnings.join(' ')).toContain('Recommended minimum 1000px');
  });

  test('warns above 10MB and errors above 15MB', () => {
    const warning = evaluateListingImageCompliance([
      { position: 1, byteSize: 11 * 1024 * 1024, width: 2000, height: 2000 },
    ]);
    expect(warning.slots[0]?.warnings.join(' ')).toContain('over 10MB');

    const blocked = evaluateListingImageCompliance([
      { position: 1, byteSize: 16 * 1024 * 1024, width: 2000, height: 2000 },
    ]);
    expect(blocked.slots[0]?.errors.join(' ')).toContain('exceeds 15MB');
  });
});

