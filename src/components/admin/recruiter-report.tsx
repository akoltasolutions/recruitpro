'use client'

import React, { useState, useCallback } from 'react'
import {
  Download,
  FileSpreadsheet,
  CalendarDays,
  Calendar,
  RefreshCw,
  Loader2,
  Clock,
  Phone,
  Users,
  Filter,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { authFetch } from '@/stores/auth-store'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportRow {
  name: string
  email: string
  phone: string
  totalLoginHours: number
  activeHours: number
  breakHours: number
  idleHours: number
  lunchHours: number
  totalCalls: number
  connected: number
  notAnswered: number
  shortlisted: number
  otherDispositions: string
}

type DatePreset = 'today' | 'custom'

function formatH(h: number): string {
  if (h === 0) return '0m'
  const hours = Math.floor(h)
  const mins = Math.round((h - hours) * 60)
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

function todayIST(): string {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------

interface SummaryStat {
  label: string
  value: string | number
  icon: typeof Clock
  color: string
}

function SummaryBar({ stats }: { stats: SummaryStat[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((s) => {
        const Icon = s.icon
        return (
          <Card key={s.label} className="border-0 bg-muted/50">
            <CardContent className="p-3 flex items-center gap-2.5">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                <p className="text-lg font-bold leading-tight">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mobile card
// ---------------------------------------------------------------------------

function MobileCard({ row, index }: { row: ReportRow; index: number }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">#{index + 1}</span>
              <p className="font-semibold text-sm truncate">{row.name}</p>
            </div>
            <p className="text-xs text-muted-foreground truncate">{row.email}</p>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">
            {row.totalCalls} calls
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span>Login: <strong>{formatH(row.totalLoginHours)}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Active: <strong>{formatH(row.activeHours)}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span>Break: <strong>{formatH(row.breakHours)}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-slate-400" />
            <span>Idle: <strong>{formatH(row.idleHours)}</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs pt-1 border-t">
          <span className="text-emerald-600">Connected: {row.connected}</span>
          <span className="text-red-500">Not Ans: {row.notAnswered}</span>
          <span className="text-blue-600">Shortlisted: {row.shortlisted}</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl lg:hidden" />
      ))}
      <Skeleton className="h-48 rounded-xl hidden lg:block" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RecruiterReport() {
  const [datePreset, setDatePreset] = useState<DatePreset>('today')
  const [customFrom, setCustomFrom] = useState(todayIST())
  const [customTo, setCustomTo] = useState(todayIST())
  const [report, setReport] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // -------------------------------------------------------------------------
  // Build date params
  // -------------------------------------------------------------------------

  const getDateParams = useCallback(() => {
    if (datePreset === 'today') {
      return { dateFrom: todayIST(), dateTo: todayIST() }
    }
    return { dateFrom: customFrom, dateTo: customTo }
  }, [datePreset, customFrom, customTo])

  // -------------------------------------------------------------------------
  // Fetch preview data
  // -------------------------------------------------------------------------

  const fetchPreview = useCallback(async () => {
    setLoading(true)
    try {
      const { dateFrom, dateTo } = getDateParams()
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        format: 'json',
      })
      const res = await authFetch(`/api/reports/export?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setReport(data.report ?? [])
    } catch (err) {
      console.error('[Report] Fetch error:', err)
      toast.error('Failed to load report data')
    } finally {
      setLoading(false)
    }
  }, [getDateParams])

  // Auto-load on mount and when preset changes
  React.useEffect(() => {
    fetchPreview()
  }, [fetchPreview])

  // -------------------------------------------------------------------------
  // Export Excel
  // -------------------------------------------------------------------------

  const handleExport = async () => {
    setExporting(true)
    try {
      const { dateFrom, dateTo } = getDateParams()
      const params = new URLSearchParams({ dateFrom, dateTo })
      const res = await authFetch(`/api/reports/export?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition')
      let filename = 'Recruiter_Report.xlsx'
      if (disposition) {
        const match = disposition.match(/filename="?(.+?)"?$/)
        if (match) filename = match[1]
      }

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)

      toast.success('Report downloaded successfully!')
    } catch (err) {
      console.error('[Report] Export error:', err)
      toast.error('Failed to export report')
    } finally {
      setExporting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Summary stats
  // -------------------------------------------------------------------------

  const totalLoginH = report.reduce((s, r) => s + r.totalLoginHours, 0)
  const totalActiveH = report.reduce((s, r) => s + r.activeHours, 0)
  const totalCalls = report.reduce((s, r) => s + r.totalCalls, 0)
  const totalShortlisted = report.reduce((s, r) => s + r.shortlisted, 0)

  const summaryStats: SummaryStat[] = [
    { label: 'Recruiters', value: report.length, icon: Users, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
    { label: 'Total Login Hrs', value: formatH(totalLoginH), icon: Clock, color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' },
    { label: 'Total Calls', value: totalCalls, icon: Phone, color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
    { label: 'Shortlisted', value: totalShortlisted, icon: CalendarDays, color: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400' },
  ]

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Export Reports</h2>
            <p className="text-sm text-muted-foreground">
              Recruiter performance reports with time tracking &amp; call stats
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPreview}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={exporting || loading}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download Excel
          </Button>
        </div>
      </div>

      {/* ── Date Filter ────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Period:</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant={datePreset === 'today' ? 'default' : 'outline'}
                onClick={() => setDatePreset('today')}
                className={
                  datePreset === 'today'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : ''
                }
              >
                <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                Today
              </Button>
              <Button
                size="sm"
                variant={datePreset === 'custom' ? 'default' : 'outline'}
                onClick={() => setDatePreset('custom')}
                className={
                  datePreset === 'custom'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : ''
                }
              >
                <Calendar className="h-3.5 w-3.5 mr-1.5" />
                Custom Range
              </Button>

              {datePreset === 'custom' && (
                <div className="flex items-center gap-2 ml-2">
                  <div className="flex items-center gap-1.5">
                    <label htmlFor="date-from" className="text-xs text-muted-foreground">
                      From
                    </label>
                    <input
                      id="date-from"
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label htmlFor="date-to" className="text-xs text-muted-foreground">
                      To
                    </label>
                    <input
                      id="date-to"
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            <span className="text-xs text-muted-foreground hidden sm:inline-flex ml-auto">
              Working hours: 08:00 AM – 07:00 PM IST
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Summary Bar ────────────────────────────────────────────────── */}
      {!loading && <SummaryBar stats={summaryStats} />}

      {/* ── Loading ────────────────────────────────────────────────────── */}
      {loading && <ReportSkeleton />}

      {/* ── Empty State ────────────────────────────────────────────────── */}
      {!loading && report.length === 0 && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center text-center">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">
              No data for selected period
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              There are no recruiter activity logs or call records for this date range.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Mobile Cards ───────────────────────────────────────────────── */}
      {!loading && report.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
          {report.map((row, i) => (
            <MobileCard key={row.email} row={row} index={i} />
          ))}
        </div>
      )}

      {/* ── Desktop Table ──────────────────────────────────────────────── */}
      {!loading && report.length > 0 && (
        <Card className="hidden lg:block overflow-hidden">
          <CardContent className="p-0">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_2.5fr_0.9fr_0.9fr_0.9fr_0.8fr_0.9fr_0.9fr_0.8fr_0.9fr] items-center gap-0 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span>Name</span>
              <span>Email</span>
              <span className="text-center">Login</span>
              <span className="text-center">Active</span>
              <span className="text-center">Break</span>
              <span className="text-center">Idle</span>
              <span className="text-center">Lunch</span>
              <span className="text-center">Calls</span>
              <span className="text-center">Conn.</span>
              <span className="text-center">Short.</span>
            </div>

            {/* Table body */}
            <div className="max-h-[480px] overflow-y-auto">
              {report.map((row, idx) => (
                <div
                  key={row.email}
                  className={`grid grid-cols-[2fr_2.5fr_0.9fr_0.9fr_0.9fr_0.8fr_0.9fr_0.9fr_0.8fr_0.9fr] items-center gap-0 px-4 py-2.5 text-sm ${
                    idx !== report.length - 1 ? 'border-b' : ''
                  } hover:bg-muted/30 transition-colors`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted-foreground font-mono shrink-0">{idx + 1}</span>
                    <span className="font-medium truncate">{row.name}</span>
                  </div>
                  <span className="text-muted-foreground text-xs truncate">{row.email}</span>
                  <span className="text-center text-xs">{formatH(row.totalLoginHours)}</span>
                  <span className="text-center text-xs text-emerald-600">{formatH(row.activeHours)}</span>
                  <span className="text-center text-xs text-amber-600">{formatH(row.breakHours)}</span>
                  <span className="text-center text-xs text-slate-500">{formatH(row.idleHours)}</span>
                  <span className="text-center text-xs text-blue-600">{formatH(row.lunchHours)}</span>
                  <span className="text-center text-xs font-semibold">{row.totalCalls}</span>
                  <span className="text-center text-xs">{row.connected}</span>
                  <span className="text-center text-xs">{row.shortlisted}</span>
                </div>
              ))}
            </div>

            {/* Footer totals */}
            {report.length > 1 && (
              <div className="grid grid-cols-[2fr_2.5fr_0.9fr_0.9fr_0.9fr_0.8fr_0.9fr_0.9fr_0.8fr_0.9fr] items-center gap-0 border-t bg-muted/40 px-4 py-2.5 text-sm font-semibold">
                <span>Total</span>
                <span>{report.length} recruiters</span>
                <span className="text-center text-xs">{formatH(totalLoginH)}</span>
                <span className="text-center text-xs">{formatH(totalActiveH)}</span>
                <span className="text-center text-xs">{formatH(report.reduce((s, r) => s + r.breakHours, 0))}</span>
                <span className="text-center text-xs">{formatH(report.reduce((s, r) => s + r.idleHours, 0))}</span>
                <span className="text-center text-xs">{formatH(report.reduce((s, r) => s + r.lunchHours, 0))}</span>
                <span className="text-center text-xs">{totalCalls}</span>
                <span className="text-center text-xs">{report.reduce((s, r) => s + r.connected, 0)}</span>
                <span className="text-center text-xs">{totalShortlisted}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
