import { create } from 'zustand'

/**
 * T086: the dashboard's Quick Stats, published for the navigation rail.
 *
 * The figures are computed from the dashboard's `contentItems`, which no other page
 * fetches. The rail renders on all eleven authenticated pages, so it cannot compute
 * them itself - and it must not print a zero it has not measured ("0 pinned" claims
 * nothing is pinned; "don't know" is a different statement).
 *
 * `null` therefore means "this route has not published trustworthy counts". It is
 * published while the dashboard's list is loading, after a failed fetch, and in the
 * unmount cleanup so the figures do not outlive the page that produced them.
 *
 * Deliberately a separate store rather than a field on `useAppStore`: `useAppStore`
 * is persisted to localStorage, and stale counts surviving a reload would be exactly
 * the false-zero/false-number class of lie this exists to avoid. Nothing here is
 * persisted.
 */
export interface QuickStats {
  total: number
  pinned: number
  archived: number
}

interface StatsState {
  stats: QuickStats | null
  setStats: (stats: QuickStats | null) => void
}

export const useStatsStore = create<StatsState>()((set) => ({
  stats: null,
  setStats: (stats) => set({ stats }),
}))
