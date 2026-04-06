import crypto from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function parseTotpSecret(totpValue) {
  const raw = String(totpValue || '').trim()
  if (raw === '') {
    throw new Error('Missing TOTP secret')
  }

  if (raw.startsWith('otpauth://')) {
    const url = new URL(raw)
    const secret = url.searchParams.get('secret')
    if (!secret) {
      throw new Error('Missing secret in TOTP URI')
    }
    return normalizeBase32Secret(secret)
  }

  return normalizeBase32Secret(raw)
}

function normalizeBase32Secret(secret) {
  const normalized = String(secret || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/=+$/g, '')

  if (!/^[A-Z2-7]+$/.test(normalized)) {
    throw new Error('Invalid base32 TOTP secret')
  }

  return normalized
}

export function decodeBase32(secret) {
  let bits = ''

  for (const char of secret) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) {
      throw new Error(`Unsupported base32 character: ${char}`)
    }
    bits += index.toString(2).padStart(5, '0')
  }

  const bytes = []
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2))
  }
  return Buffer.from(bytes)
}

export function generateTotpCode(totpValue, options = {}) {
  const secret = parseTotpSecret(totpValue)
  const timestampMs = options.timestampMs ?? Date.now()
  const stepSeconds = options.stepSeconds ?? 30
  const digits = options.digits ?? 6
  const counter = Math.floor(timestampMs / 1000 / stepSeconds)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))

  const hmac = crypto.createHmac('sha1', decodeBase32(secret))
  hmac.update(counterBuffer)
  const digest = hmac.digest()
  const offset = digest[digest.length - 1] & 0x0f
  const truncated =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  const modulo = 10 ** digits
  return String(truncated % modulo).padStart(digits, '0')
}

function main() {
  const command = process.argv[2]

  if (command === 'generate') {
    const totpValue = process.argv[3]
    process.stdout.write(generateTotpCode(totpValue))
    return
  }

  throw new Error(`Unsupported command: ${command}`)
}

if (import.meta.main) {
  main()
}
