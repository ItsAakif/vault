'use client'

import { SearchPage } from '@/components/search'
import { PageHeader } from '@/components/shell'

export default function SearchPageRoute() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        className="p-0"
        title="Search"
        description="Find notes, projects, jobs and events."
      />
      <SearchPage />
    </div>
  )
}
