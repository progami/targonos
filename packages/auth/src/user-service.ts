import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

import { getPortalAuthPrisma } from './db.js'

type AppEntitlementMap = Record<string, { departments: string[] }>

const DEFAULT_DEMO_USERNAME = 'demo-admin'
const DEFAULT_DEMO_PASSWORD = 'demo-password'
const DEMO_ADMIN_UUID = '00000000-0000-4000-a000-000000000001'

const credentialsSchema = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string().min(1),
})

export type AuthenticatedUser = {
  id: string
  email: string
  username: string | null
  fullName: string | null
  roles: string[]
  entitlements: Record<string, { departments: string[] }>
}

const userSelect = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  passwordHash: true,
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
  roles: Array<{ role: { name: string } }>
  appAccess: Array<{ departments: unknown; app: { slug: string } }>
}

function parseEmailSet(raw: string | undefined) {
  return new Set(
    (raw ?? '')
      .split(/[,\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
}

const DEFAULT_PORTAL_BOOTSTRAP_ADMINS = new Set(['jarrar@targonglobal.com'])

function portalBootstrapAdminEmailSet() {
  const configured = parseEmailSet(process.env.PORTAL_BOOTSTRAP_ADMIN_EMAILS)
  return new Set([...DEFAULT_PORTAL_BOOTSTRAP_ADMINS, ...configured])
}

function defaultPortalAdminApps() {
  return [
    { slug: 'talos', name: 'Talos', departments: ['Ops'] },
    { slug: 'atlas', name: 'Atlas', departments: ['People Ops'] },
    { slug: 'website', name: 'Website', departments: [] },
    { slug: 'kairos', name: 'Kairos', departments: ['Product'] },
     { slug: 'xplan', name: 'xplan', departments: ['Product'] },
  ]
}

async function ensureBootstrapPortalAdminUser(normalizedEmail: string) {
  const prisma = getPortalAuthPrisma()

  await prisma.$transaction(async (tx) => {
    const role = await tx.role.upsert({
      where: { name: 'admin' },
      update: {},
      create: { name: 'admin', description: 'Bootstrap admin role' },
    })

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

    await tx.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: {},
      create: { userId, roleId: role.id },
    })

    for (const app of defaultPortalAdminApps()) {
      const appRecord = await tx.app.upsert({
        where: { slug: app.slug },
        update: {},
        create: { slug: app.slug, name: app.name, description: null },
        select: { id: true },
      })

      await tx.userApp.upsert({
        where: { userId_appId: { userId, appId: appRecord.id } },
        update: { departments: app.departments },
        create: { userId, appId: appRecord.id, departments: app.departments },
      })
    }
  })
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
    talos: { departments: ['Ops'] },
    atlas: { departments: ['People Ops'] },
    website: { departments: [] },
    kairos: { departments: ['Product'] },
    'xplan': { departments: ['Product'] },
  }

  return {
    id: DEMO_ADMIN_UUID,
    email: process.env.DEMO_ADMIN_EMAIL || 'dev-admin@targonglobal.com',
    username: demoUsername,
    fullName: 'Development Admin',
    roles: ['admin'],
    entitlements,
  }
}

export async function getUserEntitlements(userId: string) {
  if (!process.env.PORTAL_DB_URL) {
    return {}
  }

  const prisma = getPortalAuthPrisma()

  const assignments = await prisma.userApp.findMany({
    where: { userId },
    select: {
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
      departments: Array.isArray(assignment.departments) ? (assignment.departments as string[]) : [],
    }
  }

  return entitlements
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
    const hasAdminRole = user?.roles.some((entry) => entry.role.name === 'admin') ?? false
    const currentSlugs = new Set(user?.appAccess.map((entry) => entry.app.slug) ?? [])
    const hasAllAppAccess = requiredSlugs.every((slug) => currentSlugs.has(slug))

    if (!user || !hasAdminRole || !hasAllAppAccess) {
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
      departments: Array.isArray(assignment.departments)
        ? (assignment.departments as string[])
        : [],
    }
    return acc
  }, {} as AppEntitlementMap)

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
    roles: user.roles.map((role) => role.role.name),
    entitlements,
  }
}
