'use client'

import Link from 'next/link'
import { CloudOff } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { DRIVE_CONNECT_URL } from '@/lib/drive-client'
import { cn } from '@/lib/utils'
import { DriveConnectButton } from './drive-connect-button'

/**
 * ADR-008 D5: the "Drive is not connected" surface. Every Drive-dependent page renders this in
 * place of an empty shell (or a silently failed save) so the user gets the remedy before losing
 * work. It renders the CTA (`DriveConnectButton`) plus a secondary link to the same settings page.
 *
 * TWO DENSITIES, ONE COMPONENT (T088). The default form below is a card built for a page-width
 * container and is unchanged for every existing caller (search, projects, jobs, tags, content,
 * dashboard, calendar view, category list) - its rendered HTML is byte-identical to the version
 * before this task (see `.planning/progress/T088.md`). `compact` is the opt-in form for a NARROW
 * container, the 224px navigation rail: at the rail's 200px content width the default card is
 * 334px tall (16px padding, a 32px icon, a centred `py-8` stack and a full-size button), the
 * compact form is 126px and has no button. Compact is additive: it owns its root element, keeps
 * every word of the copy, and replaces the button with an inline text link.
 */
export function DriveRequiredNotice({
  message,
  title,
  className,
  /**
   * T088: render the narrow-container form. Opt-in and default `false`, so every existing caller's
   * markup is untouched. Mirrors `CategoryList`'s `compact` prop (T086): same name, same meaning
   * (presentation only), so there is exactly one way to say "this container is narrow".
   */
  compact = false,
}: {
  message?: string
  title?: string
  className?: string
  compact?: boolean
}) {
  const heading = title ?? 'Google Drive is not connected'
  const body = message ?? 'Connect Google Drive from Settings > Cloud Storage to use this feature.'

  if (compact) {
    // NARROW FORM (T088). Deliberately NOT a <Card>: the card's 32px icon, centred stack and
    // full-size button are what made the notice 334px tall in a 200px column. Here:
    //   - `p-2` (8px) instead of the card's `p-4` (16px);
    //   - `text-xs` throughout, `leading-snug` for the paragraph;
    //   - the icon is 14px and inline with the title, so it does not take a column;
    //   - no <DriveConnectButton>: an inline link to the same target instead, which cannot
    //     overflow a narrow box;
    //   - `break-words` on both text nodes so a long token wraps instead of pushing the box wide.
    return (
      <div
        data-variant="compact"
        className={cn(
          'rounded-md border border-line bg-surface-sunken p-2 text-xs',
          className
        )}
      >
        <div className="flex items-start gap-1.5">
          <CloudOff aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" />
          <p className="min-w-0 font-medium break-words text-ink">{heading}</p>
        </div>
        <p className="mt-1 break-words text-ink-muted leading-snug">{body}</p>
        <Link
          href={DRIVE_CONNECT_URL}
          className="mt-1.5 inline-block font-medium break-words text-ink underline underline-offset-2 hover:text-signal"
        >
          Connect Google Drive
        </Link>
      </div>
    )
  }

  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
        <CloudOff className="text-muted-foreground h-8 w-8" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{title ?? 'Google Drive is not connected'}</p>
          <p className="text-muted-foreground text-sm">
            {message ?? 'Connect Google Drive from Settings > Cloud Storage to use this feature.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <DriveConnectButton />
          <Link
            href={DRIVE_CONNECT_URL}
            className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
          >
            Cloud Storage settings
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
