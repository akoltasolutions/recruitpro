'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Phone,
  MessageSquare,
  Search,
  Edit2,
  Check,
  X,
  Calendar,
  UserCheck,
  UserX,
  ArrowRight,
  Briefcase,
  Building2,
  StickyNote,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import { cn, formatPhoneForWhatsApp } from '@/lib/utils'
import { format } from 'date-fns'

// ─── Types ──────────────────────────────────────────────────────────────────

type PipelineStage =
  | 'SHORTLISTED'
  | 'FOLLOW_UP'
  | 'INTERVIEWED'
  | 'JOINED'
  | 'BACKOUT'

interface PipelineCandidate {
  id: string
  name: string
  phone: string
  role: string | null
  location: string | null
  email: string | null
  notes: string | null
  pipelineStage: PipelineStage
  followUpDate: string | null
  interviewDate: string | null
  joinedDate: string | null
  backoutReason: string | null
  lastDisposition: string | null
  clientName: string | null
}

interface PipelineResponse {
  candidates: PipelineCandidate[]
  grouped: Record<PipelineStage, PipelineCandidate[]>
  counts: Record<PipelineStage, number>
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STAGES: PipelineStage[] = [
  'SHORTLISTED',
  'FOLLOW_UP',
  'INTERVIEWED',
  'JOINED',
  'BACKOUT',
]

const STAGE_META: Record<
  PipelineStage,
  {
    label: string
    icon: LucideIcon
    color: string
    badgeClass: string
    dotClass: string
  }
> = {
  SHORTLISTED: {
    label: 'Shortlisted',
    icon: UserCheck,
    color: 'text-emerald-600',
    badgeClass:
      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800',
    dotClass: 'bg-emerald-500',
  },
  FOLLOW_UP: {
    label: 'Follow-ups',
    icon: Calendar,
    color: 'text-amber-600',
    badgeClass:
      'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800',
    dotClass: 'bg-amber-500',
  },
  INTERVIEWED: {
    label: 'Interviewed',
    icon: ArrowRight,
    color: 'text-blue-600',
    badgeClass:
      'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800',
    dotClass: 'bg-blue-500',
  },
  JOINED: {
    label: 'Joined',
    icon: UserCheck,
    color: 'text-purple-600',
    badgeClass:
      'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800',
    dotClass: 'bg-purple-500',
  },
  BACKOUT: {
    label: 'Backout',
    icon: UserX,
    color: 'text-red-600',
    badgeClass:
      'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800',
    dotClass: 'bg-red-500',
  },
}

const STAGE_MOVE_OPTIONS: Record<PipelineStage, PipelineStage[]> = {
  SHORTLISTED: ['FOLLOW_UP', 'INTERVIEWED', 'BACKOUT'],
  FOLLOW_UP: ['SHORTLISTED', 'INTERVIEWED', 'JOINED', 'BACKOUT'],
  INTERVIEWED: ['SHORTLISTED', 'FOLLOW_UP', 'JOINED', 'BACKOUT'],
  JOINED: ['SHORTLISTED', 'FOLLOW_UP', 'INTERVIEWED', 'BACKOUT'],
  BACKOUT: ['SHORTLISTED', 'FOLLOW_UP', 'INTERVIEWED', 'JOINED'],
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CandidatePipeline() {
  const [activeStage, setActiveStage] = useState<PipelineStage>('SHORTLISTED')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null) // candidateId being saved

  // Data
  const [candidates, setCandidates] = useState<PipelineCandidate[]>([])
  const [counts, setCounts] = useState<Record<PipelineStage, number>>({
    SHORTLISTED: 0,
    FOLLOW_UP: 0,
    INTERVIEWED: 0,
    JOINED: 0,
    BACKOUT: 0,
  })

  // Inline edit state — keyed by candidateId
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editFollowUpDate, setEditFollowUpDate] = useState('')
  const [editInterviewDate, setEditInterviewDate] = useState('')
  const [editJoinedDate, setEditJoinedDate] = useState('')
  const [editBackoutReason, setEditBackoutReason] = useState('')
  const [editStage, setEditStage] = useState<PipelineStage>('SHORTLISTED')

