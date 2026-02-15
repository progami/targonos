import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join, extname } from 'path'

const FIXTURES_DIR = join(process.cwd(), 'fixtures', 'amazon-pdp')

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params
  const filePath = join(FIXTURES_DIR, ...segments)

  // Prevent directory traversal
  if (!filePath.startsWith(FIXTURES_DIR)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const ext = extname(segments[segments.length - 1]).toLowerCase()
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'
  const isText = ['.html', '.css', '.js', '.json', '.svg'].includes(ext)
  const body = isText
    ? await readFile(filePath, 'utf-8')
    : (await readFile(filePath)).buffer as ArrayBuffer

  const cacheControl = ext === '.html'
    ? 'public, max-age=0, must-revalidate'
    : 'public, max-age=31536000, immutable'

  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
    },
  })
}
