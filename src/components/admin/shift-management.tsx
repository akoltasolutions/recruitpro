'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Clock, Plus, Users, Pencil, Trash2, RefreshCw, Search } from 'lucide-react'
import { authFetch } from '@/stores/auth-store'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShiftUser {
  id: string
  name: string
  email: string
  designation?: string
}

interface Shift {
  id: string
  userId: string
  user: ShiftUser
  shiftStart: string
  shiftEnd: string
  workingHours: number
  breakAllowed: boolean
  weeklyOff: string
  outsideShiftOverride: boolean
  createdAt: string
  updatedAt: string
}

interface ShiftFormData {
  userId: string
  shiftStart: string
  shiftEnd: string
  breakAllowed: boolean
  weeklyOff: string
  outsideShiftOverride: boolean
}

interface BulkShiftFormData {
  userIds: string[]
  shiftStart: string
  shiftEnd: string
  breakAllowed: boolean
  weeklyOff: string
  outsideShiftOverride: boolean
}

const WEEKLY_OFF_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'MONDAY', label: 'Monday' },
  { value: 'TUESDAY', label: 'Tuesday' },
  { value: 'WEDNESDAY', label: 'Wednesday' },
  { value: 'THURSDAY', label: 'Thursday' },
  { value: 'FRIDAY', label: 'Friday' },
  { value: 'SATURDAY', label: 'Saturday' },
  { value: 'SUNDAY', label: 'Sunday' },
]

const EMPTY_FORM: ShiftFormData = {
  userId: '',
  shiftStart: '09:00',
  shiftEnd: '18:00',
  breakAllowed: true,
  weeklyOff: 'SUNDAY',
  outsideShiftOverride: false,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateWorkingHours(start: string, end: string): string {
  if (!start || !end) return '0h 0m'
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let startMinutes = sh * 60 + sm
  let endMinutes = eh * 60 + em
  // Handle overnight shifts
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60
  }
  const diff = endMinutes - startMinutes
  const hours = Math.floor(diff / 60)
  const mins = diff % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

function calculateWorkingHoursDecimal(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let startMinutes = sh * 60 + sm
  let endMinutes = eh * 60 + em
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60
  }
  const diff = endMinutes - startMinutes
  return Math.round((diff / 60) * 100) / 100
}

function formatWeeklyOff(value: string): string {
  const opt = WEEKLY_OFF_OPTIONS.find(o => o.value === value)
  return opt ? opt.label : value
}

function getUserInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-[140px]" />
            <Skeleton className="h-3 w-[200px]" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function MobileCardSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-52 rounded-xl" />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shift Form Dialog (shared between Assign / Edit)
// ---------------------------------------------------------------------------

interface ShiftFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  users: ShiftUser[]
  initialData: ShiftFormData
  submitLabel: string
  onSubmit: (data: ShiftFormData) => Promise<void>
}

