import type { LucideIcon } from 'lucide-react'
import {
  Archive as ArchiveIcon,
  BookOpen,
  Briefcase,
  Calendar,
  FileText,
  Lightbulb,
  Plus,
  Search,
  Star,
  Users,
} from 'lucide-react'

export type NavCountKey =
  | 'contentItems' | 'ideas' | 'poetry' | 'notes' | 'resources' | 'archived' | 'calendar'

export interface NavItem {
  id: string
  label: string          // sentence case, user-facing words
  href: string           // the address, including any query
  icon: LucideIcon
  countKey?: NavCountKey
}

export interface NavSection {
  id: string
  label: string          // sentence case
  items: NavItem[]
}

// The primary navigation is data, not a component, so the shell never needs
// per-page props (ADR-010 D2). Routes and order are carried over verbatim from
// the retired `sidebar-nav.tsx` item table. Custom content types are appended by
// the rail at runtime, after its `/api/content-types` fetch.
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'content',
    label: 'Content',
    items: [
      { id: 'all', label: 'All content', href: '/', icon: FileText, countKey: 'contentItems' },
      { id: 'ideas', label: 'Ideas', href: '/?type=IDEA', icon: Lightbulb, countKey: 'ideas' },
      { id: 'poetry', label: 'Poetry', href: '/?type=POETRY', icon: BookOpen, countKey: 'poetry' },
      { id: 'notes', label: 'Notes', href: '/?type=NOTE', icon: FileText, countKey: 'notes' },
      { id: 'resources', label: 'Resources', href: '/?type=RESOURCE', icon: Star, countKey: 'resources' },
    ],
  },
  {
    id: 'organization',
    label: 'Organization',
    items: [
      { id: 'projects', label: 'Projects', href: '/projects', icon: Briefcase },
      { id: 'jobs', label: 'Jobs', href: '/jobs', icon: Users },
      { id: 'calendar', label: 'Calendar', href: '/calendar', icon: Calendar, countKey: 'calendar' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { id: 'archive', label: 'Archive', href: '/?type=archived', icon: ArchiveIcon, countKey: 'archived' },
      { id: 'search', label: 'Search', href: '/search', icon: Search },
      { id: 'content-types', label: 'Manage content types', href: '/settings/content-types', icon: Plus },
    ],
  },
]

// The content-type carried by an href: 'all' for the bare `/`, otherwise the
// `type` query value. Returns null for an href that is not a content-type address.
function itemContentType(href: string): string | null {
  if (href === '/') return 'all'
  if (!href.startsWith('/?type=')) return null
  return new URLSearchParams(href.slice(2)).get('type') ?? 'all'
}

/**
 * The one active-state rule for the rail. The `?type=` search parameter is the
 * single source of truth for the content-type filter (ADR-010 D2), so `/` and
 * `/?type=all` are the same state and a refresh or a shared link keeps the rail
 * pointing at the right item.
 */
export function isActive(item: NavItem, pathname: string, search: URLSearchParams): boolean {
  const contentType = itemContentType(item.href)
  if (contentType !== null) {
    if (pathname !== '/') return false
    if ((search.get('type') ?? 'all') !== contentType) return false
    // A custom content type shares `?type=CUSTOM`; disambiguate by its id so
    // exactly one item can ever be current.
    const customTypeId = new URLSearchParams(item.href.slice(2)).get('customTypeId')
    if (customTypeId) return search.get('customTypeId') === customTypeId
    return true
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}
