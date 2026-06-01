'use client'
import { useCallback, useEffect, useState } from 'react'

/**
 * Hash-based URL router that syncs page state with the browser URL.
 *
 * SSR-safe: the useState initializer returns `defaultPage` on the server
 * (where `window` is undefined) and reads the real hash on the first
 * client-side render via a synchronisation effect.
 *
 * Usage:
 *   const [page, navigate] = useHashRouter<MyPage>('dashboard')
 *
 * - On mount: reads `#/page-name` from the URL hash and returns matching page (or defaultPage)
 * - `navigate(page)`: updates hash AND state via pushState (no scroll-to-top)
 * - Back / forward buttons update state via hashchange / popstate
 * - Refresh preserves the current page via hash
 * - On mount, sets default hash silently with replaceState (no extra history entry)
 */
export function useHashRouter<PageType extends string>(
  defaultPage: PageType,
): [PageType, (page: PageType) => void] {
  // SSR-safe initializer: `window` is undefined during static generation
  // so we always start with `defaultPage` on the server.  On the very
  // first client render the effect below will synchronise with the URL.
  const [page, setPage] = useState<PageType>(defaultPage)
  const [mounted, setMounted] = useState(false)

  // On first client render, read the actual hash and sync state.
  useEffect(() => {
    const hash = window.location.hash.replace(/^#\/?/, '')
    const initial = (hash || defaultPage) as PageType
    setPage(initial)

    // If no hash, set default silently (replaceState avoids extra history entry)
    if (!window.location.hash) {
      window.history.replaceState(null, '', `#/${defaultPage}`)
    }

    setMounted(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = useCallback((newPage: PageType) => {
    // pushState changes the URL without scrolling and adds a history entry.
    // We also manually update state so the UI reacts immediately.
    window.history.pushState(null, '', `#/${newPage}`)
    setPage(newPage)
  }, [])

  useEffect(() => {
    // Only attach listeners after the initial sync to avoid double-setState.
    if (!mounted) return

    const syncFromHash = () => {
      const hash = window.location.hash.replace(/^#\/?/, '')
      setPage((hash || defaultPage) as PageType)
    }

    // Listen for both hashchange (e.g. direct hash edits) and popstate
    // (browser back / forward after pushState).
    window.addEventListener('hashchange', syncFromHash)
    window.addEventListener('popstate', syncFromHash)

    return () => {
      window.removeEventListener('hashchange', syncFromHash)
      window.removeEventListener('popstate', syncFromHash)
    }
  }, [defaultPage, mounted])

  return [page, navigate]
}