  // ── Fetch candidates ──

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ stage: activeStage })
      if (searchQuery.trim()) params.set('search', searchQuery.trim())
      const res = await authFetch(`/api/pipeline?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch pipeline data')
      const data: PipelineResponse = await res.json()
      setCandidates(data.candidates || [])
      setCounts(data.counts || {
        SHORTLISTED: 0,
        FOLLOW_UP: 0,
        INTERVIEWED: 0,
        JOINED: 0,
        BACKOUT: 0,
      })
    } catch {
      toast.error('Failed to load pipeline data')
      setCandidates([])
    } finally {
      setLoading(false)
    }
  }, [activeStage, searchQuery])

  useEffect(() => {
    // Debounce search
    const timer = setTimeout(fetchCandidates, 300)
    return () => clearTimeout(timer)
  }, [fetchCandidates])

  // ── Inline edit helpers ──

  const startEditing = (c: PipelineCandidate) => {
    setEditingId(c.id)
    setEditNotes(c.notes || '')
    setEditFollowUpDate(c.followUpDate ? c.followUpDate.slice(0, 10) : '')
    setEditInterviewDate(c.interviewDate ? c.interviewDate.slice(0, 10) : '')
    setEditJoinedDate(c.joinedDate ? c.joinedDate.slice(0, 10) : '')
    setEditBackoutReason(c.backoutReason || '')
    setEditStage(c.pipelineStage)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditNotes('')
    setEditFollowUpDate('')
    setEditInterviewDate('')
    setEditJoinedDate('')
    setEditBackoutReason('')
  }

  // ── Save (PATCH) ──

  const saveCandidate = async (candidateId: string) => {
    setSaving(candidateId)
    try {
      const payload: Record<string, unknown> = { candidateId }
      if (editStage) payload.pipelineStage = editStage
      if (editFollowUpDate) payload.followUpDate = editFollowUpDate
      if (editInterviewDate) payload.interviewDate = editInterviewDate
      if (editJoinedDate) payload.joinedDate = editJoinedDate
      if (editBackoutReason) payload.backoutReason = editBackoutReason
      if (editNotes !== undefined) payload.notes = editNotes

      const res = await authFetch('/api/pipeline', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success('Candidate updated')
      setEditingId(null)
      fetchCandidates()
    } catch {
      toast.error('Failed to save changes')
    } finally {
      setSaving(null)
    }
  }

  // ── Quick stage move ──

  const moveStage = async (candidateId: string, newStage: PipelineStage) => {
    setSaving(candidateId)
    try {
      const res = await authFetch('/api/pipeline', {
        method: 'PATCH',
        body: JSON.stringify({ candidateId, pipelineStage: newStage }),
      })
      if (!res.ok) throw new Error('Failed to move')
      toast.success(`Moved to ${STAGE_META[newStage].label}`)
      fetchCandidates()
    } catch {
      toast.error('Failed to move candidate')
    } finally {
      setSaving(null)
    }
  }

  // ── WhatsApp ──

  const openWhatsApp = (phone: string) => {
    const formatted = formatPhoneForWhatsApp(phone)
    const url = `https://wa.me/${formatted}`
    // Use hidden anchor click so Android WebView shouldOverrideUrlLoading fires
    try {
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => { try { document.body.removeChild(a) } catch { /* ignore */ } }, 300)
    } catch {
      window.location.href = url
    }
  }

  // ── Filtered candidates (client-side on top of server search) ──

  const filteredCandidates = useMemo(() => {
    if (!searchQuery.trim()) return candidates
    const q = searchQuery.toLowerCase()
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q)
    )
  }, [candidates, searchQuery])

  const isEditing = (id: string) => editingId === id

  // ─── Render helpers ───────────────────────────────────────────────────────

  const renderStageSpecificField = (c: PipelineCandidate) => {
    const editing = isEditing(c.id)

    switch (c.pipelineStage) {
      case 'FOLLOW_UP':
        return (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Follow-up Date
            </label>
            {editing ? (
              <input
                type="date"
                value={editFollowUpDate}
                onChange={(e) => setEditFollowUpDate(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            ) : (
              <p className="text-sm">
                {c.followUpDate
                  ? format(new Date(c.followUpDate), 'MMM d, yyyy')
                  : 'Not set'}
              </p>
            )}
          </div>
        )

      case 'INTERVIEWED':
        return (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Interview Date
            </label>
            {editing ? (
              <input
                type="date"
                value={editInterviewDate}
                onChange={(e) => setEditInterviewDate(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            ) : (
              <p className="text-sm">
                {c.interviewDate
                  ? format(new Date(c.interviewDate), 'MMM d, yyyy')
                  : 'Not set'}
              </p>
            )}
          </div>
        )

      case 'JOINED':
        return (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Joining Date
            </label>
            {editing ? (
              <input
                type="date"
                value={editJoinedDate}
                onChange={(e) => setEditJoinedDate(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            ) : (
              <p className="text-sm">
                {c.joinedDate
                  ? format(new Date(c.joinedDate), 'MMM d, yyyy')
                  : 'Not set'}
              </p>
            )}
          </div>
        )

      case 'BACKOUT':
        return (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <UserX className="h-3 w-3" />
              Backout Reason
            </label>
            {editing ? (
              <Input
                value={editBackoutReason}
                onChange={(e) => setEditBackoutReason(e.target.value)}
                placeholder="Enter backout reason..."
                className="h-9 text-sm"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {c.backoutReason || 'Not specified'}
              </p>
            )}
          </div>
        )

      default:
        return null
    }
  }

  // ─── Mobile Card ──────────────────────────────────────────────────────────

  const MobileCard = ({ c }: { c: PipelineCandidate }) => {
    const editing = isEditing(c.id)
    const meta = STAGE_META[c.pipelineStage]
    const StageIcon = meta.icon

    return (
      <Card className="overflow-hidden py-0">
        <CardContent className="p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{c.name}</p>
              <a
                href={`tel:${c.phone}`}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-0.5 transition-colors"
              >
                <Phone className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.phone}</span>
              </a>
            </div>
            <Badge
              variant="outline"
              className={cn('text-[10px] shrink-0', meta.badgeClass)}
            >
              {meta.label}
            </Badge>
          </div>

          {/* Info row */}
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
            {c.lastDisposition && (
              <span className="truncate">{c.lastDisposition}</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <a
              href={`tel:${c.phone}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 transition-colors min-h-[36px]"
            >
              <Phone className="h-3.5 w-3.5" />
              Call
            </a>
            <button
              type="button"
              onClick={() => openWhatsApp(c.phone)}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 transition-colors min-h-[36px]"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              WhatsApp
            </button>
            {!editing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => startEditing(c)}
                className="ml-auto h-9 gap-1 text-xs"
              >
                <Edit2 className="h-3 w-3" />
                Edit
              </Button>
            )}
          </div>

          {/* Stage-specific field */}
          {renderStageSpecificField(c)}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <StickyNote className="h-3 w-3" />
              Notes
            </label>
            {editing ? (
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add notes about this candidate..."
                rows={2}
                className="text-sm"
              />
            ) : (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 min-h-[32px]">
                {c.notes || 'No notes'}
              </p>
            )}
          </div>

          {/* Move to stage (quick) */}
          {!editing && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <ArrowRight className="h-3 w-3" />
                Move to
              </label>
              <div className="flex flex-wrap gap-1.5">
                {STAGE_MOVE_OPTIONS[c.pipelineStage].map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => moveStage(c.id, stage)}
                    disabled={saving === c.id}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', STAGE_META[stage].dotClass)} />
                    {STAGE_META[stage].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stage dropdown + Save/Cancel (edit mode) */}
          {editing && (
            <div className="space-y-3 pt-1 border-t">
              {/* Stage selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Move to Stage
                </label>
                <select
                  value={editStage}
                  onChange={(e) => setEditStage(e.target.value as PipelineStage)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_META[s].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Save / Cancel */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => saveCandidate(c.id)}
                  disabled={saving === c.id}
                  className="gap-1.5 text-xs"
                >
                  <Check className="h-3.5 w-3.5" />
                  {saving === c.id ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelEditing}
                  className="gap-1.5 text-xs"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // ─── Desktop Table ────────────────────────────────────────────────────────

  const DesktopTable = () => {
    if (filteredCandidates.length === 0) {
      return (
        <div className="hidden md:block rounded-xl border overflow-hidden">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No candidates found
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )
    }

    return (
      <div className="hidden md:block rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Candidate</TableHead>
              <TableHead className="font-semibold">Phone</TableHead>
              <TableHead className="font-semibold">Role</TableHead>
              <TableHead className="font-semibold">Disposition</TableHead>
              <TableHead className="font-semibold">Client</TableHead>
              <TableHead className="font-semibold">
                {activeStage === 'FOLLOW_UP' && 'Follow-up Date'}
                {activeStage === 'INTERVIEWED' && 'Interview Date'}
                {activeStage === 'JOINED' && 'Joining Date'}
                {activeStage === 'BACKOUT' && 'Backout Reason'}
                {activeStage === 'SHORTLISTED' && 'Notes'}
              </TableHead>
              <TableHead className="font-semibold">Stage</TableHead>
              <TableHead className="font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCandidates.map((c) => {
              const editing = isEditing(c.id)
              const meta = STAGE_META[c.pipelineStage]

              return (
                <TableRow key={c.id} className={editing ? 'bg-muted/20' : ''}>
                  {/* Candidate name */}
                  <TableCell className="font-medium min-w-[140px]">
                    <div>
                      <p className="font-medium text-sm">{c.name}</p>
                      {c.location && (
                        <p className="text-xs text-muted-foreground">{c.location}</p>
                      )}
                    </div>
                  </TableCell>

                  {/* Phone */}
                  <TableCell className="font-mono text-sm min-w-[120px]">
                    <a
                      href={`tel:${c.phone}`}
                      className="hover:text-emerald-600 transition-colors"
                    >
                      {c.phone}
                    </a>
                  </TableCell>

                  {/* Role */}
                  <TableCell className="text-sm min-w-[100px]">
                    {c.role || '—'}
                  </TableCell>

                  {/* Disposition */}
                  <TableCell className="text-sm min-w-[100px]">
                    {c.lastDisposition || '—'}
                  </TableCell>

                  {/* Client */}
                  <TableCell className="text-sm min-w-[100px]">
                    {c.clientName || '—'}
                  </TableCell>

                  {/* Stage-specific field */}
                  <TableCell className="min-w-[160px]">
                    {activeStage === 'SHORTLISTED' && (
                      editing ? (
                        <Textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          rows={2}
                          className="text-sm"
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                          {c.notes || 'No notes'}
                        </p>
                      )
                    )}

                    {activeStage === 'FOLLOW_UP' && (
                      editing ? (
                        <input
                          type="date"
                          value={editFollowUpDate}
                          onChange={(e) => setEditFollowUpDate(e.target.value)}
                          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      ) : (
                        <p className="text-sm">
                          {c.followUpDate
                            ? format(new Date(c.followUpDate), 'MMM d, yyyy')
                            : 'Not set'}
                        </p>
                      )
                    )}

                    {activeStage === 'INTERVIEWED' && (
                      editing ? (
                        <input
                          type="date"
                          value={editInterviewDate}
                          onChange={(e) => setEditInterviewDate(e.target.value)}
                          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      ) : (
                        <p className="text-sm">
                          {c.interviewDate
                            ? format(new Date(c.interviewDate), 'MMM d, yyyy')
                            : 'Not set'}
                        </p>
                      )
                    )}

                    {activeStage === 'JOINED' && (
                      editing ? (
                        <input
                          type="date"
                          value={editJoinedDate}
                          onChange={(e) => setEditJoinedDate(e.target.value)}
                          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      ) : (
                        <p className="text-sm">
                          {c.joinedDate
                            ? format(new Date(c.joinedDate), 'MMM d, yyyy')
                            : 'Not set'}
                        </p>
                      )
                    )}

                    {activeStage === 'BACKOUT' && (
                      editing ? (
                        <Input
                          value={editBackoutReason}
                          onChange={(e) => setEditBackoutReason(e.target.value)}
                          placeholder="Enter reason..."
                          className="h-9 text-sm"
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                          {c.backoutReason || 'Not specified'}
                        </p>
                      )
                    )}
                  </TableCell>

                  {/* Stage selector */}
                  <TableCell className="min-w-[140px]">
                    {editing ? (
                      <select
                        value={editStage}
                        onChange={(e) => setEditStage(e.target.value as PipelineStage)}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {STAGE_META[s].label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge variant="outline" className={cn('text-[11px]', meta.badgeClass)}>
                        {meta.label}
                      </Badge>
                    )}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Call */}
                      <a
                        href={`tel:${c.phone}`}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-950 text-emerald-600 transition-colors"
                        title="Call"
                      >
                        <Phone className="h-4 w-4" />
                      </a>

                      {/* WhatsApp */}
                      <button
                        type="button"
                        onClick={() => openWhatsApp(c.phone)}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-green-100 dark:hover:bg-green-950 text-green-600 transition-colors"
                        title="WhatsApp"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </button>

                      {/* Edit / Save / Cancel */}
                      {!editing ? (
                        <button
                          type="button"
                          onClick={() => startEditing(c)}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => saveCandidate(c.id)}
                            disabled={saving === c.id}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-950 text-emerald-600 transition-colors disabled:opacity-50"
                            title="Save"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-red-100 dark:hover:bg-red-950 text-red-600 transition-colors"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      )}

                      {/* Quick move dropdown */}
                      {!editing && (
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              moveStage(c.id, e.target.value as PipelineStage)
                              e.target.value = ''
                            }
                          }}
                          className="h-8 w-8 rounded-md border border-input bg-transparent text-xs cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[center_right_4px] bg-no-repeat hover:bg-muted transition-colors"
                          title="Move to stage"
                        >
                          <option value="" disabled>
                            Move
                          </option>
                          {STAGE_MOVE_OPTIONS[c.pipelineStage].map((s) => (
                            <option key={s} value={s}>
                              {STAGE_META[s].label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    )
  }

  // ─── Main Render ──────────────────────────────────────────────────────────

  if (loading && candidates.length === 0) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight">Candidate Pipeline</h2>
          <p className="text-sm text-muted-foreground">
            Track and manage candidates across hiring stages
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      {/* Pipeline Tabs */}
      <Tabs
        value={activeStage}
        onValueChange={(v) => setActiveStage(v as PipelineStage)}
      >
        <TabsList className="w-full overflow-x-auto flex-nowrap scrollbar-none">
          {STAGES.map((stage) => {
            const meta = STAGE_META[stage]
            const StageIcon = meta.icon
            const count = counts[stage] ?? 0

            return (
              <TabsTrigger
                key={stage}
                value={stage}
                className="flex items-center gap-1.5 text-xs sm:text-sm whitespace-nowrap"
              >
                <StageIcon className={cn('h-3.5 w-3.5', meta.color)} />
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

        {STAGES.map((stage) => (
          <TabsContent key={stage} value={stage}>
            {/* Loading state for tab switch */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-48 rounded-xl" />
                ))}
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-3 max-h-[calc(100vh-320px)] overflow-y-auto">
                  {filteredCandidates.length === 0 ? (
                    <EmptyState
                      icon={STAGE_META[stage].icon}
                      title={`No ${STAGE_META[stage].label} Candidates`}
                      description={
                        searchQuery
                          ? 'Try adjusting your search query.'
                          : 'No candidates in this stage yet.'
                      }
                    />
                  ) : (
                    filteredCandidates.map((c) => (
                      <MobileCard key={c.id} c={c} />
                    ))
                  )}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block max-h-[calc(100vh-320px)] overflow-y-auto">
                  <DesktopTable />
                </div>
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
