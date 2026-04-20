function parseEmailSet(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(/[,\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
}

const DEFAULT_SUPER_ADMIN_EMAILS = new Set(['jarrar@targonglobal.com'])

function superAdminEmailSet(): Set<string> {
  const configured = parseEmailSet(process.env.TALOS_SUPER_ADMIN_EMAILS)
  return new Set([...DEFAULT_SUPER_ADMIN_EMAILS, ...configured])
}

export function isSuperAdmin(email: string): boolean {
  return superAdminEmailSet().has(email.trim().toLowerCase())
}

export const isSuperAdminEmail = isSuperAdmin
