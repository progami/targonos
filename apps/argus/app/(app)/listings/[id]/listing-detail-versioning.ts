import { resolveImageSrc, type EbcModule, type EbcRevision, type GalleryRevision } from './listing-detail-shared'

export function ebcModulePointerKey(sectionType: string, modulePosition: number): string {
  return `${sectionType}:${modulePosition}`
}

export function composeEbcRevision(
  all: EbcRevision[],
  pointers: Record<string, string>,
  liveRevisionId: string | null,
): EbcRevision | null {
  if (all.length === 0) return null

  const baseId = liveRevisionId ? liveRevisionId : all[0].id
  const base = all.find((rev) => rev.id === baseId) ?? all[0]

  const byId = new Map<string, EbcRevision>()
  for (const rev of all) {
    byId.set(rev.id, rev)
  }

  return {
    id: base.id,
    seq: base.seq,
    createdAt: base.createdAt,
    sections: base.sections.map((section) => ({
      sectionType: section.sectionType,
      heading: section.heading,
      modules: section.modules.map((_mod, modulePosition) => {
        const key = ebcModulePointerKey(section.sectionType, modulePosition)
        const selectedRevisionId = pointers[key]
        const revisionId = selectedRevisionId ? selectedRevisionId : base.id
        const srcRevision = byId.get(revisionId)
        if (!srcRevision) return section.modules[modulePosition]

        const srcSection = srcRevision.sections.find((item) => item.sectionType === section.sectionType) ?? null
        const srcModule = srcSection ? srcSection.modules[modulePosition] ?? null : null
        return srcModule ? srcModule : section.modules[modulePosition]
      }),
    })),
  }
}

function moduleSignature(mod: EbcModule): string {
  return JSON.stringify({
    moduleType: mod.moduleType,
    headline: mod.headline,
    bodyText: mod.bodyText,
    images: mod.images.map((img) => img.src),
  })
}

export function getEbcModuleHistory(
  all: EbcRevision[],
  sectionType: string,
  modulePosition: number,
): { revisionId: string; seq: number; module: EbcModule }[] {
  const history: { revisionId: string; seq: number; module: EbcModule }[] = []
  let lastSignature: string | null = null

  for (const revision of all) {
    const section = revision.sections.find((item) => item.sectionType === sectionType) ?? null
    if (!section) continue

    const moduleItem = section.modules[modulePosition] ?? null
    if (!moduleItem) continue

    const signature = moduleSignature(moduleItem)
    if (lastSignature === signature) continue

    history.push({ revisionId: revision.id, seq: revision.seq, module: moduleItem })
    lastSignature = signature
  }

  return history
}

export function updateEbcModuleControls(
  doc: Document,
  allRevisions: EbcRevision[],
  pointers: Record<string, string>,
  liveRevisionId: string | null,
) {
  const controls = Array.from(doc.querySelectorAll<HTMLElement>('.argus-vc-ebc-module-controls'))
  for (const control of controls) {
    const sectionType = control.dataset.sectionType
    const modulePositionValue = control.dataset.modulePosition
    if (!sectionType || !modulePositionValue) continue

    const modulePosition = Number(modulePositionValue)
    if (!Number.isFinite(modulePosition)) continue

    const history = getEbcModuleHistory(allRevisions, sectionType, modulePosition)
    if (history.length === 0) continue

    const key = ebcModulePointerKey(sectionType, modulePosition)
    const selectedRevisionId = pointers[key]
    const activeId = selectedRevisionId ? selectedRevisionId : liveRevisionId
    const effectiveId = activeId ? activeId : history[0].revisionId

    const index = history.findIndex((item) => item.revisionId === effectiveId)
    const safeIndex = index >= 0 ? index : 0

    const label = control.querySelector<HTMLElement>('.argus-vc-label')
    if (label) {
      label.textContent = `Module v${history.length - safeIndex}`
    }

    const prev = control.querySelector<HTMLButtonElement>('button[data-dir="prev"]')
    const next = control.querySelector<HTMLButtonElement>('button[data-dir="next"]')
    const del = control.querySelector<HTMLButtonElement>('button[data-action="delete"]')

    if (prev) prev.disabled = safeIndex >= history.length - 1
    if (next) next.disabled = safeIndex <= 0
    if (del) del.disabled = liveRevisionId !== null && effectiveId === liveRevisionId
  }
}

function fileExt(path: string): string {
  const match = path.match(/\.[a-z0-9]+(?=$|\?)/iu)
  return match ? match[0] : ''
}

async function downloadFilesAsZip(zipName: string, files: { url: string; filename: string }[]) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()

  for (const file of files) {
    const response = await fetch(file.url)
    if (!response.ok) {
      throw new Error(`Failed to download ${file.url}`)
    }

    const data = await response.arrayBuffer()
    zip.file(file.filename, data)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = zipName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
}

export async function downloadGalleryRevisionZip(revision: GalleryRevision, versionNumber: number) {
  const files = revision.images
    .slice()
    .sort((a, b) => a.position - b.position)
    .slice(0, 6)
    .map((image) => {
      const downloadSrc = image.hiRes ? image.hiRes : image.src
      return {
        url: resolveImageSrc(downloadSrc),
        filename: `gallery_v${versionNumber}_${String(image.position).padStart(2, '0')}${fileExt(downloadSrc)}`,
      }
    })

  await downloadFilesAsZip(`gallery_v${versionNumber}.zip`, files)
}

export async function downloadEbcZip(zipName: string, filePrefix: string, revision: EbcRevision) {
  const files: { url: string; filename: string }[] = []

  for (let sectionIndex = 0; sectionIndex < revision.sections.length; sectionIndex++) {
    const section = revision.sections[sectionIndex]
    for (let moduleIndex = 0; moduleIndex < section.modules.length; moduleIndex++) {
      const moduleItem = section.modules[moduleIndex]
      for (let imageIndex = 0; imageIndex < moduleItem.images.length; imageIndex++) {
        const image = moduleItem.images[imageIndex]
        files.push({
          url: resolveImageSrc(image.src),
          filename: `${filePrefix}_s${sectionIndex + 1}_m${moduleIndex + 1}_i${imageIndex + 1}${fileExt(image.src)}`,
        })
      }
    }
  }

  await downloadFilesAsZip(zipName, files)
}
