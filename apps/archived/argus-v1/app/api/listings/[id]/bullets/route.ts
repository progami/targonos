import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const revisions = await prisma.bulletsRevision.findMany({
    where: { listingId: id },
    orderBy: { seq: 'desc' },
  })

  return NextResponse.json(revisions)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json()

  const {
    bullet1,
    bullet2,
    bullet3,
    bullet4,
    bullet5,
    note,
  } = body as {
    bullet1?: string | null
    bullet2?: string | null
    bullet3?: string | null
    bullet4?: string | null
    bullet5?: string | null
    note?: string | null
  }

  const last = await prisma.bulletsRevision.findFirst({
    where: { listingId: id },
    orderBy: { seq: 'desc' },
  })

  const rev = await prisma.bulletsRevision.create({
    data: {
      listingId: id,
      seq: (last?.seq ?? 0) + 1,
      bullet1: bullet1 ? String(bullet1).trim() : null,
      bullet2: bullet2 ? String(bullet2).trim() : null,
      bullet3: bullet3 ? String(bullet3).trim() : null,
      bullet4: bullet4 ? String(bullet4).trim() : null,
      bullet5: bullet5 ? String(bullet5).trim() : null,
      note: note ?? null,
      origin: 'MANUAL_ENTRY',
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

  const rev = await prisma.bulletsRevision.findFirstOrThrow({
    where: { id: revisionId, listingId: id },
  })

  await prisma.bulletsRevision.delete({ where: { id: rev.id } })
  return NextResponse.json({ ok: true })
}
