'use client'

import { Suspense } from 'react'
import type { ReactNode } from 'react'

import { InstallPrompt } from '@/components/pwa/install-prompt'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'

import { AppHeader } from './app-header'
import { AppRail } from './app-rail'

// react-resizable-panels writes `react-resizable-panels:${autoSaveId}` into
// localStorage, so this literal is what makes the rail remember its width across
// reloads - and renaming it forgets every saved width. It does not change.
const SHELL_AUTOSAVE_ID = 'vault-app-shell'

// Volume of the rail, as a percentage of the viewport, chosen from the width its
// content actually needs rather than by taste:
//
// - The rail was `w-56` (224px) and its longest label is "Manage content types",
//   which needs ~64px of chrome (p-3 + px-2 + a 16px icon + an 8px gap) plus
//   ~150px of text and a count.
// - `defaultSize` 16 is 224px at 1400px and 205-246px across 1280-1536, i.e.
//   within ~10% of the width the rail has today; nothing wraps differently.
// - `minSize` 12 is 123px at the 1024px `lg` threshold, which still fits the
//   icon, the gap and ~59px of truncating label - narrow, but usable, and the
//   point at which a nav rail stops being readable.
// - `maxSize` 28 keeps the rail below a third of the window, so it can never
//   turn into a second content column.
//
// v3 only supports percentage constraints, so these scale with the viewport;
// that is the library's model, not a rounding choice.
const RAIL_DEFAULT_SIZE = 16
const RAIL_MIN_SIZE = 12
const RAIL_MAX_SIZE = 28
// Stated rather than inferred: without a `defaultSize` the server renders the
// main panel at its 1-unit fallback and the group visibly reflows on hydration
// (the library warns about exactly this).
const CONTENT_DEFAULT_SIZE = 100 - RAIL_DEFAULT_SIZE

// Not a bare centred spinner: a skeleton of the shell it is standing in for, so
// the loading state has the same shape as the loaded one (ADR-011 D3).
function ShellSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background" role="status" aria-label="Loading">
      <div className="flex h-[var(--app-header-h)] shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-56 shrink-0 space-y-2 border-r border-line bg-surface-sunken p-3 lg:block">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
        <div className="min-w-0 flex-1 space-y-4 p-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  // The auth gate and the `/auth/signin` redirect live here once instead of
  // eleven times (ADR-010 D1). An unauthenticated visitor sees the skeleton, not
  // a flash of content before the redirect.
  const { loading, isAuthenticated } = useAuth()

  if (loading || !isAuthenticated) {
    return <ShellSkeleton />
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />

      {/* One structure for both breakpoints, and the width survives a reload
          (T084). Below `lg` the rail panel is `display: none`, which takes it out
          of the flex layout rather than leaving it claiming a percentage, so the
          main panel fills the window; the handle is hidden with it, so a phone
          shows no divider and no rail. The rail stays MOUNTED, so crossing the
          breakpoint does not remount `children` or refetch the rail's content
          types. `AppRail` still renders the mobile `Sheet`, which is portalled
          and therefore unaffected by the hidden ancestor. */}
      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId={SHELL_AUTOSAVE_ID}
        className="min-h-0 flex-1"
      >
        <ResizablePanel
          id="shell-rail"
          defaultSize={RAIL_DEFAULT_SIZE}
          minSize={RAIL_MIN_SIZE}
          maxSize={RAIL_MAX_SIZE}
          className="hidden lg:block"
        >
          {/* AppRail reads useSearchParams() inside a sub-tree a layout renders, so
              it needs a Suspense boundary; the alternative is converting the group
              layout to force-dynamic. */}
          <Suspense fallback={null}>
            <AppRail />
          </Suspense>
        </ResizablePanel>

        <ResizableHandle withHandle className="hidden lg:flex" />

        <ResizablePanel id="shell-content" defaultSize={CONTENT_DEFAULT_SIZE}>
          {/* The panel clips its children (`overflow: hidden` is set inline by the
              library), so the page scroll context has to live here. Pages that use
              <Workspace> already size themselves to this box, so they scroll in
              their own frame instead of producing a second scrollbar. */}
          <div className="h-full min-w-0 overflow-y-auto">{children}</div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <InstallPrompt />
    </div>
  )
}
