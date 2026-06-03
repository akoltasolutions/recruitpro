'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PaginationState {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  totalCount: number
  page: number
  totalPages: number
  // Allow extra metadata
  [key: string]: unknown
}

export interface UsePaginationOptions<T> {
  /** Initial page size (default: 50) */
  initialPageSize?: number
  /** Available page sizes for the selector */
  pageSizeOptions?: number[]
  /** Fetch function that returns paginated data */
  fetchFn: (page: number, pageSize: number) => Promise<PaginatedResponse<T>>
  /** Dependencies that trigger a reset when changed */
  deps?: unknown[]
  /** Whether to auto-fetch on mount (default: true) */
  autoFetch?: boolean
}

export interface UsePaginationReturn<T> {
  // Data
  items: T[]
  pagination: PaginationState

  // Actions
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  loadMore: () => void
  reset: () => void
  refresh: () => void

  // Ref for infinite scroll observer
  sentinelRef: React.RefObject<HTMLDivElement | null>
  scrollContainerRef: React.RefObject<HTMLElement | null>

  // Loading states
  isLoading: boolean
  isLoadingMore: boolean
  isEnd: boolean
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function usePagination<T>(options: UsePaginationOptions<T>): UsePaginationReturn<T> {
  const {
    initialPageSize = 50,
    pageSizeOptions = [50, 100],
    fetchFn,
    deps = [],
    autoFetch = true,
  } = options

  const [items, setItems] = useState<T[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeState] = useState(initialPageSize)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const hasMore = page < totalPages
  const isLoading = loading
  const isLoadingMore = loadingMore
  const isEnd = totalCount > 0 && !hasMore && items.length >= totalCount

  // Reset page to 1 when deps change
  const reset = useCallback(() => {
    setPage(1)
    setItems([])
    setTotalCount(0)
    setTotalPages(0)
  }, [])

  // Fetch page
  const fetchPage = useCallback(async (targetPage: number, targetPageSize: number, isMore: boolean) => {
    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    if (isMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }

    try {
      const response = await fetchFn(targetPage, targetPageSize)

      if (controller.signal.aborted) return

      if (isMore) {
        setItems(prev => [...prev, ...response.data])
      } else {
        setItems(response.data)
      }
      setTotalCount(response.totalCount)
      setTotalPages(response.totalPages)
      setPage(targetPage)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Pagination fetch error:', err)
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [fetchFn])

  // Handle page size change - reset to page 1
  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size)
    setPage(1)
    setItems([])
  }, [])

  // Load more (append next page)
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return
    const nextPage = page + 1
    fetchPage(nextPage, pageSize, true)
  }, [loadingMore, hasMore, page, pageSize, fetchPage])

  // Refresh current data
  const refresh = useCallback(() => {
    fetchPage(page, pageSize, false)
  }, [page, pageSize, fetchPage])

  // Auto-fetch on mount and when deps change
  useEffect(() => {
    if (!autoFetch) return
    fetchPage(1, pageSize, false)
  }, [autoFetch, fetchPage, pageSize, ...deps])

  // When pageSize changes manually, re-fetch
  useEffect(() => {
    if (!autoFetch) return
    fetchPage(1, pageSize, false)
  }, [pageSize])

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    if (!hasMore || loadingMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore()
        }
      },
      {
        root: scrollContainerRef.current || undefined,
        rootMargin: '200px',
        threshold: 0,
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loadMore])

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const pagination = useMemo<PaginationState>(() => ({
    page,
    pageSize,
    totalCount,
    totalPages,
    loading,
    loadingMore,
    hasMore,
  }), [page, pageSize, totalCount, totalPages, loading, loadingMore, hasMore])

  return {
    items,
    pagination,
    setPage,
    setPageSize,
    loadMore,
    reset,
    refresh,
    sentinelRef,
    scrollContainerRef,
    isLoading,
    isLoadingMore,
    isEnd,
  }
}
