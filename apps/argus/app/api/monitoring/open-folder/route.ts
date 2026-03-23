import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { path: filePath } = await request.json()

  if (!filePath || typeof filePath !== 'string') {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  }

  // Resolve to parent directory if it's a file
  let targetDir = filePath
  try {
    const stat = await fs.stat(filePath)
    if (stat.isFile()) {
      targetDir = path.dirname(filePath)
    }
  } catch {
    // Path doesn't exist — try the parent
    targetDir = path.dirname(filePath)
  }

  exec(`open "${targetDir}"`)

  return NextResponse.json({ opened: targetDir })
}
