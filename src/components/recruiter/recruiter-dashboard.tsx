'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Phone, Clock, CheckCircle, Calendar, List, ChevronRight, Play, GitBranch, UserCheck, MessageSquare, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StatsCard } from '@/components/shared/stats-card'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import { formatPhoneForWhatsApp } from '@/lib/utils'

interface RecruiterDashboardProps {
  userId: string
  onNavigate: (page: string) => void
}

interface CallList {
  id: string
  name: string
  description: string | null
  source: string
  createdAt: string
  candidates: Candidate[]
  assignments: Assignment[]
}

interface Candidate {
  id: string
  name: string
  phone: string
  role: string | null
  location: string | null
  status: string
}

interface Assignment {
  id: string
  recruiterId: string
  callListId: string
}

interface CallRecord {
  id: string
  callStatus: string
  callDuration: number
  calledAt: string
  scheduledAt: string | null
  disposition: { id: string; heading: string; type: string } | null
}

interface DailyStats {
  todayCalls: number
  todayCompleted: number
  totalDuration: number
  statusSummary: { disposition: string; type: string; count: number }[]
  todayFollowUps: number
  followUpCandidates: { id: string; name: string; phone: string; role: string | null; followUpDate: string; notes: string | null }[]
  scheduledToday: number
  pendingCandidates: number
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function RecruiterDashboard({ userId, onNavigate }: RecruiterDashboardProps) {
  const [callLists, setCallLists] = useState<CallList[]>([])
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [callRecords, setCallRecords] = useState<CallRecord[]>([])
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null)
  const [loading, setLoading] = useState(true)

  const initialSelected = useRef(false)

  const fetchCallLists = useCallback(async () => {
    try {
      const res = await authFetch('/api/call-lists')
      if (!res.ok) throw new Error('Failed to fetch call lists')
      const data = await res.json()
      const allLists: CallList[] = data.callLists || []
      const assigned = allLists.filter((list) =>
        list.assignments.some((a) => a.recruiterId === userId)
      )
      setCallLists(assigned)
      if (assigned.length > 0 && !initialSelected.current) {
        initialSelected.current = true
        setSelectedListId(assigned[0].id)
      }
    } catch {
      toast.error('Failed to load call lists')
    }
  }, [userId])

  const fetchCallRecords = useCallback(async () => {
    try {
      const res = await authFetch(`/api/call-records?recruiterId=${userId}`)
      if (!res.ok) throw new Error('Failed to fetch call records')
      const data = await res.json()
      setCallRecords(data.callRecords || [])
    } catch {
      toast.error('Failed to load call records')
    }
  }, [userId])

  const fetchDailyStats = useCallback(async () => {
    try {
      const res = await authFetch('/api/recruiter-stats')
      if (!res.ok) throw new Error('Failed to fetch stats')
      const data = await res.json()
      setDailyStats(data)
    } catch {
      // Silent fail — stats are supplementary
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchCallLists(), fetchCallRecords(), fetchDailyStats()])
      setLoading(false)
    }
    load()
  }, [fetchCallLists, fetchCallRecords, fetchDailyStats])

  const selectedList = callLists.find((l) => l.id === selectedListId)

  const getListStats = (list: CallList) => {
    const total = list.candidates.length
    const pending = list.candidates.filter((c) => c.status === 'PENDING').length
    const done = list.candidates.filter((c) => c.status === 'DONE').length
    const scheduled = list.candidates.filter((c) => c.status === 'SCHEDULED').length
    const skipped = list.candidates.filter((c) => c.status === 'SKIPPED').length
    const progress = total > 0 ? Math.round(((done + skipped) / total) * 100) : 0
    return { total, pending, done, scheduled, skipped, progress }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  const listStats = selectedList ? getListStats(selectedList) : null

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Dashboard"
        description="Welcome back! Here's your calling overview."
        icon={Phone}
      />

      {/* Stats Cards — Daily Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Today's Calls"
          value={dailyStats?.todayCalls ?? 0}
          icon={Phone}
          description="Completed today"
          iconColor="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
        />
        <StatsCard
          title="With Disposition"
          value={dailyStats?.todayCompleted ?? 0}
          icon={CheckCircle}
          description="Logged with outcome"
          iconColor="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
        />
        <StatsCard
          title="Today's Follow-ups"
          value={dailyStats?.todayFollowUps ?? 0}
          icon={Calendar}
          description="Due today"
          iconColor="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
        />
        <StatsCard
          title="Talk Time"
          value={formatDuration(dailyStats?.totalDuration ?? 0)}
          icon={TrendingUp}
          description="Total today"
          iconColor="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400"
        />
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => onNavigate('pending')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Play className="h-4 w-4 mr-2" />
          Start Calling
        </Button>
        <Button variant="outline" onClick={() => onNavigate('pipeline')}>
          <GitBranch className="h-4 w-4 mr-2" />
          Pipeline
        </Button>
        <Button variant="outline" onClick={() => onNavigate('history')}>
          <Clock className="h-4 w-4 mr-2" />
          History
        </Button>
        <Button variant="outline" onClick={() => onNavigate('scheduled')}>
          <Calendar className="h-4 w-4 mr-2" />
          Scheduled
        </Button>
      </div>

      {/* Today's Follow-ups */}
      {dailyStats && dailyStats.followUpCandidates.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-amber-600" />
                Today's Follow-ups
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {dailyStats.followUpCandidates.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {dailyStats.followUpCandidates.map((fu) => (
                <div key={fu.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{fu.name}</p>
                    <p className="text-xs text-muted-foreground">{fu.role || fu.phone}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`tel:${fu.phone.replace(/[^0-9]/g, '')}`}
                      className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center"
                      style={{ touchAction: 'manipulation' }}
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 text-green-600 hover:bg-green-50"
                      onClick={() => {
                        try { window.location.href = `https://wa.me/${formatPhoneForWhatsApp(fu.phone)}` } catch { /* ignore */ }
                      }}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Summary */}
      {dailyStats && dailyStats.statusSummary.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-blue-600" />
              Today's Status Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {dailyStats.statusSummary.map((s, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold">{s.count}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.disposition}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Call List */}
      {callLists.length === 0 ? (
        <EmptyState
          icon={List}
          title="No Call Lists Assigned"
          description="You haven't been assigned any call lists yet. Please contact your admin."
        />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">Current Call List</CardTitle>
                {listStats && (
                  <Badge variant="secondary" className="text-xs">
                    {listStats.progress}% done
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {callLists.length > 1 && (
                  <Button variant="outline" size="sm" onClick={() => onNavigate('pending')}>
                    Change List
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedList && listStats && (
              <>
                <div>
                  <h3 className="font-semibold text-lg">{selectedList.name}</h3>
                  {selectedList.description && (
                    <p className="text-sm text-muted-foreground mt-1">{selectedList.description}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold">{listStats.total}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50">
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{listStats.pending}</p>
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50">
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{listStats.done}</p>
                    <p className="text-xs text-muted-foreground">Done</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/50">
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{listStats.scheduled}</p>
                    <p className="text-xs text-muted-foreground">Scheduled</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{listStats.done + listStats.skipped}/{listStats.total}</span>
                  </div>
                  <Progress value={listStats.progress} className="h-2" />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
