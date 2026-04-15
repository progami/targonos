import { upsertManualUserAppGrant } from '@targon/auth/server'

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

  const updatedUser = await upsertManualUserAppGrant({
    userId,
    appSlug: 'talos',
    appName: 'Talos',
    departments: ['Ops'],
    tenantMemberships: ['US', 'UK'],
    locked: false,
  })

  if (updatedUser.id !== userId) {
    throw new Error(`Hosted smoke user id mismatch: expected ${userId}, received ${updatedUser.id}.`)
  }

  if (updatedUser.email.toLowerCase() !== email) {
    throw new Error(`Hosted smoke user email mismatch: expected ${email}, received ${updatedUser.email}.`)
  }

  const talosGrant = updatedUser.entitlements.talos
  if (!talosGrant) {
    throw new Error('Hosted smoke user is missing Talos entitlements after grant update.')
  }

  if (!talosGrant.tenantMemberships.includes('US')) {
    throw new Error('Hosted smoke user is missing Talos US tenant membership after grant update.')
  }

  if (!talosGrant.tenantMemberships.includes('UK')) {
    throw new Error('Hosted smoke user is missing Talos UK tenant membership after grant update.')
  }

  console.log(`Ensured hosted smoke Talos grant for ${updatedUser.email}.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
