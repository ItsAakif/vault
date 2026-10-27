import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * A flat bordered surface: one elevation level for static surfaces, no shadow
 * (ADR-011 D2). Replaces the hand-built "Quick Stats" card on `/` and the stats
 * card on `/calendar`.
 */
export function StatsCard({
  title,
  rows,
  className,
}: {
  title: string
  rows: Array<{ label: string; value: ReactNode }>
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border border-line bg-surface p-4', className)}>
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      <dl className="mt-3 grid gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-ink-muted">{row.label}</dt>
            <dd className="text-sm text-ink tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
