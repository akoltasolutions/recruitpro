'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { History, Search, Filter, Clock, Phone, MapPin, Briefcase, FileText, Download, X, MessageSquare } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import { cn, formatPhoneForWhatsApp } from '@/lib/utils'
import { format } from 'date-fns'

interface CallHistoryProps {
  userId: string
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

const DISPOSITION_COLORS: Record<string, string> = {
  SHORTLISTED: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800',
  CONNECTED: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800',
  NOT_CONNECTED: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800',
  NOT_INTERESTED: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800',
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function cleanPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '')
}

export function CallHistory({ userId }: CallHistoryProps) {
  const [records, setRecords] = useState<CallRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dispositionFilter, setDispositionFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ recruiterId: userId })
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString())
      if (dateTo) params.set('dateTo', new Date(dateTo).toISOString())
      const res = await authFetch(`/api/call-records?${params.toString()}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setRecords(data.callRecords || [])
    } catch {
      toast.error('Failed to load call history')
    }
    setLoading(false)
  }, [userId, dateFrom, dateTo])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchName = r.candidate.name.toLowerCase().includes(query)
        const matchPhone = r.candidate.phone.includes(query)
        if (!matchName && !matchPhone) return false
      }
      if (dispositionFilter !== 'all') {
        if (r.disposition?.type !== dispositionFilter) return false
      }
      return true
    })
  }, [records, searchQuery, dispositionFilter])

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams({ recruiterId: userId })
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString())
      if (dateTo) params.set('dateTo', new Date(dateTo).toISOString())
      const res = await authFetch(`/api/export-calls?${params.toString()}`)
      if (!res.ok) {
        toast.error('Failed to export calls')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Calling_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Export downloaded successfully')
    } catch {
      toast.error('Failed to export')
    } finally {
      setExporting(false)
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setDispositionFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  const hasActiveFilters = searchQuery || dispositionFilter !== 'all' || dateFrom || dateTo

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header with Export button */}
      <PageHeader title="Call History" description="View and filter your past calls" icon={History}>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting || filteredRecords.length === 0}
          className="w-full sm:w-auto min-h-[40px]"
        >
          <Download className="h-4 w-4 mr-2" />
          {exporting ? 'Exporting...' : 'Export'}
        </Button>
      </PageHeader>

      {/* Search bar — always visible */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      {/* Filter toggle button */}
      <div className="flex items-center gap-2">
        <Button
          variant={showFilters || hasActiveFilters ? 'default' : 'outline'}
          size="sm"
          className="h-10 gap-2"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
              {(!!dateFrom ? 1 : 0) + (!!dateTo ? 1 : 0) + (dispositionFilter !== 'all' ? 1 : 0)}
            </Badge>
          )}
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-8 gap-1">
            <X className="h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      {/* Expandable filters panel — vertical layout on ALL screens */}
      {showFilters && (
        <div className="space-y-3 p-3 rounded-xl border bg-muted/30">
          {/* Disposition filter — native select */}
          <select
            value={dispositionFilter}
            onChange={(e) => setDispositionFilter(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-11"
          >
            <option value="all">All Dispositions</option>
            <option value="SHORTLISTED">Shortlisted</option>
            <option value="CONNECTED">Connected</option>
            <option value="NOT_CONNECTED">Not Connected</option>
            <option value="NOT_INTERESTED">Not Interested</option>
          </select>

          {/* Date range — native date inputs */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> From
            </Label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />

            <Label className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
              <Clock className="h-3 w-3" /> To
            </Label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Active filter summary */}
          {hasActiveFilters && (
            <p className="text-xs text-muted-foreground text-center pt-1">
              {filteredRecords.length} result{filteredRecords.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Candidate</TableHead>
              <TableHead className="font-semibold">Phone</TableHead>
              <TableHead className="font-semibold">Role</TableHead>
              <TableHead className="font-semibold">Disposition</TableHead>
              <TableHead className="font-semibold">Client</TableHead>
              <TableHead className="font-semibold">Duration</TableHead>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Notes</TableHead>
              <TableHead className="font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  No records found
                </TableCell>
              </TableRow>
            ) : (
              filteredRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{record.candidate.name}</TableCell>
                  <TableCell className="font-mono text-sm">{record.candidate.phone}</TableCell>
                  <TableCell className="text-sm">{record.candidate.role || '—'}</TableCell>
                  <TableCell>
                    {record.disposition ? (
                      <Badge
                        variant="outline"
                        className={cn('text-[11px]', DISPOSITION_COLORS[record.disposition.type] || '')}
                      >
                        {record.disposition.heading}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{record.client?.name || '—'}</TableCell>
                  <TableCell className="font-mono text-sm">{formatDuration(record.callDuration)}</TableCell>
                  <TableCell className="text-sm">{format(new Date(record.calledAt), 'MMM d, hh:mm a')}</TableCell>
                  <TableCell className="max-w-[200px]">
                    <p className="text-sm text-muted-foreground truncate">
                      {record.notes || '—'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <a
                        href={`tel:${cleanPhone(record.candidate.phone)}`}
                        className="h-8 w-8 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
                        title="Call"
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          try { window.location.href = `https://wa.me/${formatPhoneForWhatsApp(record.candidate.phone)}` } catch { /* ignore */ }
                        }}
                        className="h-8 w-8 rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex items-center justify-center hover:bg-green-200 dark:hover:bg-green-900/50"
                        title="WhatsApp"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredRecords.length === 0 ? (
          <EmptyState
            icon={History}
            title="No Records Found"
            description={hasActiveFilters ? 'Try adjusting your filters.' : 'No call history yet.'}
          />
        ) : (
          filteredRecords.map((record) => (
            <Card key={record.id} className="overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{record.candidate.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span className="truncate">{record.candidate.phone}</span>
                    </p>
                  </div>
                  {record.disposition ? (
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] shrink-0 ml-2', DISPOSITION_COLORS[record.disposition.type] || '')}
                    >
                      {record.disposition.heading}
                    </Badge>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {record.candidate.role && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3 w-3 shrink-0" />
                      <span className="truncate">{record.candidate.role}</span>
                    </span>
                  )}
                  {record.candidate.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{record.candidate.location}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(record.callDuration)}
                  </span>
                </div>

                {record.client?.name && (
                  <p className="text-xs text-muted-foreground">
                    Client: <span className="font-medium text-foreground">{record.client.name}</span>
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(record.calledAt), 'MMM d, yyyy hh:mm a')}
                  </p>
                  {record.notes && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      Has notes
                    </span>
                  )}
                </div>

                {record.notes && (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 line-clamp-2">
                    {record.notes}
                  </p>
                )}

                {/* Call & WhatsApp action buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={`tel:${cleanPhone(record.candidate.phone)}`}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
                    style={{ touchAction: 'manipulation' }}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Call
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      try { window.location.href = `https://wa.me/${formatPhoneForWhatsApp(record.candidate.phone)}` } catch { /* ignore */ }
                    }}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-medium hover:bg-green-200 dark:hover:bg-green-900/50"
                    style={{ touchAction: 'manipulation' }}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    WhatsApp
                  </button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
