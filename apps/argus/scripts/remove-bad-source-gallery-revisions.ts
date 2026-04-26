import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@targon/prisma-argus'

const APP_DIR = process.cwd()

const BAD_REVISIONS = [
  {
    asin: 'B09HXC3NL8',
    seq: 1,
    revisionId: 'cmoeqk2at0005t9efe39nd1vk',
  },
  {
    asin: 'B0CR1GSBQ9',
    seq: 1,
    revisionId: 'cmoeqk348000ht9efivhrla46',
  },
]

function parseDotenvLine(rawLine: string): { key: string; value: string } | null {
  let line = rawLine.trim()
  if (line.length === 0) return null
  if (line.startsWith('#')) return null

  if (line.startsWith('export ')) {
    line = line.slice('export '.length).trim()
  }

  const separatorIndex = line.indexOf('=')
  if (separatorIndex === -1) return null

  const key = line.slice(0, separatorIndex).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) return null

  let value = line.slice(separatorIndex + 1).trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1)
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1)
  }

  return { key, value }
}

async function loadEnvFile(filePath: string): Promise<void> {
  const raw = await readFile(filePath, 'utf8')

  for (const line of raw.split(/\r?\n/u)) {
    const parsed = parseDotenvLine(line)
    if (parsed === null) continue
    if (process.env[parsed.key] !== undefined) continue
    process.env[parsed.key] = parsed.value
  }
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required to remove bad source gallery revisions.')
  }

  const trimmed = databaseUrl.trim()
  if (trimmed.length === 0) {
    throw new Error('DATABASE_URL is required to remove bad source gallery revisions.')
  }

  return trimmed
}

async function collectBadMediaIds(prisma: PrismaClient): Promise<string[]> {
  const mediaIds: string[] = []

  for (const target of BAD_REVISIONS) {
    const revision = await prisma.galleryRevision.findFirst({
      where: {
        id: target.revisionId,
        seq: target.seq,
        listing: {
          marketplace: 'US',
          asin: target.asin,
        },
      },
      select: {
        id: true,
        note: true,
        slots: {
          select: {
            mediaId: true,
            media: {
              select: {
                sourceUrl: true,
              },
            },
          },
        },
      },
    })

    if (revision === null) {
      throw new Error(`Missing bad source revision ${target.revisionId} for ${target.asin} Images v${target.seq}.`)
    }
    if (revision.note === null) {
      throw new Error(`Revision ${revision.id} has no note; refusing to delete.`)
    }
    if (!revision.note.includes('Sources/2026-01-31')) {
      throw new Error(`Revision ${revision.id} is not tagged as the bad Sources import.`)
    }
    if (revision.slots.length === 0) {
      throw new Error(`Revision ${revision.id} has no slots; refusing to delete.`)
    }

    for (const slot of revision.slots) {
      const sourceUrl = slot.media.sourceUrl
      if (sourceUrl === null) {
        throw new Error(`Revision ${revision.id} has a slot without sourceUrl; refusing to delete.`)
      }
      if (!sourceUrl.includes('/Listing/Sources/')) {
        throw new Error(`Revision ${revision.id} slot does not point at Listing/Sources: ${sourceUrl}`)
      }
      mediaIds.push(slot.mediaId)
    }
  }

  return mediaIds
}

async function removeBadRevisions(prisma: PrismaClient): Promise<void> {
  for (const target of BAD_REVISIONS) {
    await prisma.$transaction([
      prisma.gallerySlot.deleteMany({
        where: {
          revisionId: target.revisionId,
        },
      }),
      prisma.galleryRevision.delete({
        where: {
          id: target.revisionId,
        },
      }),
    ])

    console.log(`[remove-bad-source-gallery-revisions] removed ${target.asin} Images v${target.seq}`)
  }
}

async function main(): Promise<void> {
  await loadEnvFile(path.join(APP_DIR, '.env.local'))

  const prisma = new PrismaClient({
    log: ['error'],
    datasourceUrl: requireDatabaseUrl(),
  })

  let mediaIds: string[]
  try {
    mediaIds = await collectBadMediaIds(prisma)
    await removeBadRevisions(prisma)
  } finally {
    await prisma.$disconnect()
  }

  const { deleteOrphanMediaAssets } = await import('../lib/media-gc')
  await deleteOrphanMediaAssets(mediaIds)
  console.log(`[remove-bad-source-gallery-revisions] removed ${mediaIds.length} orphan source media assets`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
