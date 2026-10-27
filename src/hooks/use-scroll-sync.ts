import { useCallback, useRef, useState } from 'react'

interface ScrollSyncOptions {
  enabled?: boolean
  debounceMs?: number
}

export function useScrollSync(options?: ScrollSyncOptions) {
  const { enabled = true, debounceMs = 16 } = options || {}
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const lastScrollTime = useRef<number>(0)

  // Create scroll handler for source element
  const createScrollHandler = useCallback((
    onScroll: (scrollTop: number, scrollHeight: number, scrollPercentage: number) => void
  ) => {
    return (event: React.UIEvent<HTMLElement>) => {
      if (!enabled || isScrolling) return

      const target = event.target as HTMLElement
      const scrollTop = target.scrollTop
      const scrollHeight = target.scrollHeight - target.clientHeight
      const scrollPercentage = scrollHeight > 0 ? scrollTop / scrollHeight : 0

      // Debounce scroll events
      const now = Date.now()
      if (now - lastScrollTime.current < debounceMs) return
      lastScrollTime.current = now

      onScroll(scrollTop, scrollHeight, scrollPercentage)
    }
  }, [enabled, isScrolling, debounceMs])

  // Sync scroll position to target element
  const syncScrollTo = useCallback((
    element: HTMLElement | null,
    scrollTop: number,
    scrollPercentage?: number
  ) => {
    if (!element || !enabled) return

    setIsScrolling(true)

    // Clear any existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }

    // Use percentage if provided, otherwise use absolute position
    if (scrollPercentage !== undefined) {
      const maxScroll = element.scrollHeight - element.clientHeight
      element.scrollTop = maxScroll * scrollPercentage
    } else {
      element.scrollTop = scrollTop
    }

    // Reset scrolling flag after a delay
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false)
    }, 100)
  }, [enabled])

  // Calculate scroll percentage
  const getScrollPercentage = useCallback((element: HTMLElement) => {
    const scrollTop = element.scrollTop
    const scrollHeight = element.scrollHeight - element.clientHeight
    return scrollHeight > 0 ? scrollTop / scrollHeight : 0
  }, [])

  // Get scroll position
  const getScrollPosition = useCallback((element: HTMLElement) => {
    return {
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight - element.clientHeight,
      scrollPercentage: getScrollPercentage(element)
    }
  }, [getScrollPercentage])

  return {
    createScrollHandler,
    syncScrollTo,
    getScrollPercentage,
    getScrollPosition,
    isScrolling
  }
}