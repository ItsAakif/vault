'use client'

import Link from 'next/link'
import { Menu, Search, Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useUIStore } from '@/store'

import { UserMenu } from './user-menu'

// The header names the application and nothing else does (the four hand-rolled
// page headers are retired by T071). It deliberately carries no page-context
// label: every page's own <PageHeader> already owns the `text-xl font-semibold`
// page title (ADR-011 D3), so a second header copy was redundant - and on the
// dashboard it was actively wrong, because it kept saying "All content" while a
// `?type=` filter was applied.
//
// No Suspense boundary is needed either: that boundary existed only because the
// removed label called useSearchParams(), and this header no longer reads the
// URL. `AppRail` still reads search params and keeps its own boundary in
// app-shell.tsx, so the layout stays prerenderable.
//
// The right end of the row is the account control (`UserMenu`). It is the only
// place a session is ended, and it shows who the session belongs to, so the
// header stays a single row of icon-sized controls.
export function AppHeader() {
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen)

  return (
    <header className="sticky top-0 z-30 flex h-[var(--app-header-h)] shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Open navigation"
        title="Open navigation"
        onClick={() => setSidebarOpen(true)}
      >
        <Menu className="size-4" />
      </Button>

      <Link href="/" className="text-sm font-semibold text-ink">
        Vault Command Center
      </Link>

      {/* `shrink-0` is load-bearing at 360px: the three icon controls keep their
          36px boxes and the brand, which can wrap, absorbs the lost width. */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button asChild variant="ghost" size="icon">
          <Link href="/search" aria-label="Search" title="Search">
            <Search className="size-4" />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="icon">
          <Link href="/settings/cloud-storage" aria-label="Settings" title="Settings">
            <Settings className="size-4" />
          </Link>
        </Button>
        <UserMenu />
      </div>
    </header>
  )
}
