import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

import { getPortalAuthPrisma } from './db.js'
import type { AppRole, AuthzAppGrant, PortalAuthz } from './index.js'

type AppEntitlementMap = Record<string, AuthzAppGrant>

const DEFAULT_DEMO_USERNAME = 'demo-admin'
const DEFAULT_DEMO_PASSWORD = 'demo-password'
const DEMO_ADMIN_UUID = '00000000-0000-4000-a000-000000000001'

const credentialsSchema = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string().min(1),
})

const groupMembershipsSchema = z.record(z.string().email(), z.array(z.string().min(1))).transform((raw) => {
  const normalized: Record<string, string[]> = {}
  for (const [email, groups] of Object.entries(raw)) {
    normalized[email.trim().toLowerCase()] = groups
      .map((group) => group.trim())
      .filter(Boolean)
  }
  return normalized
})

export type AuthenticatedUser = {
  id: string
  email: string
  username: string | null
  fullName: string | null
  authzVersion: number
  globalRoles: string[]
  entitlements: AppEntitlementMap
}

const userSelect = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  passwordHash: true,
  authzVersion: true,
  roles: {
    select: {
      role: {
        select: {
          name: true,
        },
      },
    },
  },
  appAccess: {
    select: {
      role: true,
      source: true,
      locked: true,
      departments: true,
      app: {
        select: {
          slug: true,
        },
      },
    },
  },
} as const

type PortalUserRecord = {
  id: string
  email: string
  username: string | null
  firstName: string | null
  lastName: string | null
  passwordHash: string
  authzVersion: number
  roles: Array<{ role: { name: string } }>
  appAccess: Array<{
    role: string
    source: string
    locked: boolean
    departments: unknown
    app: { slug: string }
  }>
}

type ProvisionedAppAccess = {
  slug: string
  name: string
  departments: string[]
  role?: AppRole
  source?: 'manual' | 'group' | 'bootstrap'
  locked?: boolean
}

export type ManualAppGrantInput = {
  userId: string
  appSlug: string
  appName?: string
  role: AppRole
  departments?: string[]
  locked?: boolean
}

export type GroupSyncResult = {
  updatedUsers: number
  upsertedGrants: number
  deletedGrants: number
  skippedLocked: number
}

