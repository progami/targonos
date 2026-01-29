export function deriveSupplierCountry(address: string | null | undefined): string | null {
  if (typeof address !== 'string') return null

  const normalized = address.replace(/\r\n/g, '\n').trim()
  if (!normalized) return null

  const lines = normalized
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return null

  const lastLine = lines.at(-1)
  if (!lastLine) return null

  const commaParts = lastLine
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)

  const candidate = commaParts.length > 0 ? commaParts.at(-1) : lastLine
  if (!candidate) return null

  return candidate.toUpperCase()
}
