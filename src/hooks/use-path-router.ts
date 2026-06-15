'use client'
import { useCallback, useEffect, useSyncExternalStore } from 'react'

/**
 * Path-based URL router that syncs page state with clean browser URLs.
 *
 * Replaces the old hash-based useHashRouter. Uses window.location.pathname
 * and history.pushState for clean URLs without "#".
 *
 * Usage:
 *   const [page, navigate] = usePathRouter<MyPage>('dashboard')
 *
 * - On mount: reads `/page-name` from the URL pathname (or defaultPage)
 * - `navigate(page)`: updates URL via pushState, dispatches popstate
 * - Back / forward buttons update state via popstate
 * - Refresh preserves the current page via pathname
 * - On mount, if no path is set, sets default path silently with replaceState
 */

/** API routes that should never be treated as page routes */
const API_PREFIX = '/api'
const INTERNAL_PREFIXES = ['/_next', '/favicon', '/sitemap', '/robots']

function isPageRoute(pathname: string): boolean {
  if (!pathname || pathname === '/') return true
  if (pathname.startsWith(API_PREFIX)) return false
  if (INTERNAL_PREFIXES.some(p => pathname.startsWith(p))) return false
  // Ignore file extensions
  if (pathname.match(/\.\w+$/)) return false
  return true
}

function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback)
  return () => {
    window.removeEventListener('popstate', callback)
  }
}

function getSnapshot(): string {
  const pathname = window.location.pathname
  // Strip leading slash
  return pathname.replace(/^\/+/, '').replace(/\/+$/, '')
}

function getServerSnapshot(): string {
  return ''
}

/**
 * Extract the page slug from a URL pathname.
 * Strips leading/trailing slashes.
 * Returns empty string for root "/".
 */
export function getPageFromPathname(pathname: string): string {
  return pathname.replace(/^\/+/, '').replace(/\/+$/, '')
}

export function usePathRouter<PageType extends string>(
  defaultPage: PageType,
): [PageType, (page: PageType) => void] {
  const rawPath = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  // Only use the first segment of the path (ignore nested paths like /dashboard/details)
  const firstSegment = rawPath.split('/')[0] || ''
  const page = ((firstSegment || defaultPage) as PageType)

  const navigate = useCallback((newPage: PageType) => {
    const newPath = `/${newPage}`
    window.history.pushState(null, '', newPath)
    // pushState does NOT fire popstate — dispatch manually so
    // useSyncExternalStore picks up the new path and re-renders.
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [])

  // On first mount, if the URL has no page path (root "/"), set the default
  // silently via replaceState (no extra history entry).
  useEffect(() => {
    const currentPath = window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, '')
    if (!currentPath || currentPath === '') {
      window.history.replaceState(null, '', `/${defaultPage}`)
    }
  }, [defaultPage])

  return [page, navigate]
}
