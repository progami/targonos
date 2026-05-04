import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('listing detail sanitizes the replica document before validating the contract', () => {
  const source = readFileSync(new URL('./listing-detail.tsx', import.meta.url), 'utf8')

  assert.match(source, /sanitizeAmazonPdpReplicaDocument\(doc\)/)
})

test('listing detail iframe sets an explicit full-width layout contract', () => {
  const source = readFileSync(new URL('./listing-detail.tsx', import.meta.url), 'utf8')

  assert.match(source, /width: '100%'/)
  assert.match(source, /display: 'block'/)
  assert.match(source, /border: 0/)
})

test('amazon PDP replica sanitizer strips docked Rufus chrome from the iframe document', async () => {
  const loadedReplicaModule = await import('./amazon-pdp-replica')
  const sanitize = Reflect.get(loadedReplicaModule, 'sanitizeAmazonPdpReplicaDocument')

  assert.equal(typeof sanitize, 'function')

  const doc = createFakeDocument()

  sanitize(doc as unknown as Document)

  assert.equal(doc.body.classList.contains('rufus-docked-adjustable'), false)
  assert.equal(doc.body.classList.contains('rufus-docked-right'), false)
  assert.equal(doc.body.classList.contains('rufus-docked-opening-transition'), false)
  assert.equal(doc.body.style.getPropertyValue('padding-right'), '')
  assert.equal(doc.body.style.getPropertyValue('padding-left'), '')
  assert.equal(doc.body.style.getPropertyValue('width'), '')
  assert.equal(doc.documentElement.style.getPropertyValue('--rufus-animation-min-height'), '')
  assert.equal(doc.nodes.rufus.removed, true)
  assert.equal(doc.nodes.ewc.removed, true)
  assert.equal(doc.nodes.veepn.removed, true)
  assert.equal(doc.nodes.navBelt.style.getPropertyValue('width'), '')
})

class FakeClassList {
  private readonly values = new Set<string>()

  constructor(initialValues: readonly string[] = []) {
    for (const value of initialValues) {
      this.values.add(value)
    }
  }

  contains(value: string): boolean {
    return this.values.has(value)
  }

  remove(...values: string[]): void {
    for (const value of values) {
      this.values.delete(value)
    }
  }

  [Symbol.iterator](): Iterator<string> {
    return this.values[Symbol.iterator]()
  }
}

class FakeStyle {
  private readonly values = new Map<string, string>()

  constructor(initialValues: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(initialValues)) {
      this.values.set(name, value)
    }
  }

  getPropertyValue(name: string): string {
    const value = this.values.get(name)
    if (value === undefined) return ''
    return value
  }

  removeProperty(name: string): void {
    this.values.delete(name)
  }
}

class FakeElement {
  removed = false
  readonly classList: FakeClassList
  readonly style: FakeStyle
  textContent: string | null

  constructor({
    classes = [],
    styles = {},
    textContent = null,
  }: {
    classes?: readonly string[]
    styles?: Record<string, string>
    textContent?: string | null
  } = {}) {
    this.classList = new FakeClassList(classes)
    this.style = new FakeStyle(styles)
    this.textContent = textContent
  }

  remove(): void {
    this.removed = true
  }
}

function createFakeDocument() {
  const body = new FakeElement({
    classes: ['rufus-docked-adjustable', 'rufus-docked-right', 'rufus-docked-opening-transition'],
    styles: {
      'padding-right': '320px',
      'padding-left': '24px',
      width: '320px',
    },
  })
  const documentElement = new FakeElement({
    styles: {
      '--rufus-animation-min-height': '120px',
      '--rufus-docked-panel-width': '320px',
    },
  })
  const rufus = new FakeElement()
  const ewc = new FakeElement()
  const veepn = new FakeElement()
  const extensionStyle = new FakeElement({
    textContent: '@font-face{src:url(chrome-extension://majdfhpaihoncoakbjgbdhglocklcgno/fonts/FigtreeVF.woff2)}',
  })
  const navBelt = new FakeElement({
    styles: {
      width: '1180px',
    },
  })

  const selectorMap = new Map<string, FakeElement[]>([
    ['#nav-flyout-rufus', [rufus]],
    ['#nav-flyout-ewc', [ewc]],
    ['veepn-lock-screen', [veepn]],
    ['style', [extensionStyle]],
    ['#nav-belt', [navBelt]],
  ])

  return {
    body,
    documentElement,
    nodes: {
      rufus,
      ewc,
      veepn,
      extensionStyle,
      navBelt,
    },
    querySelectorAll(selector: string): FakeElement[] {
      const elements = selectorMap.get(selector)
      if (elements === undefined) return []
      return elements
    },
    getElementById(id: string): FakeElement | null {
      if (id === 'nav-belt') return navBelt
      return null
    },
  }
}
