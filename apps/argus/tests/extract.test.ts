import { describe, expect, test } from 'vitest';
import { extractAsinFields } from '../lib/capture/extract-asin';
import { stableStringify } from '../lib/capture/stable-json';
import { sha256Hex } from '../lib/capture/hash';

describe('extractAsinFields', () => {
  test('parses core fields from CSS selectors', () => {
    const html = `
      <html>
        <body>
          <span id="productTitle">  My Product  </span>
          <div id="corePriceDisplay_desktop_feature_div">
            <span class="a-offscreen">$19.99</span>
          </div>
          <span data-hook="rating-out-of-text">4.5 out of 5</span>
          <span id="acrCustomerReviewText">1,234 ratings</span>
          <img
            id="landingImage"
            src="https://example.com/landing-thumb.jpg"
            data-a-dynamic-image='{"https://example.com/landing-sm.jpg":[400,400],"https://example.com/landing-lg.jpg":[1200,1200]}'
          />
          <div id="altImages">
            <img
              src="https://example.com/alt-thumb.jpg"
              data-old-hires="https://example.com/alt-hires.jpg"
            />
          </div>
        </body>
      </html>
    `;

    const { normalized } = extractAsinFields(html);
    expect(normalized.title).toBe('My Product');
    expect(normalized.price).toBe(19.99);
    expect(normalized.rating).toBe(4.5);
    expect(normalized.reviewCount).toBe(1234);
    expect(normalized.imageUrls).toEqual([
      'https://example.com/landing-lg.jpg',
      'https://example.com/alt-hires.jpg',
    ]);
  });

  test('handles fallback price selectors', () => {
    const html = `
      <html>
        <body>
          <span id="productTitle">Deal Product</span>
          <span id="priceblock_dealprice">$29.99</span>
        </body>
      </html>
    `;

    const { normalized } = extractAsinFields(html);
    expect(normalized.title).toBe('Deal Product');
    expect(normalized.price).toBe(29.99);
  });

  test('handles acrPopover rating fallback', () => {
    const html = `
      <html>
        <body>
          <span id="productTitle">Rated Product</span>
          <a id="acrPopover" title="4.2 out of 5 stars"></a>
          <span id="acrCustomerReviewText">567 ratings</span>
        </body>
      </html>
    `;

    const { normalized } = extractAsinFields(html);
    expect(normalized.title).toBe('Rated Product');
    expect(normalized.rating).toBe(4.2);
    expect(normalized.reviewCount).toBe(567);
  });

  test('returns empty fields when no product elements are present', () => {
    const html = `<html><body><p>Empty page</p></body></html>`;
    const { normalized } = extractAsinFields(html);
    expect(normalized.title).toBeUndefined();
    expect(normalized.price).toBeUndefined();
    expect(normalized.rating).toBeUndefined();
    expect(normalized.reviewCount).toBeUndefined();
    expect(normalized.imageUrls).toEqual([]);
  });

  test('stores raw text values for debugging', () => {
    const html = `
      <html>
        <body>
          <span id="productTitle">Debug Product</span>
        </body>
      </html>
    `;

    const { raw } = extractAsinFields(html);
    expect(raw.titleText).toBe('Debug Product');
  });

  test('upgrades Amazon image URLs to high-res and filters video placeholders', () => {
    const html = `
      <html>
        <body>
          <span id="productTitle">Images Product</span>
          <img
            id="landingImage"
            src="https://m.media-amazon.com/images/I/41fsFSi90sL._AC_US100_.jpg"
          />
          <div id="altImages">
            <img src="https://m.media-amazon.com/images/I/91JRE11UrzL.SS125_PKplay-button-mb-image-grid-small_.jpg" />
            <img src="https://m.media-amazon.com/images/I/51NOmHTSK1L._AC_US100_.jpg" />
          </div>
        </body>
      </html>
    `;

    const { normalized } = extractAsinFields(html);
    expect(normalized.imageUrls).toEqual([
      'https://m.media-amazon.com/images/I/41fsFSi90sL._AC_SL1500_.jpg',
      'https://m.media-amazon.com/images/I/51NOmHTSK1L._AC_SL1500_.jpg',
    ]);
  });
});

describe('stableStringify + sha256Hex', () => {
  test('stableStringify is deterministic across key order', () => {
    const a = stableStringify({ b: 1, a: 2, nested: { z: 1, y: 2 } });
    const b = stableStringify({ a: 2, nested: { y: 2, z: 1 }, b: 1 });
    expect(a).toBe(b);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });
});
