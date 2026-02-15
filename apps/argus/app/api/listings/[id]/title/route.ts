import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const revisions = await prisma.titleRevision.findMany({
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

  const { title, note } = body as { title: string; note?: string | null }
  const normalized = String(title).trim()
  if (normalized.length === 0) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const last = await prisma.titleRevision.findFirst({
    where: { listingId: id },
    orderBy: { seq: 'desc' },
  })

  const rev = await prisma.titleRevision.create({
    data: {
      listingId: id,
      seq: (last?.seq ?? 0) + 1,
      title: normalized,
      note: note ?? null,
      origin: 'MANUAL_ENTRY',
    },
  })

  return NextResponse.json(rev)
}
