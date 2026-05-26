'use client'

import { useState, useEffect, useMemo } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { BarChart3, Download, Filter, User, Phone, Clock, RefreshCw } from 'lucide-react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import { format, intervalToDuration } from 'date-fns'

interface CallRecord {
  id: string
  candidate: { name: string; phone: string; role: string | null; location: string | null }
  recruiter: { id: string; name: string; email: string }
  disposition: { id: string; heading: string; type: string } | null
  client: { id: string; name: string } | null
  callDuration: number
  callStatus: string
  calledAt: string
  notes: string | null
}

interface Recruiter {
  id: string
  name: string
  email: string
}

function formatCallDuration(seconds: number): string {
  if (seconds <= 0) return '0s'
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 })
  const parts: string[] = []
  if (duration.hours && duration.hours > 0) parts.push(`${duration.hours}h`)
  if (duration.minutes && duration.minutes > 0) parts.push(`${duration.minutes}m`)
  if (duration.seconds && duration.seconds > 0) parts.push(`${duration.seconds}s`)
  return parts.join(' ') || '0s'
}

function getDispositionBadge(type: string | undefined | null): string {
  if (!type) return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  switch (type) {
    case 'CONNECTED': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
    case 'NOT_CONNECTED': return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
    case 'NOT_INTERESTED': return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
    case 'SHORTLISTED': return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
    default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  }
}

