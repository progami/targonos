import { NextRequest, NextResponse } from 'next/server'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { join, extname } from 'path'
import { Readable } from 'stream'

export const runtime = 'nodejs'

const MEDIA_DIR = join(process.cwd(), 'public', 'media')

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m3u8': 'application/x-mpegURL',
  '.vtt': 'text/vtt',
}

function parseRange(rangeHeader: string, size: number): { start: number; end: number } | null {
  const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/u)
  if (!match) return null

  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : size - 1

  if (!Number.isFinite(start)) return null
  if (!Number.isFinite(end)) return null
  if (start < 0) return null
  if (end < start) return null
  if (start >= size) return null

  return { start, end: Math.min(end, size - 1) }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params
  const filePath = join(MEDIA_DIR, ...segments)

  if (!filePath.startsWith(MEDIA_DIR)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const info = await stat(filePath).catch(() => null)
  if (!info) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const ext = extname(segments[segments.length - 1]).toLowerCase()
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'

  const rangeHeader = request.headers.get('range')
  const range = rangeHeader ? parseRange(rangeHeader, info.size) : null

  const start = range ? range.start : 0
  const end = range ? range.end : info.size - 1
  const length = end - start + 1

  const stream = createReadStream(filePath, { start, end })

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Length': String(length),
  }

  if (range) {
    headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`
  }

  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: range ? 206 : 200,
    headers,
  })
}

