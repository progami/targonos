/**
 * Processes the Amazon PDP fixture HTML into a clean, standalone replica page.
 * Extracts only CSS links, inline styles, and the #ppd content section.
 * Rewrites asset paths to use the fixture API route.
 *
 * Usage: node scripts/process-fixture.mjs
 * Output: fixtures/amazon-pdp/replica.html
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'amazon-pdp')
const INPUT = join(FIXTURE_DIR, 'listingpage.html')
const OUTPUT = join(FIXTURE_DIR, 'replica.html')

const html = readFileSync(INPUT, 'utf-8')

// Extract the <html> tag with its classes (needed for AUI styles)
const htmlTagMatch = html.match(/<html[^>]*>/)
const htmlTag = htmlTagMatch ? htmlTagMatch[0] : '<html>'

// Extract all <link rel="stylesheet"> tags from the ENTIRE document
const cssLinks = []
const seenHrefs = new Set()
const linkRe = /<link\s+rel="stylesheet"\s+href="([^"]+)"[^>]*>/g
let match
while ((match = linkRe.exec(html)) !== null) {
  const href = match[1]
  if (!seenHrefs.has(href)) {
    seenHrefs.add(href)
    cssLinks.push(match[0])
  }
}

const headEnd = html.indexOf('</head>')
const headContent = html.slice(0, headEnd)

// Extract all <style> tags from <head> (skip video player dimensions)
const styles = []
const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/g
while ((match = styleRe.exec(headContent)) !== null) {
  const content = match[1].trim()
  // Skip video.js dimension styles and overly specific detailpage styles
  if (content.includes('vjs-styles') || content.includes('detailpage-imageblock-player')) continue
  // Skip agent nav-search styles (Amazon agent injection)
  if (content.includes('#nav-search-submit-text-agent')) continue
  styles.push(`<style>${content}</style>`)
}

// Extract inline styles from <body> section too (some are inside the #ppd area)
const bodyStart = html.indexOf('<body')
const bodyContent = html.slice(bodyStart)
const bodyStyleRe = /<style[^>]*type="text\/css"[^>]*>([\s\S]*?)<\/style>/g
const bodyStyles = []
while ((match = bodyStyleRe.exec(bodyContent)) !== null) {
  const content = match[1].trim()
  if (content.length > 10 && content.length < 5000) {
    bodyStyles.push(`<style>${content}</style>`)
  }
}

// Extract #ppd content
const ppdStart = html.indexOf('<div id="ppd">')
if (ppdStart === -1) {
  console.error('Could not find <div id="ppd"> in fixture HTML')
  process.exit(1)
}

// Find the closing tag for #ppd by counting div depth
let depth = 0
let ppdEnd = -1
let i = ppdStart
while (i < html.length) {
  if (html.slice(i, i + 4) === '<div') {
    depth++
    i += 4
  } else if (html.slice(i, i + 6) === '</div>') {
    depth--
    if (depth === 0) {
      ppdEnd = i + 6
      break
    }
    i += 6
  } else {
    i++
  }
}

if (ppdEnd === -1) {
  console.error('Could not find closing tag for #ppd')
  process.exit(1)
}

let ppdContent = html.slice(ppdStart, ppdEnd)

// Also extract the below-fold content (A+ content, description, etc.)
// These are outside #ppd but important for the full PDP view
const belowFoldSections = []
const sectionIds = [
  'aplusBrandStory_feature_div',
  'aplus_feature_div',
  'aplusSustainabilityStory_feature_div',
  'productDescription_feature_div',
]

for (const id of sectionIds) {
  const sectionStart = html.indexOf(`id="${id}"`)
  if (sectionStart === -1) continue

  // Find the opening tag of this section's container
  let tagStart = sectionStart
  while (tagStart > 0 && html[tagStart] !== '<') tagStart--

  // Find closing tag by depth counting
  let sDepth = 0
  let sEnd = -1
  let j = tagStart
  while (j < html.length) {
    if (html.slice(j, j + 4) === '<div') {
      sDepth++
      j += 4
    } else if (html.slice(j, j + 6) === '</div>') {
      sDepth--
      if (sDepth === 0) {
        sEnd = j + 6
        break
      }
      j += 6
    } else {
      j++
    }
  }

  if (sEnd !== -1) {
    belowFoldSections.push(html.slice(tagStart, sEnd))
  }
}

// Remove all <script> tags from the PDP content
const removeScripts = (s) => s.replace(/<script[\s\S]*?<\/script>/g, '')

// Fix lazy-loaded images: Amazon uses grey-pixel.gif as src with the real URL in data-src.
// Since we strip all scripts, the lazy-load JS never runs, so swap data-src → src.
function fixLazyImages(s) {
  // Replace data-src with src for images that have a grey-pixel placeholder
  s = s.replace(/<img\s([^>]*?)src="[^"]*grey-pixel[^"]*"([^>]*?)data-src="([^"]+)"([^>]*?)>/g,
    '<img $1src="$3"$2$4>')
  // Handle reverse attribute order: data-src before src
  s = s.replace(/<img\s([^>]*?)data-src="([^"]+)"([^>]*?)src="[^"]*grey-pixel[^"]*"([^>]*?)>/g,
    '<img $1src="$2"$3$4>')
  // Remove the a-lazy-loaded class (prevents CSS hiding)
  s = s.replace(/\ba-lazy-loaded\b/g, 'a-lazy-resolved')
  return s
}

ppdContent = fixLazyImages(removeScripts(ppdContent))
const belowFold = belowFoldSections.map(s => fixLazyImages(removeScripts(s))).join('\n')

// Extract the <body> class
const bodyClassMatch = html.match(/<body\s+class="([^"]*)"/)
const bodyClass = bodyClassMatch ? bodyClassMatch[1] : ''

// Build the replica HTML
const replica = `<!DOCTYPE html>
${htmlTag}
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Amazon PDP Replica</title>
${cssLinks.join('\n')}
${styles.join('\n')}
<style>
  /* Reset page margins */
  body {
    margin: 0;
    padding: 0;
    background: #fff;
  }
  /* Amazon PDP container */
  #dp-container {
    max-width: 1500px;
    margin: 0 auto;
    padding: 0 18px;
  }
  /* Ensure leftCenterCol leaves room for right buy-box column */
  #leftCenterCol {
    margin-right: 270px;
  }
  /* Remove any position:fixed elements and nav */
  .sa_fabaudiospot-container,
  #navFooter,
  #navbar { display: none !important; }
  /* Below-fold content */
  .below-fold-content {
    clear: both;
    max-width: 1500px;
    margin: 0 auto;
    padding: 20px 18px;
  }
</style>
</head>
<body class="${bodyClass}">
<div id="a-page">
<div id="dp-container" class="a-container" role="main">
${ppdContent}
</div>
<div class="below-fold-content">
${belowFold}
</div>
</div>
</body>
</html>`

writeFileSync(OUTPUT, replica, 'utf-8')

const sizeKB = Math.round(replica.length / 1024)
console.log(`✓ Wrote replica.html (${sizeKB}KB)`)
console.log(`  - ${cssLinks.length} CSS links`)
console.log(`  - ${styles.length} inline styles`)
console.log(`  - ${belowFoldSections.length} below-fold sections`)
