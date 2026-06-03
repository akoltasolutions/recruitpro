'use client'

import { Loader2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────

interface PaginationControlsProps {
  /** Total number of records */
  totalCount: number
  /** Current number of items displayed */
  displayedCount: number
  /** Current page */
  currentPage: number
  /** Total pages */
  totalPages: number
  /** Items per page */
  pageSize: number
  /** Available page size options */
  pageSizeOptions?: number[]
  /** Callback when page size changes */
  onPageSizeChange: (size: number) => void
  /** Callback when "Load More" is clicked */
  onLoadMore: () => void
  /** Whether currently loading more */
  loadingMore?: boolean
  /** Whether currently on the first load */
  loading?: boolean
  /** Whether there are more records to load */
  hasMore: boolean
  /** Optional className for the container */
  className?: string
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PaginationControls({
  totalCount,
  displayedCount,
  currentPage,
  totalPages,
  pageSize,
  pageSizeOptions = [50, 100],
  onPageSizeChange,
  onLoadMore,
  loadingMore = false,
  loading = false,
  hasMore,
  className,
}: PaginationControlsProps) {
  // Don't render if no data or still on first load
  if (loading && displayedCount === 0) return null
  if (totalCount === 0 && displayedCount === 0) return null

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t',
        className
      )}
    >
      {/* Left side: Showing X of Y + Per Page selector */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
        <span className="whitespace-nowrap">
          Showing <span className="font-medium text-foreground">{displayedCount.toLocaleString()}</span> of{' '}
          <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span> results
        </span>

        <div className="flex items-center gap-2">
          <span className="text-xs whitespace-nowrap">Per page:</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-7 text-xs w-[72px] px-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!hasMore && displayedCount >= totalCount && (
          <span className="text-xs text-muted-foreground">— No more records</span>
        )}
      </div>

      {/* Right side: Load More button */}
      {hasMore && (
        <Button
          variant="outline"
          size="sm"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="gap-2 shrink-0"
        >
          {loadingMore ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading...
            </>
          ) : (
            'Load More'
          )}
        </Button>
      )}
    </div>
  )
}

// ─── Loading Indicator (for infinite scroll) ───────────────────────────────

interface InfiniteScrollLoaderProps {
  loadingMore: boolean
  isEnd: boolean
}

export function InfiniteScrollLoader({ loadingMore, isEnd }: InfiniteScrollLoaderProps) {
  if (loadingMore) {
    return (
      <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading more records...</span>
      </div>
    )
  }

  if (isEnd) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
        No more records available
      </div>
    )
  }

  return null
}
