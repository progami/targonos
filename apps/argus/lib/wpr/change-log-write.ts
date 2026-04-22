import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { execFile as execFileCallback } from 'node:child_process'
import { expectWritableWprChangeCategory } from './change-log-categories'

const execFile = promisify(execFileCallback)

const WEEK_FOLDER_PATTERN = /^Week (\d+) - \d{4}-\d{2}-\d{2} \(Sun\)(?: \(Partial\))?$/

export type CreateWprChangeLogEntryInput = {
  weekLabel: string
  entryDate: string
  category: string
  title: string
  summary: string
  asins: string[]
  fieldLabels: string[]
  highlights: string[]
  statusLines: string[]
}

type WprPaths = {
  dataDir: string
  workspaceRoot: string
  wprRoot: string
}

function resolveDataDir(): string {
  const value = process.env.WPR_DATA_DIR
  if (value === undefined) {
    throw new Error('WPR_DATA_DIR is required for Argus.')
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error('WPR_DATA_DIR is required for Argus.')
  }

  return trimmed
}

function resolveWprPaths(): WprPaths {
  const dataDir = resolveDataDir()
  const workspaceRoot = join(dataDir, '..')
  const wprRoot = join(workspaceRoot, '..')
  return { dataDir, workspaceRoot, wprRoot }
}

function expectWeekLabel(value: string): string {
  if (!/^W\d{2}$/.test(value)) {
    throw new Error(`Invalid WPR week label: ${value}`)
  }

  return value
}

function expectEntryDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid WPR entry date: ${value}`)
  }

  return value
}

function expectCategory(value: string): string {
  return expectWritableWprChangeCategory(value)
}

function expectNonEmptyString(value: string, fieldName: string): string {
  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error(`${fieldName} is required.`)
  }

  return trimmed
}

function expectAsins(values: string[]): string[] {
  const asins = values.map((value) => value.trim().toUpperCase()).filter((value) => value !== '')
  if (asins.length === 0) {
    throw new Error('At least one ASIN is required.')
  }

  for (const asin of asins) {
    if (!/^B0[A-Z0-9]{8}$/.test(asin)) {
      throw new Error(`Invalid ASIN: ${asin}`)
    }
  }

  return asins
}

function expectLineItems(values: string[], fieldName: string): string[] {
  const lines = values.map((value) => value.trim()).filter((value) => value !== '')
  if (fieldName === 'What changed' && lines.length === 0) {
    throw new Error('At least one change highlight is required.')
  }

  return lines
}

function resolveWeekFolderNumber(weekLabel: string): number {
  return Number.parseInt(weekLabel.slice(1), 10)
}

async function resolveWeekFolderPath(weekLabel: string): Promise<string> {
  const { wprRoot } = resolveWprPaths()
  try {
    await stat(wprRoot)
  } catch {
    throw new Error(`Missing WPR week folder for ${weekLabel}.`)
  }
  const targetWeekNumber = resolveWeekFolderNumber(weekLabel)
  const entries = await readdir(wprRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const match = WEEK_FOLDER_PATTERN.exec(entry.name)
    if (match === null) {
      continue
    }

    const folderWeekNumber = Number.parseInt(match[1], 10)
    if (folderWeekNumber === targetWeekNumber) {
      return join(wprRoot, entry.name)
    }
  }

  throw new Error(`Missing WPR week folder for ${weekLabel}.`)
}

function sanitizeFileStem(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function buildMarkdown(input: CreateWprChangeLogEntryInput): string {
  const fieldLine = input.fieldLabels.length > 0 ? input.fieldLabels.join(', ') : '—'
  const statusBlock = input.statusLines.map((line) => `- ${line}`).join('\n')

  return [
    `# ${input.title}`,
    '',
    `Entry date: ${input.entryDate}`,
    'Source: Plan Log',
    `Type: ${input.category}`,
    `ASINs: ${input.asins.join(', ')}`,
    `Fields: ${fieldLine}`,
    '',
    '## Change Summary',
    input.summary,
    '',
    '## What Changed (Observed)',
    ...input.highlights.map((line) => `- ${line}`),
    '',
    '## Status',
    statusBlock,
    '',
  ].join('\n')
}

async function defaultRebuildRunner(): Promise<void> {
  const rebuildScript = join(process.cwd(), 'apps/argus/scripts/wpr/rebuild_wpr.py')
  const buildScript = join(process.cwd(), 'apps/argus/scripts/wpr/build_intent_cluster_dashboard.py')
  await stat(rebuildScript)
  await stat(buildScript)
  await execFile('python3', [rebuildScript], { env: process.env, cwd: process.cwd(), maxBuffer: 1024 * 1024 * 16 })
  await execFile('python3', [buildScript], { env: process.env, cwd: process.cwd(), maxBuffer: 1024 * 1024 * 16 })
}

export async function createWprChangeLogEntry(
  input: CreateWprChangeLogEntryInput,
  runRebuild: () => Promise<void> = defaultRebuildRunner,
): Promise<{ filePath: string }> {
  const weekLabel = expectWeekLabel(input.weekLabel)
  const entryDate = expectEntryDate(input.entryDate)
  const category = expectCategory(input.category)
  const title = expectNonEmptyString(input.title, 'Title')
  const summary = expectNonEmptyString(input.summary, 'Summary')
  const asins = expectAsins(input.asins)
  const fieldLabels = expectLineItems(input.fieldLabels, 'Field labels')
  const highlights = expectLineItems(input.highlights, 'What changed')
  const statusLines = expectLineItems(input.statusLines, 'Status')

  const weekFolderPath = await resolveWeekFolderPath(weekLabel)
  const plansDir = join(weekFolderPath, 'output', 'Plans')
  await mkdir(plansDir, { recursive: true })

  const fileName = `${weekLabel}_${sanitizeFileStem(title)}_Log_${entryDate}.md`
  const filePath = join(plansDir, fileName)
  const markdown = buildMarkdown({
    weekLabel,
    entryDate,
    category,
    title,
    summary,
    asins,
    fieldLabels,
    highlights,
    statusLines,
  })

  await writeFile(filePath, markdown, { encoding: 'utf8', flag: 'wx' })
  await runRebuild()
  return { filePath }
}
