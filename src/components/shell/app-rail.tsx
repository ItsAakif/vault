'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  BookOpen,
  ChevronRight,
  FileText,
  Lightbulb,
  Palette,
  Plus,
  Star,
  type LucideIcon,
} from 'lucide-react'

import { CategoryList } from '@/components/categories/category-list'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useAppStore, useUIStore } from '@/store'
import { selectKnownCalendarEvents } from '@/store/app-store'
import { useStatsStore } from '@/store/stats-store'

import { NAV_SECTIONS, isActive, type NavCountKey, type NavItem, type NavSection } from './nav-items'
import { StatsCard } from './stats-card'

interface CustomContentType {
  id: string
  name: string
  key?: string
  icon?: string
  isActive?: boolean
  sortOrder?: number
}

const CUSTOM_ICONS: Record<string, LucideIcon> = {
  FileText,
  Lightbulb,
  BookOpen,
  Star,
  Palette,
  Plus,
}

function iconForContentType(iconName?: string): LucideIcon {
  return CUSTOM_ICONS[iconName ?? 'FileText'] ?? FileText
}

// The old item table hardcoded `0` for projects/jobs and printed it; a count is
// data, so it is only rendered when it is non-zero.
//
// T090: `calendarEvents` is `null` when the count is UNKNOWN (nothing ever published a
// full list), and `null` maps to 0 - which the caller does not render. So an unknown
// count and a genuine zero both produce no badge, instead of the unknown one being
// printed as a confident `0`. The array is only ever the one the card reads (see
// `selectKnownCalendarEvents`), so the two cannot disagree.
function countForKey(
  countKey: NavCountKey | undefined,
  contentItems: Array<{ type: string; archived: boolean; customTypeId?: string | null }>,
  calendarEvents: unknown[] | null
): number {
  switch (countKey) {
    case 'contentItems':
      return contentItems.length
    case 'ideas':
      return contentItems.filter((item) => item.type === 'IDEA').length
    case 'poetry':
      return contentItems.filter((item) => item.type === 'POETRY').length
    case 'notes':
      return contentItems.filter((item) => item.type === 'NOTE').length
    case 'resources':
      return contentItems.filter((item) => item.type === 'RESOURCE').length
    case 'archived':
      return contentItems.filter((item) => item.archived).length
    case 'calendar':
      return calendarEvents?.length ?? 0
    default:
      return 0
  }
}

function RailNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const contentItems = useAppStore((state) => state.contentItems)
  // T090: the SAME field the calendar page's stat card reads. `null` = unknown -> no badge.
  const calendarEvents = useAppStore(selectKnownCalendarEvents)
  const [customContentTypes, setCustomContentTypes] = useState<CustomContentType[]>([])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch('/api/content-types')
        if (!response.ok) return
        const data: unknown = await response.json()
        if (!cancelled && Array.isArray(data)) setCustomContentTypes(data as CustomContentType[])
      } catch {
        // The rail is navigation, not a data surface: a failed fetch renders
        // nothing extra rather than a notice.
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const customItems: NavItem[] = customContentTypes.map((customType) => ({
    id: `custom-${customType.id}`,
    label: customType.name,
    href: `/?type=CUSTOM&customTypeId=${encodeURIComponent(customType.id)}`,
    icon: iconForContentType(customType.icon),
  }))

  const customCounts: Record<string, number> = {}
  for (const customType of customContentTypes) {
    customCounts[`custom-${customType.id}`] = contentItems.filter(
      (item) => item.type === 'CUSTOM' && item.customTypeId === customType.id
    ).length
  }

  const sections: NavSection[] = customItems.length
    ? NAV_SECTIONS.map((section) =>
        section.id === 'content' ? { ...section, items: [...section.items, ...customItems] } : section
      )
    : NAV_SECTIONS

  return (
    <nav aria-label="Primary" className="space-y-4">
      {sections.map((section) => (
        <div key={section.id}>
          <p className="px-2 pb-1 text-xs font-medium text-ink-muted">{section.label}</p>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(item, pathname, search)
              const count = customCounts[item.id] ?? countForKey(item.countKey, contentItems, calendarEvents)

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-signal-subtle text-ink font-medium'
                      : 'text-ink-muted hover:bg-signal-subtle'
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {/* T090: a badge is a claim, so it is only rendered when the count is a real,
                      positive measurement. Unknown (null -> 0) and a genuine zero both render
                      nothing - what must never happen is a `0` badge for a count nobody loaded. */}
                  {count > 0 && <span className="text-xs text-ink-muted tabular-nums">{count}</span>}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

/**
 * T086: the categories column, as a disclosure in the rail.
 *
 * LAZY-FETCH MECHANISM, stated concretely: `open` starts `false` and `mounted` starts
 * `false`. `CategoryList` - which issues `GET /api/categories` from its own mount
 * effect - is not in the React tree until `mounted` flips, and `mounted` only flips in
 * the click handler, on the first open. So before the first open the rail has rendered
 * no request for categories on any of the eleven authenticated pages; after it, the
 * request is that component's normal one. It is never unmounted again: collapsing hides
 * the panel with the `hidden` attribute, so re-opening shows the same list and does not
 * refetch or lose the expanded rows.
 *
 * This reuses `CategoryList` on purpose: create, edit, delete, the dialogs, the
 * validation, the `isSystem` protection and the Drive notice are all owned there. There
 * is no second implementation in this file.
 */
function RailCategories() {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  const toggle = () => {
    if (!open) setMounted(true)
    setOpen((previous) => !previous)
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-signal-subtle"
      >
        <span>Categories</span>
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
      </button>
      <div id={panelId} hidden={!open} className="pt-1">
        {mounted ? <CategoryList compact /> : null}
      </div>
    </div>
  )
}

/**
 * T086: Quick Stats in the rail, fed by the dashboard through `useStatsStore`.
 *
 * `stats === null` means "no page has published counts here" (or the dashboard is
 * still loading / could not load them). That renders an em dash, NOT a zero: "0
 * pinned" asserts nothing is pinned, while the rail on a settings page knows nothing
 * about the dashboard's content at all. Never render a number this page has not seen.
 */
function RailStats() {
  const stats = useStatsStore((state) => state.stats)
  const unknown = <span className="text-ink-muted">—</span>

  const rows = stats
    ? [
        { label: 'Total Items', value: stats.total },
        { label: 'Pinned', value: stats.pinned },
        { label: 'Archived', value: stats.archived },
      ]
    : [
        { label: 'Total Items', value: unknown },
        { label: 'Pinned', value: unknown },
        { label: 'Archived', value: unknown },
      ]

  return (
    <div className="space-y-1">
      <StatsCard title="Quick Stats" rows={rows} />
      {!stats && <p className="px-1 pt-1 text-xs text-ink-muted">Counts appear on the dashboard.</p>}
    </div>
  )
}

// One body for the desktop panel and the mobile sheet, so the two cannot drift.
function RailBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-4">
      <RailNav onNavigate={onNavigate} />
      <RailCategories />
      <RailStats />
    </div>
  )
}

export function AppRail() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen)
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen)

  // Desktop is a resizable panel, mobile is a Sheet from the header's menu
  // button. The switch is still CSS visibility rather than a `window.innerWidth`
  // effect: no hydration mismatch and no layout thrash (ADR-010 D2). Since T084
  // the enclosing `ResizablePanel` owns the width and the `lg`-only visibility,
  // so this element sets neither - and no right border, because the panel's
  // resize handle draws the divider now. `overflow-y-auto` stays here because
  // the panel sets `overflow: hidden` inline.
  return (
    <>
      <div className="h-full overflow-y-auto bg-surface-sunken p-3">
        <RailBody />
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="lg:hidden">
          <SheetHeader>
            <SheetTitle className="text-sm">Navigation</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto p-3">
            <RailBody onNavigate={() => setSidebarOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
