import { NextResponse } from 'next/server'
import { extname } from 'path'
import prisma from '@/lib/db'
import { storeImageBuffer } from '@/lib/image-store'
import { deleteOrphanMediaAssets } from '@/lib/media-gc'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const revisions = await prisma.galleryRevision.findMany({
    where: { listingId: id },
    orderBy: { seq: 'desc' },
    include: {
      slots: {
        orderBy: { position: 'asc' },
        include: { media: true },
      },
    },
  })

  return NextResponse.json(revisions)
}

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  await prisma.listing.findUniqueOrThrow({ where: { id } })

  const form = await request.formData()
  const entries = form.getAll('files')
  if (entries.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }
  if (entries.length > 6) {
    return NextResponse.json({ error: 'Gallery supports up to 6 images. Upload video separately.' }, { status: 400 })
  }

  const mediaIds: string[] = []
  for (const entry of entries) {
    if (!(entry instanceof File)) continue

    const file = entry
    const data = Buffer.from(await file.arrayBuffer())

    const rawExt = extname(file.name).toLowerCase()
    const resolvedExt = rawExt.length > 0 ? rawExt : extFromMimeType(file.type)
    if (!resolvedExt) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 })
    }

    const stored = await storeImageBuffer(data, resolvedExt, {
      mimeType: file.type.length > 0 ? file.type : undefined,
      originalName: file.name,
    })

    mediaIds.push(stored.mediaId)
  }

  const last = await prisma.galleryRevision.findFirst({
    where: { listingId: id },
    orderBy: { seq: 'desc' },
  })

  const rev = await prisma.galleryRevision.create({
    data: {
      listingId: id,
      seq: (last?.seq ?? 0) + 1,
      origin: 'MANUAL_ENTRY',
      slots: {
        create: mediaIds.map((mediaId, i) => ({
          position: i,
          mediaId,
        })),
      },
    },
    include: {
      slots: {
        orderBy: { position: 'asc' },
        include: { media: true },
      },
    },
  })

  return NextResponse.json(rev)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json()

  const { revisionId } = body as { revisionId: string }

  const rev = await prisma.galleryRevision.findFirstOrThrow({
    where: { id: revisionId, listingId: id },
    include: { slots: { select: { mediaId: true } } },
  })

  const mediaIds = rev.slots.map((slot) => slot.mediaId)

  await prisma.gallerySlot.deleteMany({ where: { revisionId: rev.id } })
  await prisma.galleryRevision.delete({ where: { id: rev.id } })

  await deleteOrphanMediaAssets(mediaIds)

  return NextResponse.json({ ok: true })
}
