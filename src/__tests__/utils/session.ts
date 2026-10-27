import { encode } from 'next-auth/jwt'

// Test-only counterpart of scripts/mint-session.js (ADR-007 D7). Keep the token shape in
// sync with that script and with src/lib/auth.ts's session callback.
//
// Honest limits: a token minted here proves the route-level auth boundary and session decode.
// It does NOT prove that Google's OAuth round trip works, that the adapter persisted an
// `Account` row, or that the live callback wrote the CloudIntegration row.
export async function mintSessionToken(
  payload: { id: string; email: string; name?: string },
  secret: string
): Promise<string> {
  return encode({
    token: { sub: payload.id, id: payload.id, name: payload.name, email: payload.email },
    secret,
    maxAge: 30 * 24 * 60 * 60,
  })
}

export function sessionCookieName(secure = false): string {
  return `${secure ? '__Secure-' : ''}next-auth.session-token`
}
