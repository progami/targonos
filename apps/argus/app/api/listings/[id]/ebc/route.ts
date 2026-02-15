import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { deleteOrphanMediaAssets } from '@/lib/media-gc'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const revisions = await prisma.ebcRevision.findMany({
    where: { listingId: id },
    orderBy: { seq: 'desc' },
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

  return NextResponse.json(revisions)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json()

  const { revisionId } = body as { revisionId: string }
  if (!revisionId || String(revisionId).trim().length === 0) {
    return NextResponse.json({ error: 'revisionId is required' }, { status: 400 })
  }

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id },
    select: { activeEbcId: true },
  })

  if (listing.activeEbcId === revisionId) {
    return NextResponse.json({ error: 'Cannot delete active EBC revision' }, { status: 400 })
  }

  const rev = await prisma.ebcRevision.findFirstOrThrow({
    where: { id: revisionId, listingId: id },
    include: {
      sections: {
        orderBy: { position: 'asc' },
        include: {
          modules: {
            orderBy: { position: 'asc' },
            include: {
              images: {
                orderBy: { position: 'asc' },
                select: { mediaId: true },
              },
            },
          },
        },
      },
    },
  })

  const mediaIds: string[] = []

  for (const section of rev.sections) {
    for (const mod of section.modules) {
      for (const img of mod.images) {
        mediaIds.push(img.mediaId)
      }
    }
  }

  await prisma.$transaction([
    prisma.ebcModulePointer.deleteMany({ where: { listingId: id, ebcRevisionId: rev.id } }),
    prisma.ebcImage.deleteMany({ where: { module: { section: { revisionId: rev.id } } } }),
    prisma.ebcModule.deleteMany({ where: { section: { revisionId: rev.id } } }),
    prisma.ebcSection.deleteMany({ where: { revisionId: rev.id } }),
    prisma.ebcRevision.delete({ where: { id: rev.id } }),
  ])

  await deleteOrphanMediaAssets(mediaIds)

  return NextResponse.json({ ok: true })
}
