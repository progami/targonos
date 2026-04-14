export function requireAuthEnv(name: string): string {
  const value = process.env[name]
  if (typeof value !== 'string') {
    throw new Error(`${name} must be defined for portal authentication.`)
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error(`${name} must be defined for portal authentication.`)
  }

  return trimmed
}