function parseEmailSet(raw: string | undefined) {
  return new Set(
    (raw ?? '')
      .split(/[,\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
}

function normalizeAppRole(value: unknown): AppRole {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'viewer' || normalized === 'member' || normalized === 'admin') {
      return 'viewer'
    }
  }
  return 'viewer'
}

function normalizeDepartments(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : []
}

function parseGroupMembershipsFromEnv(): Record<string, string[]> {
  const raw = process.env.GOOGLE_GROUP_MEMBERSHIPS_JSON
  if (!raw || raw.trim() === '') {
    return {}
  }

  try {
    const parsed = JSON.parse(raw)
    return groupMembershipsSchema.parse(parsed)
  } catch (error) {
    throw new Error(`GOOGLE_GROUP_MEMBERSHIPS_JSON is invalid: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const DEFAULT_PORTAL_BOOTSTRAP_ADMINS = new Set(['jarrar@targonglobal.com'])

function portalBootstrapAdminEmailSet() {
  const configured = parseEmailSet(process.env.PORTAL_BOOTSTRAP_ADMIN_EMAILS)
  return new Set([...DEFAULT_PORTAL_BOOTSTRAP_ADMINS, ...configured])
}

function defaultPortalAdminApps() {
  return [
    { slug: 'talos', name: 'Talos', departments: ['Ops'], role: 'viewer' as const, source: 'bootstrap' as const },
    { slug: 'atlas', name: 'Atlas', departments: ['People Ops'], role: 'viewer' as const, source: 'bootstrap' as const },
    { slug: 'website', name: 'Website', departments: [], role: 'viewer' as const, source: 'bootstrap' as const },
    { slug: 'kairos', name: 'Kairos', departments: ['Product'], role: 'viewer' as const, source: 'bootstrap' as const },
    { slug: 'xplan', name: 'xplan', departments: ['Product'], role: 'viewer' as const, source: 'bootstrap' as const },
    { slug: 'hermes', name: 'Hermes', departments: ['Account / Listing'], role: 'viewer' as const, source: 'bootstrap' as const },
    { slug: 'plutus', name: 'Plutus', departments: ['Finance'], role: 'viewer' as const, source: 'bootstrap' as const },
    { slug: 'argus', name: 'Argus', departments: ['Account / Listing'], role: 'viewer' as const, source: 'bootstrap' as const },
  ]
}

async function ensurePlatformAdminRole(tx: any): Promise<string> {
  const role = await tx.role.upsert({
    where: { name: 'platform_admin' },
    update: {},
    create: {
      name: 'platform_admin',
      description: 'Global admin role for cross-app access management.',
    },
    select: { id: true },
  })
  return role.id
}

async function assignPlatformAdminRole(tx: any, userId: string): Promise<void> {
  const roleId = await ensurePlatformAdminRole(tx)
  await tx.userRole.upsert({
    where: {
      userId_roleId: {
        userId,
        roleId,
      },
    },
    update: {},
    create: {
      userId,
      roleId,
    },
  })
}

async function bumpAuthzVersion(tx: any, userId: string): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: {
      authzVersion: {
        increment: 1,
      },
    },
    select: { id: true },
  })
}

async function ensureBootstrapPortalAdminUser(normalizedEmail: string) {
  const prisma = getPortalAuthPrisma()

  await prisma.$transaction(async (tx) => {
    const usernameBase = (normalizedEmail.split('@')[0] || 'admin')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'admin'

    const existingUser = await tx.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, username: true },
    })

    const userId = existingUser
      ? (
          await tx.user.update({
            where: { email: normalizedEmail },
            data: {
              isActive: true,
              username: existingUser.username ?? usernameBase,
            },
            select: { id: true },
          })
        ).id
      : (
          await tx.user.create({
            data: {
              email: normalizedEmail,
              username: usernameBase,
              passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
              firstName: null,
              lastName: null,
              isActive: true,
              isDemo: false,
            },
            select: { id: true },
          })
        ).id

    for (const app of defaultPortalAdminApps()) {
      const appRecord = await tx.app.upsert({
        where: { slug: app.slug },
        update: {},
        create: { slug: app.slug, name: app.name, description: null },
        select: { id: true },
      })

      await tx.userApp.upsert({
        where: { userId_appId: { userId, appId: appRecord.id } },
        update: {
          role: app.role,
          source: app.source,
          locked: true,
          departments: app.departments,
        },
        create: {
          userId,
          appId: appRecord.id,
          role: app.role,
          source: app.source,
          locked: true,
          departments: app.departments,
        },
      })
    }

    await assignPlatformAdminRole(tx, userId)
    await bumpAuthzVersion(tx, userId)
  })
}

export async function provisionPortalUser(options: {
  email: string
  firstName?: string | null
  lastName?: string | null
  apps: ProvisionedAppAccess[]
}): Promise<AuthenticatedUser> {
  const normalizedEmail = options.email.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('Portal user provisioning requires an email address.')
  }
  if (!process.env.PORTAL_DB_URL) {
    throw new Error('PORTAL_DB_URL must be configured to provision portal users.')
  }

  const prisma = getPortalAuthPrisma()

  const provisioned = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    })

    const updateData: { isActive: boolean; firstName?: string | null; lastName?: string | null } = {
      isActive: true,
    }

    if (options.firstName !== undefined) {
      updateData.firstName = options.firstName
    }
    if (options.lastName !== undefined) {
      updateData.lastName = options.lastName
    }

    const userId = existingUser
      ? (
          await tx.user.update({
            where: { email: normalizedEmail },
            data: updateData,
            select: { id: true },
          })
        ).id
      : (
          await tx.user.create({
            data: {
              email: normalizedEmail,
              username: null,
              passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
              firstName: options.firstName ?? null,
              lastName: options.lastName ?? null,
              isActive: true,
              isDemo: false,
            },
            select: { id: true },
          })
        ).id

    for (const app of options.apps) {
      const appRecord = await tx.app.upsert({
        where: { slug: app.slug },
        update: {},
        create: { slug: app.slug, name: app.name, description: null },
        select: { id: true },
      })

      await tx.userApp.upsert({
        where: { userId_appId: { userId, appId: appRecord.id } },
        update: {
          role: app.role ?? 'viewer',
          source: app.source ?? 'manual',
          locked: app.locked ?? false,
          departments: app.departments,
        },
        create: {
          userId,
          appId: appRecord.id,
          role: app.role ?? 'viewer',
          source: app.source ?? 'manual',
          locked: app.locked ?? false,
          departments: app.departments,
        },
      })
    }

    await bumpAuthzVersion(tx, userId)

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: userSelect,
    }) as PortalUserRecord | null

    if (!user) {
      throw new Error('PortalUserMissing')
    }

    return user
  })

  return mapPortalUser(provisioned)
}

export async function upsertManualUserAppGrant(input: ManualAppGrantInput): Promise<AuthenticatedUser> {
  if (!process.env.PORTAL_DB_URL) {
    throw new Error('PORTAL_DB_URL must be configured to update app grants.')
  }

  const prisma = getPortalAuthPrisma()
  const user = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    })

    if (!existingUser) {
      throw new Error('PortalUserMissing')
    }

    const appRecord = await tx.app.upsert({
      where: { slug: input.appSlug },
      update: {
        ...(input.appName ? { name: input.appName } : {}),
      },
      create: {
        slug: input.appSlug,
        name: input.appName ?? input.appSlug,
        description: null,
      },
      select: { id: true },
    })

    await tx.userApp.upsert({
      where: { userId_appId: { userId: input.userId, appId: appRecord.id } },
      update: {
        role: input.role,
        source: 'manual',
        locked: input.locked ?? true,
        departments: input.departments ?? [],
      },
      create: {
        userId: input.userId,
        appId: appRecord.id,
        role: input.role,
        source: 'manual',
        locked: input.locked ?? true,
        departments: input.departments ?? [],
      },
    })

    await bumpAuthzVersion(tx, input.userId)

    return tx.user.findUnique({
      where: { id: input.userId },
      select: userSelect,
    }) as Promise<PortalUserRecord | null>
  })

  if (!user) {
    throw new Error('PortalUserMissing')
  }

  return mapPortalUser(user)
}

export async function removeManualUserAppGrant(userId: string, appSlug: string): Promise<AuthenticatedUser> {
  if (!process.env.PORTAL_DB_URL) {
    throw new Error('PORTAL_DB_URL must be configured to update app grants.')
  }

  const prisma = getPortalAuthPrisma()

  const updated = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!existingUser) {
      throw new Error('PortalUserMissing')
    }

    const appRecord = await tx.app.findUnique({
      where: { slug: appSlug },
      select: { id: true },
    })

    if (appRecord) {
      await tx.userApp.deleteMany({
        where: {
          userId,
          appId: appRecord.id,
          source: 'manual',
        },
      })
    }

    await bumpAuthzVersion(tx, userId)

    return tx.user.findUnique({
      where: { id: userId },
      select: userSelect,
    }) as Promise<PortalUserRecord | null>
  })

  if (!updated) {
    throw new Error('PortalUserMissing')
  }

  return mapPortalUser(updated)
}

export async function syncGroupBasedAppAccess(): Promise<GroupSyncResult> {
  if (!process.env.PORTAL_DB_URL) {
    return {
      updatedUsers: 0,
      upsertedGrants: 0,
      deletedGrants: 0,
      skippedLocked: 0,
    }
  }

  const membershipsByEmail = parseGroupMembershipsFromEnv()
  const prisma = getPortalAuthPrisma()

  const [users, mappings] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
      },
    }),
    prisma.groupAppMapping.findMany({
      where: { isActive: true },
      select: {
        googleGroup: true,
        role: true,
        departments: true,
        app: {
          select: {
            id: true,
            slug: true,
          },
        },
      },
    }),
  ])

  const mappingByGroup = new Map<string, Array<{ appId: string; role: AppRole; departments: string[] }>>()
  for (const mapping of mappings) {
    const key = mapping.googleGroup.trim()
    const list = mappingByGroup.get(key) ?? []
    list.push({
      appId: mapping.app.id,
      role: normalizeAppRole(mapping.role),
      departments: normalizeDepartments(mapping.departments),
    })
    mappingByGroup.set(key, list)
  }

  let updatedUsers = 0
  let upsertedGrants = 0
  let deletedGrants = 0
  let skippedLocked = 0

  for (const user of users) {
    const groupNames = membershipsByEmail[user.email.toLowerCase()] ?? []
    const desiredByApp = new Map<string, { role: AppRole; departments: string[] }>()

    for (const groupName of groupNames) {
      const mappingsForGroup = mappingByGroup.get(groupName)
      if (!mappingsForGroup) continue

      for (const mapping of mappingsForGroup) {
        const existing = desiredByApp.get(mapping.appId)
        if (!existing) {
          desiredByApp.set(mapping.appId, {
            role: mapping.role,
            departments: mapping.departments,
          })
          continue
        }

        const deptSet = new Set<string>([...existing.departments, ...mapping.departments])

        desiredByApp.set(mapping.appId, {
          role: 'viewer',
          departments: Array.from(deptSet),
        })
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.userApp.findMany({
        where: {
          userId: user.id,
        },
        select: {
          appId: true,
          role: true,
          source: true,
          locked: true,
          departments: true,
        },
      })

      let changed = false
      let localUpserts = 0
      let localDeletes = 0
      let localSkippedLocked = 0

      const existingGroupMap = new Map(existing.filter((entry) => entry.source === 'group').map((entry) => [entry.appId, entry]))
      const existingByAppMap = new Map(existing.map((entry) => [entry.appId, entry]))

      for (const [appId, desired] of desiredByApp.entries()) {
        const currentAny = existingByAppMap.get(appId)
        if (currentAny?.source === 'manual') {
          localSkippedLocked += 1
          continue
        }
        if (currentAny?.locked && currentAny.source !== 'group') {
          localSkippedLocked += 1
          continue
        }

        const current = existingGroupMap.get(appId)
        const currentRole = current ? normalizeAppRole(current.role) : null
        const currentDepartments = current ? normalizeDepartments(current.departments) : []
        const sameRole = currentRole === desired.role
        const sameDepartments =
          currentDepartments.length === desired.departments.length
          && currentDepartments.every((dept, idx) => dept === desired.departments[idx])

        if (sameRole && sameDepartments) {
          continue
        }

        await tx.userApp.upsert({
          where: {
            userId_appId: {
              userId: user.id,
              appId,
            },
          },
          update: {
            role: desired.role,
            departments: desired.departments,
            source: 'group',
            locked: false,
          },
          create: {
            userId: user.id,
            appId,
            role: desired.role,
            departments: desired.departments,
            source: 'group',
            locked: false,
          },
        })

        changed = true
        localUpserts += 1
      }

      for (const [appId, current] of existingGroupMap.entries()) {
        if (desiredByApp.has(appId)) {
          continue
        }

        if (current.locked) {
          localSkippedLocked += 1
          continue
        }

        await tx.userApp.delete({
          where: {
            userId_appId: {
              userId: user.id,
              appId,
            },
          },
        })

        changed = true
        localDeletes += 1
      }

      if (changed) {
        await bumpAuthzVersion(tx, user.id)
      }

      return {
        changed,
        localUpserts,
        localDeletes,
        localSkippedLocked,
      }
    })

    if (result.changed) {
      updatedUsers += 1
    }
    upsertedGrants += result.localUpserts
    deletedGrants += result.localDeletes
    skippedLocked += result.localSkippedLocked
  }

  return {
    updatedUsers,
    upsertedGrants,
    deletedGrants,
    skippedLocked,
  }
}

export async function authenticateWithPortalDirectory(input: unknown): Promise<AuthenticatedUser | null> {
  const { emailOrUsername, password } = credentialsSchema.parse(input)

  const loginValue = emailOrUsername.trim().toLowerCase()

  if (!process.env.PORTAL_DB_URL) {
    return process.env.NODE_ENV !== 'production'
      ? handleDevFallback(loginValue, password)
      : null
  }

  const prisma = getPortalAuthPrisma()

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: loginValue },
        { username: loginValue },
      ],
      isActive: true,
    },
    select: userSelect,
  }) as (PortalUserRecord | null)

  if (!user) {
    return null
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash)
  if (!isMatch) {
    return null
  }

  return mapPortalUser(user)
}

function handleDevFallback(emailOrUsername: string, password: string): AuthenticatedUser | null {
  const demoUsername = (process.env.DEMO_ADMIN_USERNAME || DEFAULT_DEMO_USERNAME).toLowerCase()
  const demoPassword = process.env.DEMO_ADMIN_PASSWORD || DEFAULT_DEMO_PASSWORD

  if (emailOrUsername !== demoUsername) {
    return null
  }

  if (password !== demoPassword) {
    return null
  }

  return buildDemoUser()
}

function buildDemoUser(): AuthenticatedUser {
  const demoUsername = (process.env.DEMO_ADMIN_USERNAME || DEFAULT_DEMO_USERNAME).toLowerCase()
  const entitlements: AppEntitlementMap = {
    talos: { role: 'viewer', departments: ['Ops'] },
    atlas: { role: 'viewer', departments: ['People Ops'] },
    website: { role: 'viewer', departments: [] },
    kairos: { role: 'viewer', departments: ['Product'] },
    xplan: { role: 'viewer', departments: ['Product'] },
    hermes: { role: 'viewer', departments: ['Account / Listing'] },
    plutus: { role: 'viewer', departments: ['Finance'] },
    argus: { role: 'viewer', departments: ['Account / Listing'] },
  }

  return {
    id: DEMO_ADMIN_UUID,
    email: process.env.DEMO_ADMIN_EMAIL || 'dev-admin@targonglobal.com',
    username: demoUsername,
    fullName: 'Development Admin',
    authzVersion: 1,
    globalRoles: ['platform_admin'],
    entitlements,
  }
}

export async function getUserEntitlements(userId: string): Promise<AppEntitlementMap> {
  if (!process.env.PORTAL_DB_URL) {
    return {}
  }

  const prisma = getPortalAuthPrisma()

  const assignments = await prisma.userApp.findMany({
    where: { userId },
    select: {
      role: true,
      departments: true,
      app: {
        select: {
          slug: true,
        },
      },
    },
  })

  const entitlements: AppEntitlementMap = {}
  for (const assignment of assignments) {
    entitlements[assignment.app.slug] = {
      role: normalizeAppRole(assignment.role),
      departments: normalizeDepartments(assignment.departments),
    }
  }

  return entitlements
}

export async function getUserGlobalRoles(userId: string): Promise<string[]> {
  if (!process.env.PORTAL_DB_URL) {
    return []
  }

  const prisma = getPortalAuthPrisma()
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: {
      role: {
        select: {
          name: true,
        },
      },
    },
  })

  return userRoles.map((entry) => entry.role.name)
}

export async function getUserAuthz(userId: string): Promise<PortalAuthz> {
  if (!process.env.PORTAL_DB_URL) {
    return {
      version: 1,
      globalRoles: ['platform_admin'],
      apps: buildDemoUser().entitlements,
    }
  }

  const prisma = getPortalAuthPrisma()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      authzVersion: true,
      appAccess: {
        select: {
          role: true,
          departments: true,
          app: {
            select: {
              slug: true,
            },
          },
        },
      },
      roles: {
        select: {
          role: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  })

  if (!user) {
    return {
      version: 1,
      globalRoles: [],
      apps: {},
    }
  }

  const apps: AppEntitlementMap = {}
  for (const assignment of user.appAccess) {
    apps[assignment.app.slug] = {
      role: normalizeAppRole(assignment.role),
      departments: normalizeDepartments(assignment.departments),
    }
  }

  return {
    version: user.authzVersion,
    globalRoles: user.roles.map((entry) => entry.role.name),
    apps,
  }
}

export async function getUserByEmail(email: string): Promise<AuthenticatedUser | null> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return null

  if (!process.env.PORTAL_DB_URL) {
    const demoUser = buildDemoUser()
    if (demoUser.email.toLowerCase() === normalizedEmail) {
      return demoUser
    }
    return null
  }

  const prisma = getPortalAuthPrisma()

  const fetchUser = async () =>
    prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        isActive: true,
      },
      select: userSelect,
    }) as Promise<PortalUserRecord | null>

  let user = await fetchUser()

  if (portalBootstrapAdminEmailSet().has(normalizedEmail)) {
    const requiredSlugs = defaultPortalAdminApps().map((app) => app.slug)
    const currentSlugs = user ? new Set(user.appAccess.map((entry) => entry.app.slug)) : new Set<string>()
    const hasAllAppAccess = user ? requiredSlugs.every((slug) => currentSlugs.has(slug)) : false

    if (!user || !hasAllAppAccess) {
      await ensureBootstrapPortalAdminUser(normalizedEmail)
      user = await fetchUser()
    }
  }

  if (!user) return null
  return mapPortalUser(user)
}

function mapPortalUser(user: PortalUserRecord): AuthenticatedUser {
  const entitlements = user.appAccess.reduce<AppEntitlementMap>((acc, assignment) => {
    acc[assignment.app.slug] = {
      role: normalizeAppRole(assignment.role),
      departments: normalizeDepartments(assignment.departments),
    }
    return acc
  }, {} as AppEntitlementMap)

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
    authzVersion: user.authzVersion,
    globalRoles: user.roles.map((entry) => entry.role.name),
    entitlements,
  }
}