export function TeamPerformance() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [recruiters, setRecruiters] = useState<Recruiter[]>([])
  const [selectedRecruiter, setSelectedRecruiter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>(today)
  const [dateTo, setDateTo] = useState<string>(today)
  const [callRecords, setCallRecords] = useState<CallRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 20

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedRecruiter !== 'all') params.set('recruiterId', selectedRecruiter)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const res = await authFetch(`/api/team-performance?${params.toString()}`)
      if (!res.ok) {
        toast.error('Failed to fetch team performance data')
        return
      }
      const json = await res.json()
      setCallRecords(json.callRecords || [])
      setRecruiters(json.recruiters || [])
    } catch {
      toast.error('Failed to fetch team performance data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleApplyFilter = () => {
    setPage(1)
    fetchData()
  }

  const handleToday = () => {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    setDateFrom(todayStr)
    setDateTo(todayStr)
    setSelectedRecruiter('all')
    setPage(1)
  }

  const handleLast7Days = () => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    setDateFrom(format(sevenDaysAgo, 'yyyy-MM-dd'))
    setDateTo(format(new Date(), 'yyyy-MM-dd'))
    setPage(1)
  }

  const handleRefresh = () => {
    setPage(1)
    fetchData()
  }

  // ─── Stats ───
  const stats = useMemo(() => {
    const totalCalls = callRecords.length
    const connected = callRecords.filter(
      r => r.disposition?.type === 'CONNECTED' || r.callStatus === 'COMPLETED'
    ).length
    const totalDuration = callRecords.reduce((sum, r) => sum + r.callDuration, 0)
    const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0
    const uniqueCandidates = new Set(callRecords.map(r => r.candidate.phone)).size
    return { totalCalls, connected, avgDuration, uniqueCandidates }
  }, [callRecords])

  // ─── Pagination ───
  const totalPages = Math.ceil(callRecords.length / pageSize)
  const paginatedRecords = useMemo(
    () => callRecords.slice((page - 1) * pageSize, page * pageSize),
    [callRecords, page]
  )
  const paginationStart = (page - 1) * pageSize + 1
  const paginationEnd = Math.min(page * pageSize, callRecords.length)

  // ─── Export ───
  const handleExport = () => {
    if (callRecords.length === 0) {
      toast.error('No data to export')
      return
    }

    setExporting(true)
    try {
      const workbook = XLSX.utils.book_new()

      const headers = [
        'Candidate Name', 'Phone', 'Role', 'Location', 'Disposition',
        'Client', 'Duration (sec)', 'Call Status', 'Call Date/Time', 'Notes',
      ]

      const makeRows = (records: CallRecord[]) =>
        records.map(r => [
          r.candidate.name,
          r.candidate.phone,
          r.candidate.role || '',
          r.candidate.location || '',
          r.disposition?.heading || '',
          r.client?.name || '',
          r.callDuration,
          r.callStatus,
          r.calledAt ? format(new Date(r.calledAt), 'dd MMM yyyy, hh:mm a') : '',
          r.notes || '',
        ])

      if (selectedRecruiter === 'all') {
        const groupedByRecruiter = new Map<string, CallRecord[]>()
        for (const record of callRecords) {
          const recId = record.recruiter.id
          if (!groupedByRecruiter.has(recId)) {
            groupedByRecruiter.set(recId, [])
          }
          groupedByRecruiter.get(recId)!.push(record)
        }

        for (const [recId, records] of groupedByRecruiter) {
          const recruiter = recruiters.find(r => r.id === recId)
          if (!recruiter) continue
          const sheetName = (recruiter.name || 'Recruiter').slice(0, 31)

          const data = [headers, ...makeRows(records)]
          const ws = XLSX.utils.aoa_to_sheet(data)
          XLSX.utils.book_append_sheet(workbook, ws, sheetName)
        }
      } else {
        const data = [headers, ...makeRows(callRecords)]
        const ws = XLSX.utils.aoa_to_sheet(data)
        XLSX.utils.book_append_sheet(workbook, ws, 'Call Records')
      }

      const dateRange = `${dateFrom}_to_${dateTo}`
      XLSX.writeFile(workbook, `Team_Performance_${dateRange}.xlsx`)
      toast.success('Excel exported successfully')
    } catch {
      toast.error('Failed to export Excel file')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      {/* ─── Page Header ─── */}
      <PageHeader title="Team Performance" description="📊 Recruiter Call Performance View" icon={BarChart3}>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          <Download className="h-4 w-4 mr-2" />
          {exporting ? 'Exporting...' : 'Export Excel'}
        </Button>
      </PageHeader>

      {/* ─── Filter Bar ─── */}
      <div className="rounded-lg border p-4 bg-card mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div className="flex-1 w-full sm:w-auto space-y-1.5 min-w-0">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" /> Recruiter
            </Label>
            <select
              value={selectedRecruiter}
              onChange={(e) => setSelectedRecruiter(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All Recruiters</option>
              {recruiters.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-auto space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Filter className="h-3 w-3" /> From
            </Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full sm:w-[160px]"
            />
          </div>

          <div className="w-full sm:w-auto space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Filter className="h-3 w-3" /> To
            </Label>
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full sm:w-[160px]"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button onClick={handleApplyFilter} className="bg-emerald-600 hover:bg-emerald-700 shrink-0">
              <Filter className="h-4 w-4 mr-2" /> Apply Filter
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={handleLast7Days}>
              Last 7 Days
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Stats Row ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg border p-4 bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Total Calls</span>
          </div>
          <p className="text-2xl font-bold">{loading ? '—' : stats.totalCalls}</p>
        </div>
        <div className="rounded-lg border p-4 bg-card">
          <div className="flex items-center gap-2 mb-1">
            <User className="h-4 w-4 text-emerald-600" />
            <span className="text-xs text-muted-foreground font-medium">Connected</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{loading ? '—' : stats.connected}</p>
        </div>
        <div className="rounded-lg border p-4 bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Avg Duration</span>
          </div>
          <p className="text-2xl font-bold">{loading ? '—' : formatCallDuration(stats.avgDuration)}</p>
        </div>
        <div className="rounded-lg border p-4 bg-card">
          <div className="flex items-center gap-2 mb-1">
            <User className="h-4 w-4 text-blue-600" />
            <span className="text-xs text-muted-foreground font-medium">Unique Candidates</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">{loading ? '—' : stats.uniqueCandidates}</p>
        </div>
      </div>

      {/* ─── Data Table ─── */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded" />
            ))}
          </div>
        ) : callRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No call records found for the selected filters.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>Candidate Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="hidden sm:table-cell">Recruiter</TableHead>
                    <TableHead>Disposition</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Call Date/Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRecords.map((record, idx) => (
                    <TableRow key={record.id}>
                      <TableCell className="text-center text-muted-foreground">
                        {paginationStart + idx}
                      </TableCell>
                      <TableCell className="font-medium">{record.candidate.name}</TableCell>
                      <TableCell>{record.candidate.phone}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{record.recruiter.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {record.disposition ? (
                          <Badge variant="secondary" className={getDispositionBadge(record.disposition.type)}>
                            {record.disposition.heading}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{formatCallDuration(record.callDuration)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {record.calledAt
                          ? format(new Date(record.calledAt), 'dd MMM yyyy, hh:mm a')
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden p-3 space-y-3">
              {paginatedRecords.map((record, idx) => (
                <div key={record.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-medium">
                        #{paginationStart + idx}
                      </span>
                      <span className="font-semibold text-sm">{record.candidate.name}</span>
                    </div>
                    {record.disposition ? (
                      <Badge variant="secondary" className={getDispositionBadge(record.disposition.type)}>
                        {record.disposition.heading}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {record.candidate.phone}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {record.recruiter.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatCallDuration(record.callDuration)}
                    </span>
                    <span>
                      {record.calledAt
                        ? format(new Date(record.calledAt), 'dd MMM yyyy, hh:mm a')
                        : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* ─── Pagination ─── */}
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium">{paginationStart}</span> to{' '}
                <span className="font-medium">{paginationEnd}</span> of{' '}
                <span className="font-medium">{callRecords.length}</span> results
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
