#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  WORKTREE_DEV_AUTHZ,
  WORKTREE_DEV_USER_EMAIL,
  WORKTREE_DEV_USER_ID,
  WORKTREE_DEV_USER_NAME,
  WORKTREE_TALOS_USER_IDS,
} from './worktree-dev-auth-config.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const ENV_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/
const DISABLED_PASSWORD_HASH = 'worktree-dev-auth-disabled'

const { getPortalAuthPrisma } = await import('../packages/auth/dist/server.js')
const { PrismaClient: TalosPrismaClient, TenantCode, UserRole } = await import('../packages/prisma-talos/generated/index.js')

function parseEnvFile(filePath) {
  const values = new Map()
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const match = ENV_ASSIGNMENT.exec(trimmed)
    if (!match) {
      continue
    }

    values.set(match[1], match[2])
  }
  return values
}

function requireEnvValue(values, key, label) {
  const value = values.get(key)
  if (!value || value.trim() === '') {
    throw new Error(`Missing ${key} in ${label}`)
  }
  return value.trim()
}

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ')
  if (!firstName) {
    throw new Error('Worktree dev user name must include at least one token.')
  }
  return {
    firstName,
    lastName: lastName.length > 0 ? lastName : null,
  }
}

async function ensurePortalUser() {
  const authPrisma = getPortalAuthPrisma()
  const { firstName, lastName } = splitName(WORKTREE_DEV_USER_NAME)

  const existingUser = await authPrisma.user.findUnique({
    where: { email: WORKTREE_DEV_USER_EMAIL },
    select: { id: true },
  })

  if (existingUser && existingUser.id !== WORKTREE_DEV_USER_ID) {
    await authPrisma.user.delete({
      where: { id: existingUser.id },
    })
  }

  const user = await authPrisma.user.upsert({
    where: { email: WORKTREE_DEV_USER_EMAIL },
    update: {
      passwordHash: DISABLED_PASSWORD_HASH,
      username: null,
      firstName,
      lastName,
      isActive: true,
      isDemo: false,
    },
    create: {
      id: WORKTREE_DEV_USER_ID,
      email: WORKTREE_DEV_USER_EMAIL,
      username: null,
      passwordHash: DISABLED_PASSWORD_HASH,
      firstName,
      lastName,
      isActive: true,
      isDemo: false,
    },
    select: { id: true },
  })

  const role = await authPrisma.role.upsert({
    where: { name: 'platform_admin' },
    update: {},
    create: {
      name: 'platform_admin',
      description: 'Codex worktree development super-admin',
    },
    select: { id: true },
  })

  await authPrisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: role.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: role.id,
    },
  })

  for (const [slug, grant] of Object.entries(WORKTREE_DEV_AUTHZ.apps)) {
    const app = await authPrisma.app.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        name: slug,
      },
      select: { id: true },
    })

    await authPrisma.userApp.upsert({
      where: {
        userId_appId: {
          userId: user.id,
          appId: app.id,
        },
      },
      update: {
        source: 'manual',
        locked: true,
        departments: grant.departments,
        tenantMemberships: grant.tenantMemberships,
      },
      create: {
        userId: user.id,
        appId: app.id,
        source: 'manual',
        locked: true,
        departments: grant.departments,
        tenantMemberships: grant.tenantMemberships,
      },
    })
  }
}

async function ensureTalosUser(databaseUrl, tenantCode, userId) {
  const prisma = new TalosPrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  })

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: WORKTREE_DEV_USER_EMAIL },
      select: { id: true },
    })

    if (existingUser && existingUser.id !== userId) {
      await prisma.user.delete({
        where: { id: existingUser.id },
      })
    }

    await prisma.user.upsert({
      where: { email: WORKTREE_DEV_USER_EMAIL },
      update: {
        passwordHash: DISABLED_PASSWORD_HASH,
        fullName: WORKTREE_DEV_USER_NAME,
        role: UserRole.admin,
        region: tenantCode,
        warehouseId: null,
        isActive: true,
        isDemo: false,
      },
      create: {
        id: userId,
        email: WORKTREE_DEV_USER_EMAIL,
        username: null,
        passwordHash: DISABLED_PASSWORD_HASH,
        fullName: WORKTREE_DEV_USER_NAME,
        role: UserRole.admin,
        region: tenantCode,
        warehouseId: null,
        isActive: true,
        isDemo: false,
      },
    })
  } finally {
    await prisma.$disconnect()
  }
}

async function main() {
  const ssoEnv = parseEnvFile(path.join(ROOT_DIR, 'apps', 'sso', '.env.local'))
  const talosEnv = parseEnvFile(path.join(ROOT_DIR, 'apps', 'talos', '.env.local'))

  process.env.PORTAL_DB_URL = requireEnvValue(ssoEnv, 'PORTAL_DB_URL', 'apps/sso/.env.local')

  await ensurePortalUser()

  await ensureTalosUser(
    requireEnvValue(talosEnv, 'DATABASE_URL_US', 'apps/talos/.env.local'),
    TenantCode.US,
    WORKTREE_TALOS_USER_IDS.US,
  )
  await ensureTalosUser(
    requireEnvValue(talosEnv, 'DATABASE_URL_UK', 'apps/talos/.env.local'),
    TenantCode.UK,
    WORKTREE_TALOS_USER_IDS.UK,
  )

  process.stdout.write(`${WORKTREE_DEV_USER_EMAIL}\n`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
