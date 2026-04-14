const SUPER_ADMIN_EMAILS = ['jarrar@targonglobal.com']

export function isSuperAdmin(email: string): boolean {
  return SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase())
}

export const isSuperAdminEmail = isSuperAdmin
