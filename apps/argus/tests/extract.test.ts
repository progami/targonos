import { describe, expect, test } from 'vitest';
import { extractAsinFields } from '../lib/capture/extract-asin';
import { extractSearchResults } from '../lib/capture/extract-search';
import { extractBestsellers } from '../lib/capture/extract-bestsellers';
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
          <div id="feature-bullets">
            <ul>
              <li><span class="a-list-item">Bullet 1</span></li>
              <li><span class="a-list-item">Bullet 2</span></li>
            </ul>
          </div>
          <img id="landingImage" src="https://example.com/landing.jpg" />
          <div id="altImages">
            <img src="https://example.com/alt.jpg" />
          </div>
        </body>
      </html>
    `;

    const { normalized } = extractAsinFields(html);
    expect(normalized.title).toBe('My Product');
    expect(normalized.price).toBe(19.99);
    expect(normalized.rating).toBe(4.5);
    expect(normalized.reviewCount).toBe(1234);
    expect(normalized.bullets).toEqual(['Bullet 1', 'Bullet 2']);
    expect(normalized.imageUrls).toEqual(['https://example.com/landing.jpg', 'https://example.com/alt.jpg']);
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
    expect(normalized.bullets).toEqual([]);
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
});

describe('extractSearchResults', () => {
  test('returns ordered ASINs and tracked positions', () => {
    const html = `
      <div id="search">
        <div data-component-type="s-search-result" data-asin="b0001">Sponsored</div>
        <div data-component-type="s-search-result" data-asin="B0002">Regular</div>
        <div data-component-type="s-search-result" data-asin="">Ignore</div>
      </div>
    `;

    const { normalized } = extractSearchResults(html, { trackedAsins: ['b0002', 'B0003'] });
    expect(normalized.results).toEqual(['B0001', 'B0002']);
    expect(normalized.tracked).toEqual([
      { asin: 'B0002', found: true, position: 2, sponsored: false },
      { asin: 'B0003', found: false },
    ]);
  });
});

describe('extractBestsellers', () => {
  test('returns top ASIN list and tracked positions', () => {
    const html = `
      <div id="zg-ordered-list">
        <div data-asin="B0001"></div>
        <div data-asin="B0002"></div>
        <div data-asin="B0001"></div>
      </div>
    `;

    const { normalized } = extractBestsellers(html, { trackedAsins: ['B0002', 'B0003'] });
    expect(normalized.topAsins).toEqual(['B0001', 'B0002']);
    expect(normalized.tracked).toEqual([
      { asin: 'B0002', found: true, position: 2 },
      { asin: 'B0003', found: false },
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
