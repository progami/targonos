import type { BulletsRevision, GallerySlot, EbcSection, EbcModule } from '@targon/prisma-argus'

// ─── Types ───────────────────────────────────────────────────────

export interface BulletsDiff {
  changed: boolean
  changedIndices: number[]
}

export interface GalleryDiff {
  changed: boolean
  addedPositions: number[]
  removedPositions: number[]
  changedPositions: number[]
}

export interface EbcDiff {
  changed: boolean
  changedSections: number[]
}

// ─── Diff functions ──────────────────────────────────────────────

export function diffBullets(
  prev: BulletsRevision,
  next: BulletsRevision,
): BulletsDiff {
  const indices: number[] = []
  const keys = ['bullet1', 'bullet2', 'bullet3', 'bullet4', 'bullet5'] as const
  for (let i = 0; i < keys.length; i++) {
    if (prev[keys[i]] !== next[keys[i]]) {
      indices.push(i)
    }
  }
  return { changed: indices.length > 0, changedIndices: indices }
}

export function diffGallery(
  prevSlots: GallerySlot[],
  nextSlots: GallerySlot[],
): GalleryDiff {
  const prevByPos = new Map(prevSlots.map((s) => [s.position, s.mediaId]))
  const nextByPos = new Map(nextSlots.map((s) => [s.position, s.mediaId]))

  const added: number[] = []
  const removed: number[] = []
  const changed: number[] = []

  for (const [pos, mediaId] of nextByPos) {
    const prevMediaId = prevByPos.get(pos)
    if (prevMediaId === undefined) {
      added.push(pos)
    } else if (prevMediaId !== mediaId) {
      changed.push(pos)
    }
  }

  for (const pos of prevByPos.keys()) {
    if (!nextByPos.has(pos)) {
      removed.push(pos)
    }
  }

  const hasChanges = added.length > 0 || removed.length > 0 || changed.length > 0
  return {
    changed: hasChanges,
    addedPositions: added,
    removedPositions: removed,
    changedPositions: changed,
  }
}

type EbcSectionWithModules = EbcSection & { modules: EbcModule[] }

export function diffEbc(
  prevSections: EbcSectionWithModules[],
  nextSections: EbcSectionWithModules[],
): EbcDiff {
  const changedSections: number[] = []
  const maxLen = Math.max(prevSections.length, nextSections.length)

  for (let i = 0; i < maxLen; i++) {
    const prev = prevSections[i]
    const next = nextSections[i]

    if (!prev || !next) {
      changedSections.push(i)
      continue
    }

    if (prev.sectionType !== next.sectionType || prev.heading !== next.heading) {
      changedSections.push(i)
      continue
    }

    // Compare modules within section
    if (prev.modules.length !== next.modules.length) {
      changedSections.push(i)
      continue
    }

    let sectionChanged = false
    for (let j = 0; j < prev.modules.length; j++) {
      const pm = prev.modules[j]
      const nm = next.modules[j]
      if (
        pm.moduleType !== nm.moduleType ||
        pm.headline !== nm.headline ||
        pm.bodyText !== nm.bodyText
      ) {
        sectionChanged = true
        break
      }
    }
    if (sectionChanged) {
      changedSections.push(i)
    }
  }

  return { changed: changedSections.length > 0, changedSections }
}
