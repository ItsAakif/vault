'use client'

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The page-level layout primitives, so panes and containers stop hand-rolling
 * headers and height arithmetic (ADR-010 D3). ONE height formula, ONE page-title
 * treatment (ADR-011 D3).
 */

export function Workspace({
  children,
  aside,
  flush = false,
  className,
}: {
  children: ReactNode
  aside?: ReactNode
  /**
   * Opt out of the padded, scrollable body. The children container then has no padding,
   * no scroll context and a DEFINITE height (`h-full` against the root's explicit
   * `h-[calc(100vh-var(--app-header-h))]`), so a pane layout inside it can size itself
   * with `h-full` instead of resolving a percentage against an auto-height parent.
   * Default `false`: every existing caller keeps the padded scroll frame unchanged.
   */
  flush?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex h-[calc(100vh-var(--app-header-h))] min-h-0', className)}>
      <div
        className={cn(
          'min-w-0 flex-1',
          flush ? 'h-full min-h-0 overflow-hidden' : 'overflow-auto p-6'
        )}
      >
        {children}
      </div>
      {aside ? (
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-line p-4 hidden lg:block">
          {aside}
        </aside>
      ) : null}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-6 pt-6', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
