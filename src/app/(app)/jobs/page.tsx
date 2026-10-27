'use client'

import { JobsDashboard } from '@/components/jobs'
import { Workspace } from '@/components/shell'

// ADR-010 D1/D2/D3: the shell owns the header, the primary navigation (rail) and the auth gate.
// This page owns only its own content: the jobs dashboard.
//
// T086: the categories column (and the page's stats card) moved into the rail's Categories
// disclosure / Quick Stats, so this is a single-pane workspace now. It stays in `Workspace`'s
// default, non-`flush` mode: the root is still `h-[calc(100vh-var(--app-header-h))]` and the
// content is `flex-1`, so removing the aside cannot collapse the page height.
export default function JobsPage() {
  return (
    <Workspace>
      <JobsDashboard />
    </Workspace>
  )
}
