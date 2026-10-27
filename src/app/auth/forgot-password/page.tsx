import { redirect } from 'next/navigation'

// Password sign-up / recovery / verification no longer exists (ADR-007 D1).
// Old bookmarks and stale email links land on the only remaining sign-in method.
export default function Page() {
  redirect('/auth/signin')
}
