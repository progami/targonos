import { NextResponse } from 'next/server'
import { ingestSnapshot } from '@/lib/ingest'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const body = await request.json()
  const { htmlPath, assetsDir, capturedAt } = body as {
    htmlPath: string
    assetsDir: string
    capturedAt?: string
  }

  const result = await ingestSnapshot(
    id,
    htmlPath,
    assetsDir,
    capturedAt ? new Date(capturedAt) : new Date(),
  )

  return NextResponse.json(result)
}
