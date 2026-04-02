import { NextResponse } from 'next/server'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import JSZip from 'jszip'
import { ingestSnapshotHtml } from '@/lib/ingest'

export const runtime = 'nodejs'

const MAX_ZIP_BYTES = 50 * 1024 * 1024

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json(
      { error: 'Expected multipart/form-data with a zip file.' },
      { status: 415 },
    )
  }

  const formData = await request.formData()
  const file = formData.get('snapshot') ?? formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing zip file in form field snapshot.' }, { status: 400 })
  }

  if (file.size > MAX_ZIP_BYTES) {
    return NextResponse.json(
      { error: `Zip file too large (max ${MAX_ZIP_BYTES} bytes).` },
      { status: 413 },
    )
  }

  const capturedAtRaw = formData.get('capturedAt')
  const capturedAtInput = typeof capturedAtRaw === 'string' ? capturedAtRaw.trim() : ''
  const capturedAt = capturedAtInput ? new Date(capturedAtInput) : new Date()
  if (Number.isNaN(capturedAt.getTime())) {
    return NextResponse.json({ error: 'Invalid capturedAt timestamp.' }, { status: 400 })
  }

  const zipBuf = Buffer.from(await file.arrayBuffer())
  const zip = await JSZip.loadAsync(zipBuf)

  const htmlCandidates = Object.entries(zip.files)
    .filter(([name, entry]) => !entry.dir && name.toLowerCase().endsWith('.html'))
    .sort(([a], [b]) => {
      const aDepth = a.split('/').filter(Boolean).length
      const bDepth = b.split('/').filter(Boolean).length
      if (aDepth !== bDepth) return aDepth - bDepth
      if (a.length !== b.length) return a.length - b.length
      return a.localeCompare(b)
    })

  const htmlEntry = htmlCandidates[0]?.[1] ?? null
  if (!htmlEntry) {
    return NextResponse.json({ error: 'Zip must include an .html file.' }, { status: 400 })
  }

  const html = await htmlEntry.async('string')
  const stagingDir = await mkdtemp(join(tmpdir(), 'argus-ingest-'))

  try {
    for (const [name, entry] of Object.entries(zip.files)) {
      const normalized = name.replaceAll('\\', '/').replace(/^\/+/g, '')
      const parts = normalized.split('/').filter(Boolean)
      if (parts.length === 0) continue
      if (parts.some((part) => part === '.' || part === '..')) {
        continue
      }

      const outPath = resolve(stagingDir, ...parts)
      if (!outPath.startsWith(`${stagingDir}/`) && outPath !== stagingDir) {
        continue
      }

      if (entry.dir) {
        await mkdir(outPath, { recursive: true })
        continue
      }

      await mkdir(dirname(outPath), { recursive: true })
      const data = await entry.async('nodebuffer')
      await writeFile(outPath, data)
    }

    const topLevelDirs = new Set<string>()
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue
      const normalized = name.replaceAll('\\', '/').replace(/^\/+/g, '')
      const parts = normalized.split('/').filter(Boolean)
      const top = parts[0]
      if (top && parts.length > 1) {
        topLevelDirs.add(top)
      }
    }

    const assetsDirName = topLevelDirs.has('listingpage_files')
      ? 'listingpage_files'
      : Array.from(topLevelDirs).find((dir) => dir.endsWith('_files')) ?? ''

    const assetsDir = assetsDirName ? join(stagingDir, assetsDirName) : stagingDir
    const result = await ingestSnapshotHtml(id, html, assetsDir, capturedAt, null)
    return NextResponse.json(result)
  } finally {
    await rm(stagingDir, { recursive: true, force: true })
  }

}
