import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const talosRoot = path.resolve(__dirname, '..', '..')

function readTalosFile(relativePath: string): string {
  return readFileSync(path.join(talosRoot, relativePath), 'utf8')
}

test('inbound detail page renders all stage data without clickable stage filtering', () => {
  const source = readTalosFile('src/components/inbound/inbound-flow.tsx')

  assert.equal(source.includes('setSelectedStageView'), false)
  assert.equal(source.includes("if (activeViewStage !== 'MANUFACTURING') return null"), false)
  assert.equal(source.includes("if (activeViewStage !== 'OCEAN') return null"), false)
  assert.equal(source.includes("if (activeViewStage !== 'WAREHOUSE') return null"), false)
  assert.equal(source.includes("const showIssuedPiColumn = activeViewStage === 'ISSUED'"), false)
  assert.equal(
    source.includes("const showReceivedColumns = activeViewStage === 'WAREHOUSE'"),
    false
  )
  assert.equal(source.includes("const showCargoCostsStage = activeViewStage === 'OCEAN'"), false)
  assert.equal(
    source.includes("const showWarehouseCostsStage = activeViewStage === 'WAREHOUSE'"),
    false
  )
  assert.equal(source.includes('getActiveDocumentStage(order, activeViewStage)'), false)
})

test('cargo line tables use explicit fixed column sizing', () => {
  const source = readTalosFile('src/components/inbound/inbound-flow.tsx')

  assert.equal(source.includes('const detailCargoColumnWidths = ['), true)
  assert.equal(source.includes('const draftCargoColumnWidths = ['), true)
  assert.equal(
    source.includes(
      'const baseCargoColumnWidths = [96, 144, 88, 90, 76, 110, 90, 172, 84, 84, 88]'
    ),
    true
  )
  assert.equal(source.includes('<colgroup>'), true)
  assert.equal(source.includes('className="w-full table-fixed text-sm"'), true)
  assert.equal(source.includes('min-w-full w-max text-sm table-auto'), false)
})

test('existing inbound cargo lines render in responsive field cards', () => {
  const source = readTalosFile('src/components/inbound/inbound-flow.tsx')

  assert.equal(
    source.includes('<div className="space-y-2 p-2 sm:p-3" data-gate-key="cargo.lines">'),
    true
  )
  assert.equal(
    source.includes(
      "'grid grid-cols-2 gap-x-2 gap-y-1.5 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8'"
    ),
    true
  )
  assert.equal(source.includes('Carton Size ({cartonLengthUnit})'), true)
  assert.equal(
    source.includes(
      'rounded-md border border-dashed border-slate-300 bg-slate-50/30 p-2 dark:border-slate-700 dark:bg-slate-800/30'
    ),
    true
  )
})

test('generated inbound outputs do not stale themselves', () => {
  const serviceSource = readTalosFile('src/lib/services/inbound-stage-service.ts')
  const detailRouteSource = readTalosFile('src/app/api/inbound/[id]/route.ts')
  const pdfRouteSource = readTalosFile('src/app/api/inbound/[id]/pdf/route.ts')

  assert.equal(serviceSource.includes('isOrderUpdatedByGeneratedOutput('), true)
  assert.equal(serviceSource.includes('sourceChangedAt?: Date | string | null'), true)
  assert.equal(detailRouteSource.includes('OUTPUT_SOURCE_AUDIT_ACTIONS'), true)
  assert.equal(detailRouteSource.includes('sourceChangedAt: latestSourceAudit'), true)
  assert.equal(pdfRouteSource.includes('updatedAt: order.updatedAt'), true)
  assert.equal(serviceSource.includes('updatedAt: order.updatedAt'), true)
  assert.equal(pdfRouteSource.includes('where: { id: order.id, updatedAt: order.updatedAt }'), true)
  assert.equal(serviceSource.includes('where: { id: order.id, updatedAt: order.updatedAt }'), true)
})
