'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import {
  GitBranch, Search, Download, Filter, Loader2, ChevronDown,
  Phone, Mail, Building2, Briefcase, User, Calendar, StickyNote,
  Edit2, Eye, X, Check, MessageSquare, FileSpreadsheet
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { authFetch } from '@/stores/auth-store'
import { useAuthStore, type UserRole } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

// ─── Types ──────────────────────────────────────────────────────────────────

type PipelineStage = 'SHORTLISTED' | 'FOLLOW_UP' | 'INTERVIEWED' | 'JOINED' | 'BACKOUT' | 'ALL'
type CandidateStatus = 'PENDING' | 'DONE' | 'SCHEDULED' | 'SKIPPED'

interface PipelineNote {
  id: string
  text: string
  authorName: string
  createdAt: string
}

interface AdminCandidate {
  id: string
  name: string
  phone: string
  email: string | null
  location: string | null
  role: string | null
  notes: string | null
  remarks: string | null
  pipelineStage: PipelineStage
  status: CandidateStatus
  followUpDate: string | null
  interviewDate: string | null
  joinedDate: string | null
  lastDisposition: string | null
  clientName: string | null
  recruiterName: string | null
  recruiterId: string | null
  organizationName: string | null
  organizationId: string | null
}

interface AdminPipelineResponse {
  candidates: AdminCandidate[]
  counts: Record<string, number>
}

interface RecruiterOption {
  id: string
  name: string
}

