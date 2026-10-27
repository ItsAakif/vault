import SignInForm from './sign-in-form'

// Read the environment at request time, not build time: the owner may add
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET after `npm run build`.
export const dynamic = 'force-dynamic'

export default function SignInPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  )

  if (!googleEnabled) {
    // ADR-007 D5: warn, do NOT fail the build - `npm run build` must stay green with the
    // Google env vars unset (credential-free verification depends on it).
    console.warn(
      '[auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set: no sign-in method is available.'
    )
  }

  return <SignInForm googleEnabled={googleEnabled} />
}
