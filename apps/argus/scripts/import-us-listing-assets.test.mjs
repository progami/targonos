import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('replica runtime keeps below-the-fold sections in live Amazon order', () => {
  const source = readFileSync(new URL('../fixtures/amazon-pdp/argus-replica-v1.js', import.meta.url), 'utf8')

  assert.match(source, /function reorderBelowTheFold\(\)/)
  assert.match(source, /zone\.insertBefore\(brandStory, subNav\)/)
  assert.match(source, /zone\.insertBefore\(productDescription, subNav\)/)
  assert.match(source, /zone\.insertBefore\(productDetails, productDescription\.nextSibling\)/)
  assert.match(source, /zone\.insertBefore\(productVideos, productDetails\.nextSibling\)/)
})

test('6-pack live EBC import order matches Amazon PDP module order', () => {
  const source = readFileSync(new URL('./import-us-listing-assets.ts', import.meta.url), 'utf8')
  const asinIndex = source.indexOf("asin: 'B09HXC3NL8'")
  assert.notEqual(asinIndex, -1)

  const liveRevisionIndex = source.indexOf("liveRevision('6Pack', [", asinIndex)
  assert.notEqual(liveRevisionIndex, -1)

  const liveRevisionEndIndex = source.indexOf(']),', liveRevisionIndex)
  assert.notEqual(liveRevisionEndIndex, -1)

  const liveRevisionBlock = source.slice(liveRevisionIndex, liveRevisionEndIndex)
  const fileNames = Array.from(liveRevisionBlock.matchAll(/'([^']+\.jpg)'/gu)).map((match) => match[1])

  assert.deepEqual(fileNames, [
    'Artboard 2 copy 3.jpg',
    'Artboard 2 copy 4.jpg',
    'Artboard 2 copy 5.jpg',
    'Artboard 2 copy 6.jpg',
    'Artboard 2 copy 8.jpg',
    'Artboard 2 copy 2.jpg',
    'Artboard 2.jpg',
    'Artboard 2 copy.jpg',
    'Artboard 2 copy 7.jpg',
  ])
})
