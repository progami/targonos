import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('WPR root page keeps the Suspense boundary on the client side', () => {
  const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

  assert.match(source, /^'use client';/);
  assert.match(source, /<Suspense fallback=\{<WprPageFallback \/>\}>/);
  assert.match(source, /<WprDashboardShell \/>/);
});
