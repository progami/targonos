#!/usr/bin/env tsx

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { getTenantPrismaClient, disconnectAllTenants } from '../../src/lib/tenant/prisma-factory'
import { TENANT_CODES, type TenantCode } from '../../src/lib/tenant/constants'

type ScriptOptions = {
  onlyEmails: Set<string> | null
}

function loadEnv() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
  const candidates = [
    path.join(repoRoot, 'apps', 'sso', '.env.local'),
    path.join(repoRoot, 'apps', 'talos', '.env.local'),
  ]

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    dotenv.config({ path: candidate })
  }
}

function parseArgs(): ScriptOptions {
  const options: ScriptOptions = {
    onlyEmails: null,
  }

  for (const raw of process.argv.slice(2)) {
    const arg = raw.trim()
    if (arg === '--') continue
    if (arg.startsWith('--only=')) {
      const emails = (arg.split('=')[1] ?? '')
        .split(/[,\s]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
      options.onlyEmails = new Set(emails)
      continue
    }
    throw new Error(`Unknown arg: ${arg}`)
  }

  return options
}

type PortalUserRow = {
  email: string
  portalActive: boolean
  portalApps: string[]
}

type TenantUserRow = {
  active: boolean
  role: string
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 't' : 'f'
  return String(value)
}

function pad(text: string, width: number): string {
  if (text.length >= width) return text
  return text + ' '.repeat(width - text.length)
}

async function readPortalUsers(options: ScriptOptions): Promise<PortalUserRow[]> {
  if (!process.env.PORTAL_DB_URL) {
    throw new Error('PORTAL_DB_URL is not configured (load apps/sso/.env.local).')
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
  const clientPath = path.join(repoRoot, 'packages', 'auth', 'node_modules', '.prisma', 'client-auth', 'index.js')
  const prismaModule = await import(pathToFileURL(clientPath).toString())
  const prisma = new prismaModule.PrismaClient()

  const users = await prisma.user.findMany({
    select: {
      email: true,
      isActive: true,
      appAccess: { select: { app: { select: { slug: true } } } },
    },
    orderBy: { email: 'asc' },
  })

  const rows = users.map((user) => {
    const email = user.email.toLowerCase()
    return {
      email,
      portalActive: user.isActive,
      portalApps: user.appAccess.map((entry) => entry.app.slug).sort(),
    }
  })

  const filtered = options.onlyEmails
    ? rows.filter((row) => options.onlyEmails?.has(row.email))
    : rows

  await prisma.$disconnect()
  return filtered
}

async function readTenantUsersByEmail(
  tenantCode: TenantCode,
  emails: string[],
): Promise<Map<string, TenantUserRow>> {
  const prisma = await getTenantPrismaClient(tenantCode)
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { email: true, isActive: true, role: true },
  })

  const map = new Map<string, TenantUserRow>()
  for (const user of users) {
    map.set(user.email.toLowerCase(), { active: user.isActive, role: user.role })
  }
  return map
}

async function main() {
  loadEnv()
  const options = parseArgs()

  const portalUsers = await readPortalUsers(options)
  const emails = portalUsers.map((row) => row.email)

  const tenantMaps: Record<TenantCode, Map<string, TenantUserRow>> = {
    US: await readTenantUsersByEmail('US', emails),
    UK: await readTenantUsersByEmail('UK', emails),
  }

  const header = [
    'email',
    'portal_active',
    'portal_apps',
    'talos_app',
    ...TENANT_CODES.flatMap((code) => [`${code.toLowerCase()}_active`, `${code.toLowerCase()}_role`]),
  ]

  const rows = portalUsers.map((user) => {
    const hasTalos = user.portalApps.includes('talos')
    const values: string[] = [
      user.email,
      formatCell(user.portalActive),
      user.portalApps.join(','),
      formatCell(hasTalos),
    ]

    for (const tenantCode of TENANT_CODES) {
      const rec = tenantMaps[tenantCode].get(user.email)
      values.push(formatCell(rec?.active))
      values.push(formatCell(rec?.role))
    }

    return values
  })

  const widths = header.map((h, idx) =>
    Math.max(h.length, ...rows.map((row) => row[idx]?.length ?? 0)),
  )

  console.log(header.map((h, idx) => pad(h, widths[idx] ?? h.length)).join(' | '))
  console.log(widths.map((w) => '-'.repeat(w)).join('-|-'))
  for (const row of rows) {
    console.log(row.map((cell, idx) => pad(cell, widths[idx] ?? cell.length)).join(' | '))
  }

  const withoutTalos = portalUsers.filter((user) => user.portalActive && !user.portalApps.includes('talos'))
  if (withoutTalos.length > 0) {
    console.log('')
    console.log('Portal users missing talos entitlement:')
    for (const user of withoutTalos) {
      console.log(`- ${user.email}`)
    }
  }

  const withoutTenants = portalUsers.filter((user) => {
    const hasAnyTenant = TENANT_CODES.some((tenantCode) => tenantMaps[tenantCode].has(user.email))
    return user.portalActive && user.portalApps.includes('talos') && !hasAnyTenant
  })
  if (withoutTenants.length > 0) {
    console.log('')
    console.log('Portal users with talos entitlement but no tenant record (will require provisioning via tenant selection):')
    for (const user of withoutTenants) {
      console.log(`- ${user.email}`)
    }
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectAllTenants()
  })
