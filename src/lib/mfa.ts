import { createHmac, randomBytes } from 'crypto'

/**
 * Generate a TOTP secret for authenticator apps.
 * Returns a base32-encoded secret.
 */
export function generateTOTPSecret(): string {
  const buffer = randomBytes(20) // 160 bits = standard TOTP secret size
  return base32Encode(buffer)
}

/**
 * Verify a TOTP code against the secret.
 * Allows a 30-second window before and after for clock drift.
 */
export function verifyTOTP(secret: string, code: string, period: number = 30): boolean {
  const now = Math.floor(Date.now() / 1000)
  
  // Check current time step and ±1 for clock drift
  for (const offset of [-1, 0, 1]) {
    const timeStep = Math.floor((now + offset * period) / period)
    const expectedCode = generateTOTPCode(secret, timeStep, period)
    if (expectedCode === code) return true
  }
  return false
}

/**
 * Generate a 6-digit TOTP code for a given time step.
 */
export function generateTOTPCode(secret: string, timeStep: number, period: number = 30): string {
  const key = base32Decode(secret)
  const time = Buffer.alloc(8)
  // Write time step as big-endian 64-bit integer
  time.writeBigInt64BE(BigInt(timeStep))
  
  const hmac = createHmac('sha1', key)
  hmac.update(time)
  const hash = hmac.digest()
  
  const offset = hash[hash.length - 1] & 0x0f
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)
  
  const otp = binary % 1000000
  return otp.toString().padStart(6, '0')
}

/**
 * Generate backup codes for MFA recovery.
 * Returns 10 random 8-character codes.
 */
export function generateBackupCodes(count: number = 10): string[] {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // No confusing chars (0/O, 1/I/L)
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8)
    let code = ''
    for (let j = 0; j < 8; j++) {
      code += chars[bytes[j] % chars.length]
    }
    codes.push(code)
  }
  return codes
}

/**
 * Generate an otpauth:// URI for QR code generation.
 */
export function getTOTPUri(email: string, secret: string, issuer: string = 'RecruitPro'): string {
  const encodedIssuer = encodeURIComponent(issuer)
  const encodedEmail = encodeURIComponent(email)
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`
}

// ── Helpers ──

function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let result = ''
  let bits = 0
  let value = 0

  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 0x1f]
      bits -= 5
    }
  }
  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 0x1f]
  }
  return result
}

function base32Decode(str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const lookup = new Map(alphabet.split('').map((c, i) => [c, i]))
  let bits = 0
  let value = 0
  const bytes: number[] = []

  for (const char of str.toUpperCase()) {
    const idx = lookup.get(char)
    if (idx === undefined) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}
