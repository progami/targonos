#!/usr/bin/env tsx

import { PrismaClient } from '@targon/prisma-talos'

type ScriptOptions = {
  apply: boolean
  help?: boolean
}

const UK_DB_ENV = 'DATABASE_URL_UK'

const TARGET_WAREHOUSES = [
  { code: 'FMC', name: 'FMC Logistics' },
  { code: 'VGLOBAL', name: 'Vglobal' },
] as const

const KEEP_CODES = new Set<string>([
  ...TARGET_WAREHOUSES.map((w) => w.code),
  'AMZN-US',
  'AMZN-UK',
])

function parseArgs(): ScriptOptions {
  const options: ScriptOptions = { apply: false }

  for (const raw of process.argv.slice(2)) {
    const arg = raw.trim()
    if (!arg) continue
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--apply') {
      options.apply = true
      continue
    }

    throw new Error(`Unknown arg: ${arg}`)
  }

  return options
}

function showHelp() {
  console.log(`
Normalize UK Warehouses

Ensures the UK tenant has exactly these active warehouses (non-Amazon):
  - FMC Logistics (code: FMC)
  - Vglobal (code: VGLOBAL)

Any other active, non-Amazon warehouses are deactivated (soft-delete) so they no longer appear in default lists.

Usage:
  pnpm --filter @targon/talos warehouses:normalize-uk [--apply]

Options:
  --apply      Apply changes (default: dry-run)
  --help, -h   Show this help

Notes:
  - Requires ${UK_DB_ENV} to be set (including the correct schema).
  - Amazon warehouses (AMZN-US, AMZN-UK) are left untouched.
`)
}

function getUkDatabaseUrl(): string {
  const url = process.env[UK_DB_ENV]
  if (!url) {
    throw new Error(`Missing ${UK_DB_ENV}. Set ${UK_DB_ENV} to the UK tenant database URL.`)
  }
  return url
}

async function main() {
  const options = parseArgs()
  if (options.help) {
    showHelp()
    return
  }

  const prisma = new PrismaClient({
    log: ['error'],
    datasources: { db: { url: getUkDatabaseUrl() } },
  })

  try {
    const existing = await prisma.warehouse.findMany({
      select: { id: true, code: true, name: true, isActive: true },
      orderBy: [{ code: 'asc' }],
    })

    const byCode = new Map(existing.map((w) => [w.code, w]))
    const toUpsert = TARGET_WAREHOUSES.map((target) => {
      const current = byCode.get(target.code)
      if (!current) {
        return { action: 'create' as const, target }
      }
      if (current.name !== target.name || current.isActive !== true) {
        return { action: 'update' as const, target, current }
      }
      return { action: 'noop' as const, target, current }
    })

    const toDeactivate = existing.filter((w) => w.isActive && !KEEP_CODES.has(w.code))

    console.log(`[uk-warehouses] UK DB: ${UK_DB_ENV}=${getUkDatabaseUrl().replace(/:(?:[^@/]+)@/, ':***@')}`)
    console.log(`[uk-warehouses] Found ${existing.length} warehouse(s) total`)
    console.log(
      `[uk-warehouses] Target: ${TARGET_WAREHOUSES.map((w) => `${w.code}=${w.name}`).join(', ')}`
    )

    for (const item of toUpsert) {
      if (item.action === 'create') {
        console.log(`[uk-warehouses] Will create ${item.target.code} (${item.target.name})`)
      } else if (item.action === 'update') {
        console.log(
          `[uk-warehouses] Will update ${item.target.code}: "${item.current.name}" -> "${item.target.name}" (isActive=${item.current.isActive} -> true)`
        )
      } else {
        console.log(`[uk-warehouses] OK ${item.target.code} (${item.target.name})`)
      }
    }

    if (toDeactivate.length > 0) {
      console.log(
        `[uk-warehouses] Will deactivate ${toDeactivate.length} warehouse(s): ${toDeactivate
          .map((w) => `${w.code}=${w.name}`)
          .join(', ')}`
      )
    } else {
      console.log('[uk-warehouses] No extra active warehouses to deactivate')
    }

    if (!options.apply) {
      console.log('[uk-warehouses] Dry-run only (pass --apply to execute)')
      return
    }

    await prisma.$transaction(async (tx) => {
      for (const item of toUpsert) {
        if (item.action === 'noop') continue

        await tx.warehouse.upsert({
          where: { code: item.target.code },
          create: {
            code: item.target.code,
            name: item.target.name,
            address: null,
            isActive: true,
          },
          update: {
            name: item.target.name,
            isActive: true,
          },
        })
      }

      for (const warehouse of toDeactivate) {
        await tx.warehouse.update({
          where: { id: warehouse.id },
          data: { isActive: false },
        })
      }
    })

    console.log('[uk-warehouses] Applied successfully')
  } finally {
    await prisma.$disconnect().catch(() => undefined)
  }
}

void main()

export {}
