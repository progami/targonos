export const WORKTREE_DEV_USER_ID = '11111111-1111-4111-8111-111111111111'
export const WORKTREE_DEV_USER_EMAIL = 'worktree.dev@targonglobal.com'
export const WORKTREE_DEV_USER_NAME = 'Worktree Dev'

export const WORKTREE_TALOS_USER_IDS = {
  US: '22222222-2222-4222-8222-222222222221',
  UK: '22222222-2222-4222-8222-222222222222',
}

export const WORKTREE_DEV_AUTHZ = {
  version: 1,
  globalRoles: ['platform_admin'],
  apps: {
    talos: {
      departments: ['Ops'],
      tenantMemberships: ['US', 'UK'],
    },
    atlas: {
      departments: ['People Ops'],
      tenantMemberships: [],
    },
    website: {
      departments: [],
      tenantMemberships: [],
    },
    kairos: {
      departments: ['Admin'],
      tenantMemberships: [],
    },
    xplan: {
      departments: ['Admin'],
      tenantMemberships: [],
    },
    hermes: {
      departments: ['Account / Listing'],
      tenantMemberships: [],
    },
    plutus: {
      departments: ['Finance'],
      tenantMemberships: [],
    },
    argus: {
      departments: ['Account / Listing'],
      tenantMemberships: [],
    },
  },
}

export function stringifyWorktreeDevAuthz() {
  return JSON.stringify(WORKTREE_DEV_AUTHZ)
}
