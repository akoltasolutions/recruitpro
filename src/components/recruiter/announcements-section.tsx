'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Megaphone, Clock, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { authFetch } from '@/stores/auth-store'
import { formatDistanceToNow } from 'date-fns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Announcement {
  id: string
  title: string
  content: string
  isActive: boolean
  createdAt: string
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return 'recently'
  }
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function AnnouncementsSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-48" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-2 p-3 rounded-lg bg-muted/50">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnnouncementsSection() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await authFetch('/api/announcements')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setAnnouncements(data.announcements ?? [])
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnnouncements()
  }, [fetchAnnouncements])

  // -----------------------------------------------------------------------
  // Render: Loading
  // -----------------------------------------------------------------------

  if (loading) {
    return <AnnouncementsSkeleton />
  }

  // -----------------------------------------------------------------------
  // Render: Error
  // -----------------------------------------------------------------------

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 flex flex-col items-center justify-center text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Failed to load announcements</p>
        </CardContent>
      </Card>
    )
  }

  // -----------------------------------------------------------------------
  // Render: Empty
  // -----------------------------------------------------------------------

  if (announcements.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-950">
              <Megaphone className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            Instructions & Announcements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-6 flex flex-col items-center justify-center text-center">
            <Megaphone className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No announcements yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Announcements from your admin will appear here.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // -----------------------------------------------------------------------
  // Render: List
  // -----------------------------------------------------------------------

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-950">
              <Megaphone className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            Instructions & Announcements
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {announcements.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {announcements.map((announcement, index) => (
            <div
              key={announcement.id}
              className={`p-4 rounded-lg border bg-background transition-colors hover:bg-muted/50 ${
                index === 0
                  ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20'
                  : 'border-border'
              }`}
            >
              {/* Title row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {index === 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300 shrink-0"
                    >
                      NEW
                    </Badge>
                  )}
                  <h4 className="font-medium text-sm leading-snug truncate">
                    {announcement.title}
                  </h4>
                </div>
              </div>

              {/* Content */}
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap line-clamp-3">
                {announcement.content}
              </p>

              {/* Timestamp */}
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Posted {relativeTime(announcement.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
