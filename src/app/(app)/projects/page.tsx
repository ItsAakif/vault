'use client'

import { ProjectDashboard } from '@/components/projects'
import { Workspace } from '@/components/shell'

// ADR-010 D1/D2/D3: the shell owns the header, the primary navigation (rail) and the auth gate.
// This page owns only its own content: the projects dashboard.
//
// T086: the categories column (and the page's stats card) moved into the rail's Categories
// disclosure / Quick Stats, so this is a single-pane workspace now. It stays in `Workspace`'s
// default, non-`flush` mode on purpose: the root is still the one
// `h-[calc(100vh-var(--app-header-h))]` flex row and the content is `flex-1`, so dropping the
// aside cannot collapse the page - the content simply occupies the width the aside held.
export default function ProjectsPage() {
  return (
    <Workspace>
      <ProjectDashboard />
    </Workspace>
  )
}
