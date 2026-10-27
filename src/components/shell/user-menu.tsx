'use client'

import { LogOut, UserRound } from 'lucide-react'
import { signOut } from 'next-auth/react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/use-auth'

// Where NextAuth sends the browser once the session is gone. `signOut` itself
// clears the session cookie (and POSTs to /api/auth/signout); the callback only
// decides the landing page, so nothing here hand-rolls a cookie or a redirect
// that would leave the cookie behind.
export const SIGN_OUT_CALLBACK_URL = '/auth/signin'

// Shown when the session carries no email. A neutral label, never a fabricated
// identity, and never nothing: the menu still says who it belongs to.
const NO_EMAIL_LABEL = 'Signed-in account'

// Initials are derived from the real session user, in order of preference:
// the display name, then the email's first character. `null` means the session
// gave us neither, and the trigger falls back to a generic person glyph.
function initialsFor(user: { name?: string | null; email?: string | null } | undefined) {
  const name = user?.name?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    const first = parts[0]?.charAt(0) ?? ''
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''
    const initials = `${first}${last}`.toUpperCase()
    if (initials) return initials
  }

  const email = user?.email?.trim()
  return email ? email.charAt(0).toUpperCase() : null
}

// The header's account control: an avatar trigger that opens a menu naming the
// signed-in email above a single "Sign out" item. It replaces nothing - it sits
// to the right of the search and settings icons - and it is the same 36px icon
// box as its neighbours, so the header row keeps its height at every width.
//
// Radix's DropdownMenu (the project's existing primitive) supplies the keyboard
// behaviour the header needs: Enter/Space/ArrowDown open it, arrows move, and
// Escape closes it without selecting anything.
export function UserMenu() {
  const { user } = useAuth()

  const email = user?.email?.trim() || null
  const initials = initialsFor(user)
  // The accessible name names the account when there is one, so screen-reader
  // users hear whose menu this is rather than a bare "menu".
  const accountLabel = email ? `Account menu for ${email}` : 'Account menu'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label={accountLabel}
          title={accountLabel}
        >
          <Avatar className="size-7">
            {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
            <AvatarFallback className="bg-surface-sunken text-[0.625rem] font-semibold text-ink-muted">
              {initials ?? <UserRound className="size-4" aria-hidden="true" />}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="text-[0.6875rem] uppercase tracking-wide text-ink-faint">
            Signed in as
          </span>
          <span className="truncate text-sm font-medium text-ink" title={email ?? undefined}>
            {email ?? NO_EMAIL_LABEL}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={() => {
            void signOut({ callbackUrl: SIGN_OUT_CALLBACK_URL })
          }}
        >
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