function ShiftFormDialog({
  open,
  onOpenChange,
  title,
  description,
  users,
  initialData,
  submitLabel,
  onSubmit,
}: ShiftFormDialogProps) {
  const [form, setForm] = useState<ShiftFormData>(initialData)
  const [submitting, setSubmitting] = useState(false)
  const isEditing = initialData.userId !== ''

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setForm(initialData)
    }
  }, [open, initialData])

  const handleSubmit = async () => {
    if (!form.userId) {
      toast.error('Please select a recruiter')
      return
    }
    if (!form.shiftStart || !form.shiftEnd) {
      toast.error('Please set both shift start and end times')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(form)
      onOpenChange(false)
    } catch {
      toast.error('Failed to save shift')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Recruiter Select */}
          <div className="space-y-2">
            <Label htmlFor="shift-user">Recruiter</Label>
            <Select
              value={form.userId}
              onValueChange={(v) => setForm((f) => ({ ...f, userId: v }))}
              disabled={isEditing}
            >
              <SelectTrigger id="shift-user">
                <SelectValue placeholder="Select a recruiter" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} {u.designation ? `(${u.designation})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shift-start">Shift Start</Label>
              <Input
                id="shift-start"
                type="time"
                value={form.shiftStart}
                onChange={(e) => setForm((f) => ({ ...f, shiftStart: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-end">Shift End</Label>
              <Input
                id="shift-end"
                type="time"
                value={form.shiftEnd}
                onChange={(e) => setForm((f) => ({ ...f, shiftEnd: e.target.value }))}
              />
            </div>
          </div>

          {/* Working hours preview */}
          {form.shiftStart && form.shiftEnd && (
            <div className="bg-muted rounded-lg px-3 py-2 text-sm">
              <span className="text-muted-foreground">Working Hours: </span>
              <span className="font-medium">{calculateWorkingHours(form.shiftStart, form.shiftEnd)}</span>
            </div>
          )}

          {/* Break Allowed */}
          <div className="flex items-center justify-between">
            <Label htmlFor="break-allowed">Break Allowed</Label>
            <Switch
              id="break-allowed"
              checked={form.breakAllowed}
              onCheckedChange={(v) => setForm((f) => ({ ...f, breakAllowed: v }))}
            />
          </div>

          {/* Weekly Off */}
          <div className="space-y-2">
            <Label htmlFor="weekly-off">Weekly Off</Label>
            <Select
              value={form.weeklyOff}
              onValueChange={(v) => setForm((f) => ({ ...f, weeklyOff: v }))}
            >
              <SelectTrigger id="weekly-off">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKLY_OFF_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Outside Shift Override */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="outside-override">Outside Shift Override</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Allow working outside assigned shift times
              </p>
            </div>
            <Switch
              id="outside-override"
              checked={form.outsideShiftOverride}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, outsideShiftOverride: v }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Bulk Assign Dialog
// ---------------------------------------------------------------------------

interface BulkAssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  users: ShiftUser[]
  onSubmit: (data: BulkShiftFormData) => Promise<void>
}

function BulkAssignDialog({ open, onOpenChange, users, onSubmit }: BulkAssignDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [form, setForm] = useState<Omit<BulkShiftFormData, 'userIds'>>({
    shiftStart: '09:00',
    shiftEnd: '18:00',
    breakAllowed: true,
    weeklyOff: 'SUNDAY',
    outsideShiftOverride: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (open) {
      setSelectedIds([])
      setForm({
        shiftStart: '09:00',
        shiftEnd: '18:00',
        breakAllowed: true,
        weeklyOff: 'SUNDAY',
        outsideShiftOverride: false,
      })
      setSearchQuery('')
    }
  }, [open])

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const toggleUser = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((uid) => uid !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    if (selectedIds.length === filteredUsers.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredUsers.map((u) => u.id))
    }
  }

  const handleSubmit = async () => {
    if (selectedIds.length === 0) {
      toast.error('Please select at least one recruiter')
      return
    }
    if (!form.shiftStart || !form.shiftEnd) {
      toast.error('Please set both shift start and end times')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({ userIds: selectedIds, ...form })
      onOpenChange(false)
    } catch {
      toast.error('Failed to bulk assign shifts')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Assign Shifts</DialogTitle>
          <DialogDescription>
            Select multiple recruiters and assign the same shift to all of them.
          </DialogDescription>
        </DialogHeader>

        {/* User selection with search */}
        <div className="space-y-3 flex-1 overflow-y-auto min-h-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Selected: {selectedIds.length} of {users.length}
            </span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search recruiters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="border rounded-lg max-h-48 overflow-y-auto">
            {/* Select All header */}
            <div className="flex items-center gap-3 px-3 py-2 border-b bg-muted/50 sticky top-0">
              <Checkbox
                checked={selectedIds.length === filteredUsers.length && filteredUsers.length > 0}
                onCheckedChange={toggleAll}
              />
              <span className="text-sm font-medium">Select All</span>
            </div>
            {/* User list */}
            <div className="divide-y">
              {filteredUsers.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selectedIds.includes(u.id)}
                    onCheckedChange={() => toggleUser(u.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    {u.designation && (
                      <p className="text-xs text-muted-foreground">{u.designation}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Shift settings */}
          <div className="space-y-3 pt-2 border-t">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Shift Start</Label>
                <Input
                  type="time"
                  value={form.shiftStart}
                  onChange={(e) => setForm((f) => ({ ...f, shiftStart: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Shift End</Label>
                <Input
                  type="time"
                  value={form.shiftEnd}
                  onChange={(e) => setForm((f) => ({ ...f, shiftEnd: e.target.value }))}
                />
              </div>
            </div>

            {form.shiftStart && form.shiftEnd && (
              <p className="text-xs text-muted-foreground">
                Working Hours: <span className="font-medium">{calculateWorkingHours(form.shiftStart, form.shiftEnd)}</span>
              </p>
            )}

            <div className="flex items-center justify-between">
              <Label className="text-xs">Break Allowed</Label>
              <Switch
                checked={form.breakAllowed}
                onCheckedChange={(v) => setForm((f) => ({ ...f, breakAllowed: v }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Weekly Off</Label>
              <Select
                value={form.weeklyOff}
                onValueChange={(v) => setForm((f) => ({ ...f, weeklyOff: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKLY_OFF_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">Outside Shift Override</Label>
                <p className="text-[11px] text-muted-foreground">
                  Allow working outside assigned shift
                </p>
              </div>
              <Switch
                checked={form.outsideShiftOverride}
                onCheckedChange={(v) => setForm((f) => ({ ...f, outsideShiftOverride: v }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            <Users className="h-3.5 w-3.5" />
            Assign to {selectedIds.length} Recruiter{selectedIds.length !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ShiftManagement() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [users, setUsers] = useState<ShiftUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingShift, setDeletingShift] = useState<Shift | null>(null)

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchShifts = useCallback(async () => {
    try {
      const res = await authFetch('/api/shifts')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setShifts(Array.isArray(data) ? data : data.shifts || [])
      setError(null)
    } catch (err) {
      console.error('Failed to fetch shifts:', err)
      setError('Failed to load shifts. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await authFetch('/api/users')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      // Map API user response to ShiftUser format
      const userList = Array.isArray(data) ? data : data.users || []
      setUsers(
        userList.map((u: Record<string, unknown>) => ({
          id: u.id as string,
          name: u.name as string,
          email: u.email as string,
          designation: (u.designation as string) || '',
        }))
      )
    } catch (err) {
      console.error('Failed to fetch users:', err)
    }
  }, [])

  useEffect(() => {
    fetchShifts()
    fetchUsers()
  }, [fetchShifts, fetchUsers])

  // -------------------------------------------------------------------------
  // CRUD handlers
  // -------------------------------------------------------------------------

  const handleAssignShift = async (data: ShiftFormData) => {
    const res = await authFetch('/api/shifts', {
      method: 'POST',
      body: JSON.stringify({
        userId: data.userId,
        shiftStart: data.shiftStart,
        shiftEnd: data.shiftEnd,
        workingHours: calculateWorkingHoursDecimal(data.shiftStart, data.shiftEnd),
        breakAllowed: data.breakAllowed,
        weeklyOff: data.weeklyOff,
        outsideShiftOverride: data.outsideShiftOverride,
      }),
    })
    if (!res.ok) throw new Error('Failed to assign shift')
    toast.success('Shift assigned successfully')
    fetchShifts()
  }

  const handleBulkAssign = async (data: BulkShiftFormData) => {
    const res = await authFetch('/api/shifts/bulk', {
      method: 'POST',
      body: JSON.stringify({
        userIds: data.userIds,
        shiftStart: data.shiftStart,
        shiftEnd: data.shiftEnd,
        workingHours: calculateWorkingHoursDecimal(data.shiftStart, data.shiftEnd),
        breakAllowed: data.breakAllowed,
        weeklyOff: data.weeklyOff,
        outsideShiftOverride: data.outsideShiftOverride,
      }),
    })
    if (!res.ok) throw new Error('Failed to bulk assign shifts')
    toast.success(`Shifts assigned to ${data.userIds.length} recruiters`)
    fetchShifts()
  }

  const handleEditShift = async (data: ShiftFormData) => {
    if (!editingShift) return
    const res = await authFetch(`/api/shifts/${editingShift.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        shiftStart: data.shiftStart,
        shiftEnd: data.shiftEnd,
        workingHours: calculateWorkingHoursDecimal(data.shiftStart, data.shiftEnd),
        breakAllowed: data.breakAllowed,
        weeklyOff: data.weeklyOff,
        outsideShiftOverride: data.outsideShiftOverride,
      }),
    })
    if (!res.ok) throw new Error('Failed to update shift')
    toast.success('Shift updated successfully')
    fetchShifts()
  }

  const handleDeleteShift = async () => {
    if (!deletingShift) return
    try {
      const res = await authFetch(`/api/shifts/${deletingShift.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete shift')
      toast.success('Shift deleted successfully')
      fetchShifts()
    } catch {
      toast.error('Failed to delete shift')
    } finally {
      setDeleteDialogOpen(false)
      setDeletingShift(null)
    }
  }

  const openEditDialog = (shift: Shift) => {
    setEditingShift(shift)
    setEditDialogOpen(true)
  }

  const openDeleteDialog = (shift: Shift) => {
    setDeletingShift(shift)
    setDeleteDialogOpen(true)
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950">
            <Clock className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Shift Management</h2>
            <p className="text-sm text-muted-foreground">
              Assign and manage recruiter work shifts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true)
              fetchShifts()
            }}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkDialogOpen(true)}
            className="gap-1.5"
          >
            <Users className="h-3.5 w-3.5" />
            Bulk Assign
          </Button>
          <Button
            size="sm"
            onClick={() => setAssignDialogOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Assign Shift
          </Button>
        </div>
      </div>

      {/* ── Error state ────────────────────────────────────────────────── */}
      {error && (
        <Card className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950">
          <CardContent className="p-4 flex items-center justify-between">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchShifts}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Loading state ──────────────────────────────────────────────── */}
      {loading && (
        <>
          <div className="lg:hidden">
            <MobileCardSkeleton />
          </div>
          <Card className="hidden lg:block">
            <TableSkeleton />
          </Card>
        </>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!loading && shifts.length === 0 && !error && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center text-center">
            <Clock className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">No shifts assigned</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Click &quot;Assign Shift&quot; to create a new shift assignment.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Mobile cards (visible on < lg) ──────────────────────────────── */}
      {!loading && shifts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
          {shifts.map((shift) => (
            <Card key={shift.id} className="overflow-hidden">
              <div className="h-1 bg-emerald-500" />
              <CardContent className="p-4 space-y-3">
                {/* User info */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-sm font-semibold shrink-0">
                      {getUserInitials(shift.user?.name || 'U')}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{shift.user?.name || 'Unknown'}</p>
                      {shift.user?.designation && (
                        <p className="text-xs text-muted-foreground">{shift.user.designation}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(shift)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-500 hover:text-red-600"
                      onClick={() => openDeleteDialog(shift)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Shift details */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Shift Start</p>
                    <p className="font-medium">{shift.shiftStart}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Shift End</p>
                    <p className="font-medium">{shift.shiftEnd}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Working Hours</p>
                    <p className="font-medium">
                      {shift.workingHours
                        ? `${Math.floor(shift.workingHours)}h ${Math.round((shift.workingHours % 1) * 60)}m`
                        : calculateWorkingHours(shift.shiftStart, shift.shiftEnd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Break</p>
                    <Badge variant={shift.breakAllowed ? 'default' : 'outline'} className="text-xs">
                      {shift.breakAllowed ? 'Allowed' : 'Not Allowed'}
                    </Badge>
                  </div>
                </div>

                {/* Bottom row */}
                <div className="flex items-center justify-between pt-1 border-t">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {shift.weeklyOff === 'NONE' ? 'No Off' : formatWeeklyOff(shift.weeklyOff)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Outside Override</span>
                    <Switch
                      checked={shift.outsideShiftOverride}
                      disabled
                      className="scale-75 origin-right"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Desktop table (visible on lg+) ─────────────────────────────── */}
      {!loading && shifts.length > 0 && (
        <Card className="hidden lg:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[200px]">Recruiter Name</TableHead>
                  <TableHead>Shift Start</TableHead>
                  <TableHead>Shift End</TableHead>
                  <TableHead>Working Hours</TableHead>
                  <TableHead>Break Allowed</TableHead>
                  <TableHead>Weekly Off</TableHead>
                  <TableHead>Outside Shift Override</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-semibold shrink-0">
                          {getUserInitials(shift.user?.name || 'U')}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{shift.user?.name || 'Unknown'}</p>
                          {shift.user?.designation && (
                            <p className="text-xs text-muted-foreground">{shift.user.designation}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{shift.shiftStart}</TableCell>
                    <TableCell className="font-mono">{shift.shiftEnd}</TableCell>
                    <TableCell>
                      {shift.workingHours
                        ? `${Math.floor(shift.workingHours)}h ${Math.round((shift.workingHours % 1) * 60)}m`
                        : calculateWorkingHours(shift.shiftStart, shift.shiftEnd)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={shift.breakAllowed ? 'default' : 'outline'}>
                        {shift.breakAllowed ? 'Yes' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {shift.weeklyOff === 'NONE' ? 'None' : formatWeeklyOff(shift.weeklyOff)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={shift.outsideShiftOverride}
                        disabled
                        className="scale-90"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(shift)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                          onClick={() => openDeleteDialog(shift)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Assign Shift Dialog ──────────────────────────────────────── */}
      <ShiftFormDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        title="Assign Shift"
        description="Assign a new work shift to a recruiter."
        users={users}
        initialData={{ ...EMPTY_FORM }}
        submitLabel="Assign Shift"
        onSubmit={handleAssignShift}
      />

      {/* ── Bulk Assign Dialog ────────────────────────────────────────── */}
      <BulkAssignDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        users={users}
        onSubmit={handleBulkAssign}
      />

      {/* ── Edit Shift Dialog ─────────────────────────────────────────── */}
      <ShiftFormDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open)
          if (!open) setEditingShift(null)
        }}
        title="Edit Shift"
        description="Update the shift details for this recruiter."
        users={users}
        initialData={
          editingShift
            ? {
                userId: editingShift.userId,
                shiftStart: editingShift.shiftStart,
                shiftEnd: editingShift.shiftEnd,
                breakAllowed: editingShift.breakAllowed,
                weeklyOff: editingShift.weeklyOff,
                outsideShiftOverride: editingShift.outsideShiftOverride,
              }
            : { ...EMPTY_FORM }
        }
        submitLabel="Update Shift"
        onSubmit={handleEditShift}
      />

      {/* ── Delete Confirmation Dialog ─────────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shift</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the shift for{' '}
              <span className="font-semibold text-foreground">
                {deletingShift?.user?.name || 'this recruiter'}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteShift}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
