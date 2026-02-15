import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const pointers = await prisma.ebcModulePointer.findMany({
    where: { listingId: id },
    orderBy: [{ sectionType: 'asc' }, { modulePosition: 'asc' }],
  })

  return NextResponse.json(pointers)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json()

  const { sectionType, modulePosition, ebcRevisionId } = body as {
    sectionType: string
    modulePosition: number
    ebcRevisionId: string
  }

  const pointer = await prisma.ebcModulePointer.upsert({
    where: {
      listingId_sectionType_modulePosition: {
        listingId: id,
        sectionType,
        modulePosition,
      },
    },
    update: {
      ebcRevisionId,
    },
    create: {
      listingId: id,
      sectionType,
      modulePosition,
      ebcRevisionId,
    },
  })

  return NextResponse.json(pointer)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json()

  const { all, sectionType, modulePosition } = body as {
    all?: boolean
    sectionType?: string
    modulePosition?: number
  }

  if (all === true) {
    const res = await prisma.ebcModulePointer.deleteMany({
      where: { listingId: id },
    })
    return NextResponse.json({ ok: true, deleted: res.count })
  }

  if (!sectionType || typeof modulePosition !== 'number') {
    return NextResponse.json({ error: 'sectionType and modulePosition are required' }, { status: 400 })
  }

  const res = await prisma.ebcModulePointer.deleteMany({
    where: {
      listingId: id,
      sectionType,
      modulePosition,
    },
  })

  return NextResponse.json({ ok: true, deleted: res.count })
}
