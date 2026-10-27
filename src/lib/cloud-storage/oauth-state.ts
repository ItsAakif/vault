// Signed, stateless OAuth `state` nonce for the Google Drive connect flow (ADR-006 D4b).
// The nonce is HMAC-SHA256 signed over NEXTAUTH_SECRET and bound to a user id; it is never
// persisted (no schema change, no new dependency). Server-only: must never be imported from a
// 'use client' module.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// Ten minutes, matching the OAuth consent round-trip this nonce guards.
export const STATE_TTL_MS = 10 * 60 * 1000

// Small allowance for clock skew between the host that signed the nonce and the one verifying it.
const CLOCK_SKEW_MS = 60 * 1000

function sign(encoded: string, key: string): string {
  return createHmac('sha256', key).update(encoded).digest('base64url')
}

/**
 * Build a signed, session-bound `state` nonce. The returned value is opaque to the client and is
 * only meaningful back on this server. Throws when NEXTAUTH_SECRET is unset (fail closed).
 */
export function createOAuthState(userId: string, now: number = Date.now()): string {
  const key = process.env.NEXTAUTH_SECRET
  if (!key) {
    throw new Error('NEXTAUTH_SECRET is not set; cannot sign OAuth state')
  }

  const payload = `${userId}|${randomBytes(16).toString('hex')}|${now}`
  const encoded = Buffer.from(payload, 'utf8').toString('base64url')
  return `${encoded}.${sign(encoded, key)}`
}

/**
 * Verify a `state` nonce produced by {@link createOAuthState}. Returns the bound user id when the
 * signature, structure and TTL all check out, and null for ANY failure (including a missing
 * NEXTAUTH_SECRET, so verification fails closed).
 */
export function verifyOAuthState(state: string, now: number = Date.now()): { userId: string } | null {
  const key = process.env.NEXTAUTH_SECRET
  if (!key) return null

  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [encoded, signature] = parts

  const expected = sign(encoded, key)
  const givenBuffer = Buffer.from(signature, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  // timingSafeEqual throws on length mismatch, so compare lengths first.
  if (givenBuffer.length !== expectedBuffer.length) return null
  if (!timingSafeEqual(givenBuffer, expectedBuffer)) return null

  const fields = Buffer.from(encoded, 'base64url').toString('utf8').split('|')
  if (fields.length !== 3) return null
  const [userId, , timestampRaw] = fields
  if (!/^\d+$/.test(timestampRaw)) return null

  const timestamp = Number(timestampRaw)
  if (now - timestamp > STATE_TTL_MS) return null
  if (timestamp > now + CLOCK_SKEW_MS) return null

  return { userId }
}