interface OrganizationOption {
  id: string
  name: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STAGES: PipelineStage[] = ['SHORTLISTED', 'FOLLOW_UP', 'INTERVIEWED', 'JOINED', 'BACKOUT']

const STAGE_META: Record<string, { label: string; badgeClass: string }> = {
  SHORTLISTED: { label: 'Shortlisted', badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800' },
  FOLLOW_UP: { label: 'Follow-ups', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800' },
  INTERVIEWED: { label: 'Interviewed', badgeClass: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800' },
  JOINED: { label: 'Joined', badgeClass: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800' },
  BACKOUT: { label: 'Backout', badgeClass: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800' },
}

const STATUS_OPTIONS: { value: CandidateStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'DONE', label: 'Done' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'SKIPPED', label: 'Skipped' },
]

const ALL_STAGE_OPTIONS: { value: PipelineStage; label: string }[] = [
  { value: 'SHORTLISTED', label: 'Shortlisted' },
  { value: 'FOLLOW_UP', label: 'Follow Up' },
  { value: 'INTERVIEWED', label: 'Interviewed' },
  { value: 'JOINED', label: 'Joined' },
  { value: 'BACKOUT', label: 'Backout' },
]

const QUICK_DATES = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 15 Days', value: '15d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'This Month', value: 'month' },
  { label: 'Custom', value: 'custom' },
]

// ─── Date Helpers ───────────────────────────────────────────────────────────

function getDateRange(filterValue: string): { from?: string; to?: string } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (filterValue) {
    case 'today':
      return { from: today.toISOString(), to: now.toISOString() }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return { from: yesterday.toISOString(), to: today.toISOString() }
    }
    case '7d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 7)
      return { from: start.toISOString(), to: now.toISOString() }
    }
    case '15d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 15)
      return { from: start.toISOString(), to: now.toISOString() }
    }
    case '30d': {
      const start = new Date(today)
      start.setDate(start.getDate() - 30)
      return { from: start.toISOString(), to: now.toISOString() }
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: start.toISOString(), to: now.toISOString() }
    }
    default:
      return {}
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return format(new Date(dateStr), 'MMM d, yyyy')
  } catch {
    return '—'
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    return format(new Date(dateStr), 'MMM d, yyyy h:mm a')
  } catch {
    return ''
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AdminPipeline() {
  const { user, organization } = useAuthStore()
  const userRole: UserRole = user?.role || 'USER'
  const isSuperAdmin = userRole === 'SUPER_ADMIN'

  // ── Data State ──
  const [candidates, setCandidates] = useState<AdminCandidate[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // ── Filter State ──
  const [activeStage, setActiveStage] = useState<PipelineStage>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('today')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [recruiterFilter, setRecruiterFilter] = useState('all')
  const [organizationFilter, setOrganizationFilter] = useState('all')

  // ── Dropdown Data ──
  const [recruiters, setRecruiters] = useState<RecruiterOption[]>([])
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([])

  // ── Edit Dialog ──
  const [editOpen, setEditOpen] = useState(false)
  const [editCandidate, setEditCandidate] = useState<AdminCandidate | null>(null)
  const [editStatus, setEditStatus] = useState<CandidateStatus>('PENDING')
  const [editStage, setEditStage] = useState<PipelineStage>('SHORTLISTED')
  const [editFollowUpDate, setEditFollowUpDate] = useState('')
  const [editInterviewDate, setEditInterviewDate] = useState('')
  const [editJoinedDate, setEditJoinedDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editRemarks, setEditRemarks] = useState('')
  const [editRecruiterId, setEditRecruiterId] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Notes Dialog ──
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesCandidate, setNotesCandidate] = useState<AdminCandidate | null>(null)
  const [notesHistory, setNotesHistory] = useState<PipelineNote[]>([])
  const [newNoteText, setNewNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(false)

  // ── Search debounce ──
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedSearch = useMemo(() => searchQuery, [searchQuery])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      // Trigger re-fetch when search changes
      fetchCandidates()
    }, 300)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [debouncedSearch, fetchCandidates])

  // ── Fetch dropdown data ──
  const fetchDropdownData = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      params.set('limit', '200')
      const res = await authFetch(`/api/users?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        const users: RecruiterOption[] = (data.users || []).map((u: { id: string; name: string }) => ({
          id: u.id,
          name: u.name,
        }))
        setRecruiters(users)
      }
    } catch {
      // Silently fail — dropdowns will just be empty
    }

    // Fetch organizations only for SUPER_ADMIN
    if (isSuperAdmin) {
      try {
        const res = await authFetch('/api/super-admin/organizations?limit=200')
        if (res.ok) {
          const data = await res.json()
          const orgs: OrganizationOption[] = (data.organizations || []).map((o: { id: string; name: string }) => ({
            id: o.id,
            name: o.name,
          }))
          setOrganizations(orgs)
        }
      } catch {
        // Silently fail
      }
    }
  }, [isSuperAdmin])

  useEffect(() => {
    fetchDropdownData()
  }, [fetchDropdownData])

  // ── Fetch candidates ──
  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()

      if (activeStage !== 'ALL') {
        params.set('stage', activeStage)
      }

      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim())
      }

      // Date range
      const { from, to } = getDateRange(dateFilter)
      if (dateFilter === 'custom' && customDateFrom) {
        params.set('from', new Date(customDateFrom).toISOString())
        if (customDateTo) {
          params.set('to', new Date(customDateTo + 'T23:59:59').toISOString())
        }
      } else if (from && to) {
        params.set('from', from)
        params.set('to', to)
      }

      // Recruiter filter
      if (recruiterFilter && recruiterFilter !== 'all') {
        params.set('recruiterId', recruiterFilter)
      }

      // Organization filter
      if (isSuperAdmin) {
        if (organizationFilter && organizationFilter !== 'all') {
          params.set('organizationId', organizationFilter)
        }
      } else if (organization?.id) {
        params.set('organizationId', organization.id)
      }

      const res = await authFetch(`/api/admin/pipeline?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch pipeline data')
      const data: AdminPipelineResponse = await res.json()
      setCandidates(data.candidates || [])
      setCounts(data.counts || {})
    } catch {
      toast.error('Failed to load pipeline data')
      setCandidates([])
      setCounts({})
    } finally {
      setLoading(false)
    }
  }, [activeStage, debouncedSearch, dateFilter, customDateFrom, customDateTo, recruiterFilter, organizationFilter, isSuperAdmin, organization])

  useEffect(() => {
    fetchCandidates()
  }, [fetchCandidates])

  // ── Export ──
  const handleExport = async (format: 'csv' | 'xlsx') => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      params.set('export', format)

      if (activeStage !== 'ALL') {
        params.set('stage', activeStage)
      }
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim())
      }
      const { from, to } = getDateRange(dateFilter)
      if (dateFilter === 'custom' && customDateFrom) {
        params.set('from', new Date(customDateFrom).toISOString())
        if (customDateTo) {
          params.set('to', new Date(customDateTo + 'T23:59:59').toISOString())
        }
      } else if (from && to) {
        params.set('from', from)
        params.set('to', to)
      }
      if (recruiterFilter && recruiterFilter !== 'all') {
        params.set('recruiterId', recruiterFilter)
      }
      if (isSuperAdmin && organizationFilter && organizationFilter !== 'all') {
        params.set('organizationId', organizationFilter)
      }

      const res = await authFetch(`/api/admin/pipeline?${params.toString()}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pipeline-export-${Date.now()}.${format}`
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }, 300)

      toast.success(`Exported as ${format.toUpperCase()} successfully`)
    } catch {
      toast.error('Failed to export data')
    } finally {
      setExporting(false)
    }
  }

  // ── Edit Dialog ──
  const openEditDialog = (candidate: AdminCandidate) => {
    setEditCandidate(candidate)
    setEditStatus(candidate.status || 'PENDING')
    setEditStage(candidate.pipelineStage)
    setEditFollowUpDate(candidate.followUpDate ? candidate.followUpDate.slice(0, 10) : '')
    setEditInterviewDate(candidate.interviewDate ? candidate.interviewDate.slice(0, 10) : '')
    setEditJoinedDate(candidate.joinedDate ? candidate.joinedDate.slice(0, 10) : '')
    setEditNotes(candidate.notes || '')
    setEditRemarks(candidate.remarks || '')
    setEditRecruiterId(candidate.recruiterId || '')
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editCandidate) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        candidateId: editCandidate.id,
        status: editStatus,
        pipelineStage: editStage,
        notes: editNotes,
        remarks: editRemarks,
      }
      if (editFollowUpDate) payload.followUpDate = editFollowUpDate
      if (editInterviewDate) payload.interviewDate = editInterviewDate
      if (editJoinedDate) payload.joinedDate = editJoinedDate
      if (isSuperAdmin && editRecruiterId) payload.recruiterId = editRecruiterId

      const res = await authFetch('/api/admin/pipeline', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success('Candidate updated successfully')
      setEditOpen(false)
      fetchCandidates()
    } catch {
      toast.error('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  // ── Notes Dialog ──
  const openNotesDialog = async (candidate: AdminCandidate) => {
    setNotesCandidate(candidate)
    setNewNoteText('')
    setNotesHistory([])
    setNotesOpen(true)
    setLoadingNotes(true)

    try {
      const params = new URLSearchParams()
      params.set('candidateId', candidate.id)
      params.set('limit', '50')
      const res = await authFetch(`/api/admin/pipeline/notes?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setNotesHistory(data.notes || [])
      }
    } catch {
      toast.error('Failed to load notes history')
    } finally {
      setLoadingNotes(false)
    }
  }

  const handleAddNote = async () => {
    if (!notesCandidate || !newNoteText.trim()) return
    setSavingNote(true)
    try {
      const res = await authFetch('/api/admin/pipeline/notes', {
        method: 'POST',
        body: JSON.stringify({
          candidateId: notesCandidate.id,
          text: newNoteText.trim(),
        }),
      })
      if (!res.ok) throw new Error('Failed to add note')
      toast.success('Note added successfully')
      setNewNoteText('')

      // Refresh notes
      try {
        const params = new URLSearchParams()
        params.set('candidateId', notesCandidate.id)
        params.set('limit', '50')
        const notesRes = await authFetch(`/api/admin/pipeline/notes?${params.toString()}`)
        if (notesRes.ok) {
          const data = await notesRes.json()
          setNotesHistory(data.notes || [])
        }
      } catch {
        // Silently fail refresh
      }

      // Refresh candidate data too
      fetchCandidates()
    } catch {
      toast.error('Failed to add note')
    } finally {
      setSavingNote(false)
    }
  }

  // ── Computed values ──
  const totalCount = useMemo(() => {
    return Object.values(counts).reduce((sum, c) => sum + c, 0)
  }, [counts])

  const activeCount = useMemo(() => {
    if (activeStage === 'ALL') return totalCount
    return counts[activeStage] || 0
  }, [activeStage, counts, totalCount])

  // ─── Render: Filters Section ─────────────────────────────────────────────

  const renderFilters = () => (
    <div className="space-y-3">
      {/* Quick date filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-1.5 flex-nowrap">
          {QUICK_DATES.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => {
                setDateFilter(d.value)
                if (d.value !== 'custom') {
                  setCustomDateFrom('')
                  setCustomDateTo('')
                }
              }}
              className={cn(
                'inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                dateFilter === d.value
                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                  : 'border-input bg-background hover:bg-muted text-foreground'
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range */}
      {dateFilter === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium whitespace-nowrap">From</Label>
            <Input
              type="date"
              value={customDateFrom}
              onChange={(e) => setCustomDateFrom(e.target.value)}
              className="h-9 text-sm w-[160px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium whitespace-nowrap">To</Label>
            <Input
              type="date"
              value={customDateTo}
              onChange={(e) => setCustomDateTo(e.target.value)}
              className="h-9 text-sm w-[160px]"
            />
          </div>
          {(customDateFrom || customDateTo) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs"
              onClick={() => {
                setCustomDateFrom('')
                setCustomDateTo('')
                fetchCandidates()
              }}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Recruiter & Organization filters + Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name, phone, email, notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {/* Recruiter filter */}
        <Select value={recruiterFilter} onValueChange={setRecruiterFilter}>
          <SelectTrigger className="h-9 text-sm w-full sm:w-[180px]">
            <User className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="All Recruiters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Recruiters</SelectItem>
            {recruiters.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Organization filter — only for SUPER_ADMIN */}
        {isSuperAdmin && (
          <Select value={organizationFilter} onValueChange={setOrganizationFilter}>
            <SelectTrigger className="h-9 text-sm w-full sm:w-[180px]">
              <Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All Organizations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Organizations</SelectItem>
              {organizations.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )

  // ─── Render: Desktop Table ────────────────────────────────────────────────

  const DesktopTable = () => {
    if (candidates.length === 0) {
      return (
        <div className="hidden md:block">
          <EmptyState
            icon={GitBranch}
            title="No Candidates Found"
            description={searchQuery || dateFilter !== 'today' ? 'Try adjusting your filters or search query.' : 'No candidates in this stage yet.'}
          />
        </div>
      )
    }

    return (
      <div className="hidden md:block rounded-xl border overflow-hidden">
        <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="font-semibold min-w-[180px]">Candidate</TableHead>
                <TableHead className="font-semibold min-w-[120px]">Phone</TableHead>
                <TableHead className="font-semibold min-w-[100px]">Role</TableHead>
                <TableHead className="font-semibold min-w-[100px]">Disposition</TableHead>
                <TableHead className="font-semibold min-w-[100px]">Client</TableHead>
                <TableHead className="font-semibold min-w-[120px]">Recruiter</TableHead>
                <TableHead className="font-semibold min-w-[120px]">Organization</TableHead>
                <TableHead className="font-semibold min-w-[100px]">Stage</TableHead>
                <TableHead className="font-semibold min-w-[140px]">Notes</TableHead>
                <TableHead className="font-semibold text-right min-w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c) => {
                const meta = STAGE_META[c.pipelineStage]
                return (
                  <TableRow key={c.id} className="group">
                    {/* Candidate */}
                    <TableCell>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{c.name}</p>
                        {c.location && (
                          <p className="text-xs text-muted-foreground truncate">{c.location}</p>
                        )}
                      </div>
                    </TableCell>

                    {/* Phone */}
                    <TableCell>
                      <a
                        href={`tel:${c.phone}`}
                        className="font-mono text-sm hover:text-emerald-600 transition-colors"
                      >
                        {c.phone}
                      </a>
                    </TableCell>

                    {/* Role */}
                    <TableCell className="text-sm truncate">{c.role || '—'}</TableCell>

                    {/* Disposition */}
                    <TableCell className="text-sm truncate">{c.lastDisposition || '—'}</TableCell>

                    {/* Client */}
                    <TableCell className="text-sm truncate">{c.clientName || '—'}</TableCell>

                    {/* Recruiter */}
                    <TableCell className="text-sm truncate">{c.recruiterName || '—'}</TableCell>

                    {/* Organization */}
                    <TableCell className="text-sm truncate">{c.organizationName || '—'}</TableCell>

                    {/* Stage */}
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[11px]', meta?.badgeClass)}>
                        {meta?.label || c.pipelineStage}
                      </Badge>
                    </TableCell>

                    {/* Notes */}
                    <TableCell>
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {c.notes || '—'}
                      </p>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditDialog(c)}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title="Edit candidate"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openNotesDialog(c)}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title="Notes history"
                        >
                          <StickyNote className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  // ─── Render: Mobile Card ──────────────────────────────────────────────────

  const MobileCard = ({ c }: { c: AdminCandidate }) => {
    const meta = STAGE_META[c.pipelineStage]
    return (
      <Card className="overflow-hidden py-0">
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{c.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {c.location && (
                  <span className="text-xs text-muted-foreground truncate">{c.location}</span>
                )}
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn('text-[10px] shrink-0', meta?.badgeClass)}
            >
              {meta?.label || c.pipelineStage}
            </Badge>
          </div>

          {/* Contact */}
          <div className="space-y-0.5">
            <a
              href={`tel:${c.phone}`}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
            >
              <Phone className="h-3 w-3 shrink-0" />
              <span className="truncate">{c.phone}</span>
            </a>
            {c.email && (
              <a
                href={`mailto:${c.email}`}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
              >
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.email}</span>
              </a>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {c.role && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.role}</span>
              </span>
            )}
            {c.clientName && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.clientName}</span>
              </span>
            )}
            {c.recruiterName && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.recruiterName}</span>
              </span>
            )}
          </div>

          {/* Notes preview */}
          {c.notes && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 line-clamp-2">
              {c.notes}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openEditDialog(c)}
              className="flex-1 gap-1.5 text-xs h-9"
            >
              <Edit2 className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openNotesDialog(c)}
              className="flex-1 gap-1.5 text-xs h-9"
            >
              <StickyNote className="h-3.5 w-3.5" />
              Notes
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ─── Render: Stage Tabs ──────────────────────────────────────────────────

  const renderStageTabs = () => {
    const allCount = totalCount
    return (
      <Tabs
        value={activeStage}
        onValueChange={(v) => setActiveStage(v as PipelineStage)}
      >
        <TabsList className="w-full overflow-x-auto flex-nowrap scrollbar-none h-10">
          <TabsTrigger
            value="ALL"
            className="flex items-center gap-1.5 text-xs sm:text-sm whitespace-nowrap"
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span>All</span>
            {allCount > 0 && (
              <Badge
                variant="secondary"
                className="h-5 min-w-[20px] text-[10px] px-1.5 flex items-center justify-center"
              >
                {allCount}
              </Badge>
            )}
          </TabsTrigger>
          {STAGES.map((stage) => {
            const meta = STAGE_META[stage]
            const count = counts[stage] || 0
            return (
              <TabsTrigger
                key={stage}
                value={stage}
                className="flex items-center gap-1.5 text-xs sm:text-sm whitespace-nowrap"
              >
                <span className="hidden sm:inline">{meta.label}</span>
                <span className="sm:hidden">
                  {meta.label.length > 6 ? meta.label.slice(0, 4) + '…' : meta.label}
                </span>
                {count > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-5 min-w-[20px] text-[10px] px-1.5 flex items-center justify-center"
                  >
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            )
          })}
        </TabsList>

        {/* All tab content */}
        <TabsContent value="ALL">
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <>
              <div className="md:hidden space-y-3 max-h-[calc(100vh-320px)] overflow-y-auto">
                {candidates.length === 0 ? (
                  <EmptyState
                    icon={GitBranch}
                    title="No Candidates Found"
                    description="Try adjusting your filters or search query."
                  />
                ) : (
                  candidates.map((c) => <MobileCard key={c.id} c={c} />)
                )}
              </div>
              <div className="hidden md:block max-h-[calc(100vh-320px)] overflow-y-auto">
                <DesktopTable />
              </div>
            </>
          )}
        </TabsContent>

        {/* Per-stage tab content */}
        {STAGES.map((stage) => (
          <TabsContent key={stage} value={stage}>
            {loading ? (
              <LoadingSkeleton />
            ) : (
              <>
                <div className="md:hidden space-y-3 max-h-[calc(100vh-320px)] overflow-y-auto">
                  {candidates.length === 0 ? (
                    <EmptyState
                      icon={GitBranch}
                      title={`No ${STAGE_META[stage].label} Candidates`}
                      description="No candidates in this stage match your filters."
                    />
                  ) : (
                    candidates.map((c) => <MobileCard key={c.id} c={c} />)
                  )}
                </div>
                <div className="hidden md:block max-h-[calc(100vh-320px)] overflow-y-auto">
                  <DesktopTable />
                </div>
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    )
  }

  // ─── Loading Skeleton ────────────────────────────────────────────────────

  const LoadingSkeleton = () => (
    <div className="space-y-3">
      {/* Desktop skeleton */}
      <div className="hidden md:block space-y-2">
        <Skeleton className="h-10 w-full rounded-lg" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
      {/* Mobile skeleton */}
      <div className="md:hidden space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  )

  // ─── Edit Dialog ─────────────────────────────────────────────────────────

  const renderEditDialog = () => (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Candidate</DialogTitle>
          <DialogDescription>
            Update pipeline information for {editCandidate?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 space-y-4">
          {/* Candidate info (read-only) */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>{' '}
                <span className="font-medium">{editCandidate?.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Phone:</span>{' '}
                <span className="font-mono">{editCandidate?.phone}</span>
              </div>
              {editCandidate?.email && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Email:</span>{' '}
                  <span>{editCandidate.email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Status</Label>
            <Select value={editStatus} onValueChange={(v) => setEditStatus(v as CandidateStatus)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Pipeline Stage */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Pipeline Stage</Label>
            <Select value={editStage} onValueChange={(v) => setEditStage(v as PipelineStage)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_STAGE_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Disposition (read-only) */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Latest Disposition</Label>
            <div className="h-9 rounded-md border border-input bg-muted/50 px-3 flex items-center text-sm text-muted-foreground">
              {editCandidate?.lastDisposition || '—'}
            </div>
          </div>

          {/* Date fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Follow-up Date</Label>
              <Input
                type="date"
                value={editFollowUpDate}
                onChange={(e) => setEditFollowUpDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Interview Date</Label>
              <Input
                type="date"
                value={editInterviewDate}
                onChange={(e) => setEditInterviewDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Joined Date</Label>
              <Input
                type="date"
                value={editJoinedDate}
                onChange={(e) => setEditJoinedDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Notes</Label>
            <Textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Add notes about this candidate..."
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          {/* Remarks */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Remarks</Label>
            <Textarea
              value={editRemarks}
              onChange={(e) => setEditRemarks(e.target.value)}
              placeholder="Add internal remarks..."
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          {/* Recruiter Assignment — SUPER_ADMIN only */}
          {isSuperAdmin && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Assign Recruiter</Label>
              <Select value={editRecruiterId} onValueChange={setEditRecruiterId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select recruiter..." />
                </SelectTrigger>
                <SelectContent>
                  {recruiters.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button
            variant="outline"
            onClick={() => setEditOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveEdit}
            disabled={saving}
            className="gap-1.5"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  // ─── Notes History Dialog ──────────────────────────────────────────────────

  const renderNotesDialog = () => (
    <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Notes History</DialogTitle>
          <DialogDescription>
            Notes for {notesCandidate?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 space-y-4">
          {/* Current notes */}
          {notesCandidate?.notes && (
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Current Notes</p>
              <p className="text-sm">{notesCandidate.notes}</p>
            </div>
          )}

          <Separator />

          {/* Notes history */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">History ({notesHistory.length})</p>

            {loadingNotes ? (
              <div className="space-y-2 py-4">
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </div>
            ) : notesHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No notes history yet.
              </p>
            ) : (
              <div className="space-y-2">
                {notesHistory.map((note) => (
                  <div key={note.id} className="border rounded-lg p-3 space-y-1">
                    <p className="text-sm">{note.text}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium">{note.authorName}</span>
                      <span>•</span>
                      <span>{formatDateTime(note.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Add new note */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Add New Note</Label>
            <Textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Write a note..."
              rows={3}
              className="text-sm resize-none"
            />
            <Button
              onClick={handleAddNote}
              disabled={savingNote || !newNoteText.trim()}
              className="w-full gap-1.5"
              size="sm"
            >
              {savingNote ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <MessageSquare className="h-3.5 w-3.5" />
                  Save Note
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )

  // ─── Main Render ──────────────────────────────────────────────────────────

  // Initial loading state
  if (loading && candidates.length === 0) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight">Pipeline Management</h2>
          <p className="text-sm text-muted-foreground">
            Centralized view of all candidate records across recruiters
            {activeCount > 0 && (
              <span className="ml-1">
                — <span className="font-medium text-foreground">{activeCount}</span> candidate{activeCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>

        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={exporting} className="gap-1.5 h-9">
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('csv')} disabled={exporting}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export as CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('xlsx')} disabled={exporting}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export as Excel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filters */}
      {renderFilters()}

      {/* Stage Tabs */}
      {renderStageTabs()}

      {/* Edit Dialog */}
      {renderEditDialog()}

      {/* Notes Dialog */}
      {renderNotesDialog()}
    </div>
  )
}
