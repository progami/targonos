import { NextResponse } from 'next/server'
import { extname } from 'path'
import prisma from '@/lib/db'
import { storeImageBuffer } from '@/lib/image-store'
import { deleteOrphanMediaAssets } from '@/lib/media-gc'

export const runtime = 'nodejs'

function extFromMimeType(mimeType: string): string | null {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase()
  if (normalized === 'video/mp4') return '.mp4'
  if (normalized === 'video/webm') return '.webm'
  return null
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const revisions = await prisma.videoRevision.findMany({
    where: { listingId: id },
    orderBy: { seq: 'desc' },
    include: {
      media: true,
      posterMedia: true,
    },
  })

  return NextResponse.json(revisions)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  await prisma.listing.findUniqueOrThrow({ where: { id } })

  const form = await request.formData()
  const video = form.get('file')
  const poster = form.get('poster')
  const note = form.get('note')

  if (!(video instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }

  const videoBytes = Buffer.from(await video.arrayBuffer())
  const rawExt = extname(video.name).toLowerCase()
  const resolvedExt = rawExt.length > 0 ? rawExt : extFromMimeType(video.type)
  if (!resolvedExt) {
    return NextResponse.json({ error: `Unsupported video type: ${video.type}` }, { status: 400 })
  }

  const storedVideo = await storeImageBuffer(videoBytes, resolvedExt, {
    mimeType: video.type.length > 0 ? video.type : undefined,
    originalName: video.name,
  })

  let posterMediaId: string | null = null
  if (poster instanceof File) {
    const posterBytes = Buffer.from(await poster.arrayBuffer())
    const posterRawExt = extname(poster.name).toLowerCase()
    const posterExt = posterRawExt.length > 0 ? posterRawExt : null
    if (!posterExt) {
      return NextResponse.json({ error: `Unsupported poster type: ${poster.type}` }, { status: 400 })
    }

    const storedPoster = await storeImageBuffer(posterBytes, posterExt, {
      mimeType: poster.type.length > 0 ? poster.type : undefined,
      originalName: poster.name,
    })
    posterMediaId = storedPoster.mediaId
  }

  const last = await prisma.videoRevision.findFirst({
    where: { listingId: id },
    orderBy: { seq: 'desc' },
  })

  const rev = await prisma.videoRevision.create({
    data: {
      listingId: id,
      seq: (last?.seq ?? 0) + 1,
      origin: 'MANUAL_ENTRY',
      note: typeof note === 'string' ? note : null,
      mediaId: storedVideo.mediaId,
      posterMediaId,
    },
    include: {
      media: true,
      posterMedia: true,
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

  const rev = await prisma.videoRevision.findFirstOrThrow({
    where: { id: revisionId, listingId: id },
  })

  await prisma.videoRevision.delete({ where: { id: rev.id } })
  await deleteOrphanMediaAssets([rev.mediaId, rev.posterMediaId ?? ''].filter((mediaId) => mediaId.length > 0))
  return NextResponse.json({ ok: true })
}
