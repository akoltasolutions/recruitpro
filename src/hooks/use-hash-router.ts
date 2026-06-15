'use client'
import { useCallback, useEffect, useSyncExternalStore } from 'react'

/**
 * Hash-based URL router that syncs page state with the browser URL.
 *
 * Uses useSyncExternalStore for SSR safety and reactive hash tracking.
 * No setState-in-effect — avoids React 19 lint warnings.
 *
 * Usage:
 *   const [page, navigate] = useHashRouter<MyPage>('dashboard')
 *
 * - On mount: reads `#/page-name` from the URL hash (or defaultPage)
 * - `navigate(page)`: updates hash via pushState, dispatches hashchange
 * - Back / forward buttons update state via popstate/hashchange
 * - Refresh preserves the current page via hash
 * - On mount, sets default hash silently with replaceState (no extra history entry)
 */

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback)
  window.addEventListener('popstate', callback)
  return () => {
    window.removeEventListener('hashchange', callback)
    window.removeEventListener('popstate', callback)
  }
}

function getSnapshot(): string {
  return window.location.hash.replace(/^#\/?/, '')
}

function getServerSnapshot(): string {
  return ''
}

export function useHashRouter<PageType extends string>(
  defaultPage: PageType,
): [PageType, (page: PageType) => void] {
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const page = ((hash || defaultPage) as PageType)

  const navigate = useCallback((newPage: PageType) => {
    window.history.pushState(null, '', `#/${newPage}`)
    // pushState does NOT fire hashchange — dispatch manually so
    // useSyncExternalStore picks up the new hash and re-renders.
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }, [])

  // On first mount, if the URL has no hash, set the default hash
  // silently via replaceState (no extra history entry).
  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', `#/${defaultPage}`)
    }
  }, [defaultPage])

  return [page, navigate]
}
