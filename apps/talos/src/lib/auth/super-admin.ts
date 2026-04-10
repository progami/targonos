const SUPER_ADMIN_EMAILS = ['jarrar@targonglobal.com']

export function isSuperAdminEmail(email: string): boolean {
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase())
}
