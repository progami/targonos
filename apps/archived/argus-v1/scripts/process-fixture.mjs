/**
 * Processes a Chrome "Save As Complete Web Page" Amazon PDP fixture.
 * Strips scripts and fixes lazy-loaded images, keeping everything else intact.
 * All asset references (CSS, images) remain as ./listingpage_files/xxx paths.
 *
 * Usage: node scripts/process-fixture.mjs
 * Input:  fixtures/amazon-pdp/listingpage.html  (Chrome save-as output)
 * Output: fixtures/amazon-pdp/replica.html
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'amazon-pdp')
const INPUT = join(FIXTURE_DIR, 'listingpage.html')
const OUTPUT = join(FIXTURE_DIR, 'replica.html')

let html = readFileSync(INPUT, 'utf-8')

// Rewrite asset folder path to ./listingpage_files/
// Chrome "Save As Complete" names the folder after the page title, which varies.
// Detect the actual folder name from the first stylesheet href and rewrite all references.
const folderMatch = html.match(/href="\.\/([^"]+?)\/[^/"]+\.css/)
if (folderMatch && folderMatch[1] !== 'listingpage_files') {
  const originalFolder = folderMatch[1]
  // Escape HTML entities in the folder name (Chrome uses &#39; for apostrophes etc.)
  const escaped = originalFolder.replace(/&/g, '&amp;')
  html = html.replaceAll(`./${originalFolder}/`, './listingpage_files/')
  if (escaped !== originalFolder) {
    html = html.replaceAll(`./${escaped}/`, './listingpage_files/')
  }
  console.log(`  Rewrote asset path: "${originalFolder.slice(0, 60)}..." → "listingpage_files"`)
}

// Strip all <script> tags (they phone home to Amazon and break without their context)
html = html.replace(/<script[\s\S]*?<\/script>/g, '')

// Strip <noscript> wrappers (Chrome save-as keeps duplicate images inside noscript)
html = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '')

// Strip script preloads (we never execute Amazon JS in the replica)
html = html.replace(/<link[^>]*rel="preload"[^>]*as="script"[^>]*>/g, '')
html = html.replace(/<link[^>]*as="script"[^>]*rel="preload"[^>]*>/g, '')
html = html.replace(/<link[^>]*rel='preload'[^>]*as='script'[^>]*>/g, '')
html = html.replace(/<link[^>]*as='script'[^>]*rel='preload'[^>]*>/g, '')

// Strip fetch preloads (ad-related artifacts that slow down Safari)
html = html.replace(/<link[^>]*rel="preload"[^>]*as="fetch"[^>]*>/g, '')
html = html.replace(/<link[^>]*as="fetch"[^>]*rel="preload"[^>]*>/g, '')
html = html.replace(/<link[^>]*rel='preload'[^>]*as='fetch'[^>]*>/g, '')
html = html.replace(/<link[^>]*as='fetch'[^>]*rel='preload'[^>]*>/g, '')

// Strip inline event handlers (they depend on Amazon scripts we intentionally remove)
html = html.replace(/\son[a-z]+="[^"]*"/g, '')
html = html.replace(/\son[a-z]+='[^']*'/g, '')

// Strip iframes (mostly ads / safeframes that carry scripts and slow Safari)
html = html.replace(/<iframe[\s\S]*?<\/iframe>/g, '')

// Fix lazy-loaded images: Amazon uses grey-pixel.gif as src with the real URL in data-src.
// Since scripts are stripped, the lazy-load JS never runs, so swap data-src → src.
html = html.replace(
  /<img\s([^>]*?)src="[^"]*grey-pixel[^"]*"([^>]*?)data-src="([^"]+)"([^>]*?)>/g,
  '<img $1src="$3"$2$4>'
)
html = html.replace(
  /<img\s([^>]*?)data-src="([^"]+)"([^>]*?)src="[^"]*grey-pixel[^"]*"([^>]*?)>/g,
  '<img $1src="$2"$3$4>'
)
html = html.replace(/\ba-lazy-loaded\b/g, 'a-lazy-resolved')

// Inject a small style block to hide page chrome (before </head>)
// Keep the Amazon header/search visible for a truer PDP replica.
const hideCSS = `<style>
  #navFooter, #rhf, .navFooterLine,
  .sa_fabaudiospot-container { display: none !important; }
</style>`
html = html.replace('</head>', `${hideCSS}\n</head>`)

writeFileSync(OUTPUT, html, 'utf-8')

const sizeKB = Math.round(html.length / 1024)
console.log(`✓ Wrote replica.html (${sizeKB}KB)`)
