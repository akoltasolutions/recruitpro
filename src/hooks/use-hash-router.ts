'use client'
import { useCallback, useEffect, useState } from 'react'

/**
 * Hash-based URL router that syncs page state with the browser URL.
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
  // Read the initial hash only when running in the browser.
  // AppContent is rendered client-only (guarded by the `mounted` flag from
  // useSyncExternalStore), so window is always available here.
  const [page, setPage] = useState<PageType>(() => {
    const hash = window.location.hash.replace(/^#\/?/, '')
    return (hash || defaultPage) as PageType
  })

  const navigate = useCallback((newPage: PageType) => {
    // pushState changes the URL without scrolling and adds a history entry.
    // We also manually update state so the UI reacts immediately.
    window.history.pushState(null, '', `#/${newPage}`)
    setPage(newPage)
  }, [])

  useEffect(() => {
    // On first mount, if the URL has no hash, silently set the default
    // so the address bar reflects the current page without creating a
    // new history entry.
    if (!window.location.hash) {
      window.history.replaceState(null, '', `#/${defaultPage}`)
    }

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
  }, [defaultPage])

  return [page, navigate]
}
