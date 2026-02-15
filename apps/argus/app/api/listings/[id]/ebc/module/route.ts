import { NextResponse } from 'next/server'
import { extname } from 'path'
import prisma from '@/lib/db'
import { storeImageBuffer } from '@/lib/image-store'

export const runtime = 'nodejs'

function extFromMimeType(mimeType: string): string | null {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase()
  if (normalized === 'image/jpeg') return '.jpg'
  if (normalized === 'image/png') return '.png'
  if (normalized === 'image/gif') return '.gif'
  if (normalized === 'image/webp') return '.webp'
  if (normalized === 'image/avif') return '.avif'
  if (normalized === 'image/svg+xml') return '.svg'
  return null
}

function moduleKey(sectionType: string, modulePosition: number): string {
  return `${sectionType}:${modulePosition}`
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id },
    select: { id: true, activeEbcId: true },
  })

  if (!listing.activeEbcId) {
    return NextResponse.json({ error: 'Listing has no active EBC revision' }, { status: 400 })
  }

  const form = await request.formData()

  const sectionType = String(form.get('sectionType') ?? '').trim()
  const modulePositionValue = String(form.get('modulePosition') ?? '').trim()
  const modulePosition = Number(modulePositionValue)

  if (sectionType.length === 0 || !Number.isFinite(modulePosition)) {
    return NextResponse.json({ error: 'sectionType and modulePosition are required' }, { status: 400 })
  }

  const headline = form.get('headline')
  const bodyText = form.get('bodyText')

  const uploadedFiles = form.getAll('files')

  const pointers = await prisma.ebcModulePointer.findMany({
    where: { listingId: id },
  })

  const pointerMap = new Map<string, string>()
  for (const pointer of pointers) {
    pointerMap.set(moduleKey(pointer.sectionType, pointer.modulePosition), pointer.ebcRevisionId)
  }

  const base = await prisma.ebcRevision.findUniqueOrThrow({
    where: { id: listing.activeEbcId },
    include: {
      sections: {
        orderBy: { position: 'asc' },
        include: {
          modules: {
            orderBy: { position: 'asc' },
            include: {
              images: { orderBy: { position: 'asc' } },
            },
          },
        },
      },
    },
  })

  const requiredRevisionIds = new Set<string>()
  requiredRevisionIds.add(base.id)
  for (const section of base.sections) {
    for (const mod of section.modules) {
      const key = moduleKey(section.sectionType, mod.position)
      const selectedRevisionId = pointerMap.get(key)
      requiredRevisionIds.add(selectedRevisionId ? selectedRevisionId : base.id)
    }
  }

  const sourceRevisions = await prisma.ebcRevision.findMany({
    where: { id: { in: Array.from(requiredRevisionIds) } },
    include: {
      sections: {
        orderBy: { position: 'asc' },
        include: {
          modules: {
            orderBy: { position: 'asc' },
            include: {
              images: { orderBy: { position: 'asc' } },
            },
          },
        },
      },
    },
  })

  const sourceRevisionById = new Map<string, typeof base>()
  for (const rev of sourceRevisions) {
    sourceRevisionById.set(rev.id, rev)
  }

  const last = await prisma.ebcRevision.findFirst({
    where: { listingId: id },
    orderBy: { seq: 'desc' },
  })

  const sectionsCreate = []

  for (const section of base.sections) {
    const modulesCreate = []
    for (const mod of section.modules) {
      const key = moduleKey(section.sectionType, mod.position)
      const selectedRevisionId = pointerMap.get(key)
      const sourceRevisionId = selectedRevisionId ? selectedRevisionId : base.id
      const sourceRevision = sourceRevisionById.get(sourceRevisionId)
      if (!sourceRevision) {
        return NextResponse.json({ error: 'Source revision missing' }, { status: 400 })
      }

      const sourceSection = sourceRevision.sections.find((s) => s.sectionType === section.sectionType) ?? null
      const sourceModule = sourceSection ? sourceSection.modules.find((m) => m.position === mod.position) ?? null : null
      if (!sourceModule) {
        return NextResponse.json({ error: 'Source module missing' }, { status: 400 })
      }

      const isTarget = section.sectionType === sectionType && mod.position === modulePosition

      let nextHeadline = sourceModule.headline
      let nextBodyText = sourceModule.bodyText
      if (isTarget) {
        nextHeadline = typeof headline === 'string' ? String(headline).trim() : null
        nextBodyText = typeof bodyText === 'string' ? String(bodyText).trim() : null
      }

      const nextImagesCreate = []
      if (isTarget && uploadedFiles.length > 0) {
        for (let i = 0; i < uploadedFiles.length; i++) {
          const entry = uploadedFiles[i]
          if (!(entry instanceof File)) continue

          const data = Buffer.from(await entry.arrayBuffer())
          const rawExt = extname(entry.name).toLowerCase()
          const resolvedExt = rawExt.length > 0 ? rawExt : extFromMimeType(entry.type)
          if (!resolvedExt) {
            return NextResponse.json({ error: `Unsupported image type: ${entry.type}` }, { status: 400 })
          }

          const stored = await storeImageBuffer(data, resolvedExt, {
            mimeType: entry.type.length > 0 ? entry.type : undefined,
            originalName: entry.name,
          })

          nextImagesCreate.push({
            position: i,
            mediaId: stored.mediaId,
            altText: null,
          })
        }
      } else {
        for (const img of sourceModule.images) {
          nextImagesCreate.push({
            position: img.position,
            mediaId: img.mediaId,
            altText: img.altText,
          })
        }
      }

      modulesCreate.push({
        position: mod.position,
        moduleType: sourceModule.moduleType,
        headline: nextHeadline,
        bodyText: nextBodyText,
        images: { create: nextImagesCreate },
      })
    }

    sectionsCreate.push({
      position: section.position,
      sectionType: section.sectionType,
      heading: section.heading,
      modules: { create: modulesCreate },
    })
  }

  const created = await prisma.ebcRevision.create({
    data: {
      listingId: id,
      seq: (last?.seq ?? 0) + 1,
      origin: 'MANUAL_ENTRY',
      sections: { create: sectionsCreate },
    },
    include: {
      sections: {
        orderBy: { position: 'asc' },
        include: {
          modules: {
            orderBy: { position: 'asc' },
            include: {
              images: {
                orderBy: { position: 'asc' },
                include: { media: true },
              },
            },
          },
        },
      },
    },
  })

  await prisma.ebcModulePointer.upsert({
    where: {
      listingId_sectionType_modulePosition: {
        listingId: id,
        sectionType,
        modulePosition,
      },
    },
    update: { ebcRevisionId: created.id },
    create: {
      listingId: id,
      sectionType,
      modulePosition,
      ebcRevisionId: created.id,
    },
  })

  return NextResponse.json(created)
}

