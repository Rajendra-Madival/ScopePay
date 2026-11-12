import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'

export type AuthUser = {
  id: string
  name: string
  email: string
}

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
export const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30

const BCRYPT_COST = 12

function bcryptInput(password: string) {
  // Hash first so bcrypt's 72-byte input limit never makes password suffixes irrelevant.
  return crypto.createHash('sha256').update(password, 'utf8').digest('base64url')
}

export const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  bcryptInput(crypto.randomBytes(32).toString('hex')),
  BCRYPT_COST,
)

export function hashPassword(password: string) {
  return bcrypt.hash(bcryptInput(password), BCRYPT_COST)
}

export async function verifyPassword(password: string, storedHash: string) {
  if (storedHash.startsWith('$2')) {
    return bcrypt.compare(bcryptInput(password), storedHash)
  }

  const [salt, hash] = storedHash.split(':', 2)
  if (!salt || !hash || !/^[a-f0-9]+$/i.test(hash) || hash.length % 2 !== 0) return false

  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.pbkdf2(password, salt, 120_000, hash.length / 2, 'sha512', (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
  const expected = Buffer.from(hash, 'hex')
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived)
}

export function needsPasswordRehash(storedHash: string) {
  return !storedHash.startsWith('$2')
}

export function createOpaqueToken() {
  return crypto.randomBytes(32).toString('base64url')
}

export function hashOpaqueToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function createCsrfTokenHash(token: string) {
  return hashOpaqueToken(token)
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}
