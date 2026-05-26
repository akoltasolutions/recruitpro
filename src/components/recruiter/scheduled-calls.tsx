'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  CalendarClock,
  Phone,
  Clock,
  MapPin,
  Briefcase,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { format, isToday, isTomorrow, isThisWeek } from 'date-fns'

interface ScheduledCallsProps {
  userId: string
  onNavigate?: (page: string) => void
}

interface CallRecord {
  id: string
  callDuration: number
  callStatus: string
  calledAt: string
  scheduledAt: string | null
  notes: string | null
  candidate: {
    id: string
    name: string
    phone: string
    role: string | null
    location: string | null
  }
  disposition: {
    id: string
    heading: string
    type: string
  } | null
  client: {
    id: string
    name: string
  } | null
}

function getScheduledLabel(dateStr: string): string {
  const d = new Date(dateStr)
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  if (isThisWeek(d)) return format(d, 'EEEE')
  return format(d, 'MMM d, yyyy')
}

function getScheduledTimeColor(dateStr: string): string {
  const d = new Date(dateStr)
  if (isToday(d)) return 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/50 dark:border-emerald-800'
  return 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/50 dark:border-blue-800'
}

export function ScheduledCalls({ userId, onNavigate }: ScheduledCallsProps) {
  const [records, setRecords] = useState<CallRecord[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await authFetch(`/api/call-records?recruiterId=${userId}&dateFrom=${today}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const scheduled = (data.callRecords || []).filter(
        (r: CallRecord) => r.callStatus === 'SCHEDULED' && r.scheduledAt
      )
      // Sort by scheduledAt ascending
      scheduled.sort((a: CallRecord, b: CallRecord) => {
        return new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()
      })
      setRecords(scheduled)
    } catch {
      toast.error('Failed to load scheduled calls')
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  // Group by date label
  const grouped: Record<string, CallRecord[]> = {}
  records.forEach((r) => {
    if (!r.scheduledAt) return
    const label = getScheduledLabel(r.scheduledAt)
    if (!grouped[label]) grouped[label] = []
    grouped[label].push(r)
  })

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Scheduled Calls"
        description="Your upcoming scheduled callbacks"
        icon={CalendarClock}
      />

      {records.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No Scheduled Calls"
          description="You don't have any scheduled callbacks. Calls you reschedule will appear here."
          actionLabel={onNavigate ? 'Start Calling' : undefined}
          onAction={onNavigate ? () => onNavigate('pending') : undefined}
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([label, groupRecords]) => (
            <div key={label}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {label}
                </h2>
                <Badge variant="secondary" className="text-xs">
                  {groupRecords.length}
                </Badge>
              </div>
              <div className="space-y-3">
                {groupRecords.map((record) => (
                  <Card key={record.id} className="overflow-hidden">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        {/* Timeline dot */}
                        <div className="hidden sm:flex flex-col items-center shrink-0">
                          <div className="h-3 w-3 rounded-full bg-emerald-600 ring-4 ring-emerald-100" />
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">{record.candidate.name}</p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {record.candidate.phone}
                                </span>
                                {record.candidate.role && (
                                  <span className="flex items-center gap-1">
                                    <Briefcase className="h-3 w-3" />
                                    {record.candidate.role}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[11px] shrink-0',
                                getScheduledTimeColor(record.scheduledAt!)
                              )}
                            >
                              {record.scheduledAt ? format(new Date(record.scheduledAt), 'hh:mm a') : ''}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {record.candidate.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {record.candidate.location}
                              </span>
                            )}
                            {record.client?.name && (
                              <span>Client: {record.client.name}</span>
                            )}
                          </div>

                          {record.notes && (
                            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                              <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                              <p className="line-clamp-2">{record.notes}</p>
                            </div>
                          )}
                        </div>

                        {/* Action */}
                        <div className="shrink-0">
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => {
                              if (onNavigate) onNavigate('pending')
                              toast.info(`Navigating to call ${record.candidate.name}`)
                            }}
                          >
                            <Phone className="h-3.5 w-3.5 mr-1.5" />
                            Call Now
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
