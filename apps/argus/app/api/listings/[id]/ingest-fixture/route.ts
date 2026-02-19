import { NextResponse } from 'next/server'
import { join } from 'path'
import { ingestSnapshot } from '@/lib/ingest'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const htmlPath = join(process.cwd(), 'fixtures', 'amazon-pdp', 'replica.html')
  const assetsDir = join(process.cwd(), 'fixtures', 'amazon-pdp', 'listingpage_files')

  const result = await ingestSnapshot(id, htmlPath, assetsDir, new Date())
  return NextResponse.json(result)
}

