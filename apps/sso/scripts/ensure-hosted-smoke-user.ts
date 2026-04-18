import { upsertManualUserAppGrant } from '@targon/auth/server'

import { hostedSmokeAppGrants } from '../tests/fixtures/hosted-smoke-config'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (typeof value !== 'string') {
    throw new Error(`${name} must be defined.`)
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error(`${name} must be defined.`)
  }

  return trimmed
}

async function main() {
  process.env.PORTAL_DB_URL = requireEnv('PORTAL_DB_URL')

  const userId = requireEnv('E2E_PORTAL_USER_ID')
  const email = requireEnv('E2E_PORTAL_EMAIL').toLowerCase()
  let updatedUser = null

  for (const grant of hostedSmokeAppGrants) {
    updatedUser = await upsertManualUserAppGrant({
      userId,
      appSlug: grant.appSlug,
      appName: grant.appName,
      departments: grant.departments,
      tenantMemberships: grant.tenantMemberships,
      locked: grant.locked,
    })
  }

  if (updatedUser === null) {
    throw new Error('Hosted smoke user grants were not applied.')
  }

  if (updatedUser.id !== userId) {
    throw new Error(`Hosted smoke user id mismatch: expected ${userId}, received ${updatedUser.id}.`)
  }

  if (updatedUser.email.toLowerCase() !== email) {
    throw new Error(`Hosted smoke user email mismatch: expected ${email}, received ${updatedUser.email}.`)
  }

  for (const grant of hostedSmokeAppGrants) {
    const appGrant = updatedUser.entitlements[grant.appSlug]
    if (!appGrant) {
      throw new Error(`Hosted smoke user is missing ${grant.appSlug} entitlements after grant update.`)
    }

    if (JSON.stringify(appGrant.departments) !== JSON.stringify(grant.departments)) {
      throw new Error(
        `Hosted smoke user departments mismatch for ${grant.appSlug}: expected ${JSON.stringify(grant.departments)}, received ${JSON.stringify(appGrant.departments)}.`,
      )
    }

    if (JSON.stringify(appGrant.tenantMemberships) !== JSON.stringify(grant.tenantMemberships)) {
      throw new Error(
        `Hosted smoke user tenant memberships mismatch for ${grant.appSlug}: expected ${JSON.stringify(grant.tenantMemberships)}, received ${JSON.stringify(appGrant.tenantMemberships)}.`,
      )
    }
  }

  console.log(`Ensured hosted smoke grants for ${updatedUser.email}.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
