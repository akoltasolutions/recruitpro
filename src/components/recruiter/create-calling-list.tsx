'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  PhoneCall, Plus, Trash2, Users, Eye, Pencil, UserPlus, ClipboardPaste,
  GripVertical, Loader2, ListPlus, ArrowLeft, Phone, Clock, CalendarDays,
  ShieldAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import { useAuthStore } from '@/stores/auth-store'
import { format } from 'date-fns'

interface CallList {
  id: string
  name: string
  description: string | null
  source: string
  createdBy: string
  createdAt: string
  googleSheetsUrl: string | null
  googleSheetGid: string | null
  syncInterval: number
  lastSyncedAt: string | null
  candidates: Candidate[]
  assignments: Array<{ recruiter: { id: string; name: string; email: string } }>
}

interface Candidate {
  id: string
  name: string
  phone: string
  email: string | null
  role: string | null
  location: string | null
  company: string | null
  status: string
}

interface ManualEntry {
  name: string
  phone: string
  role: string
  location: string
  company: string
}

const sourceColors: Record<string, string> = {
  MANUAL: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  COPY_PASTE: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  CSV: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  XLSX: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400',
  GOOGLE_SHEETS: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
}

const sourceLabels: Record<string, string> = {
  MANUAL: 'Manual',
  COPY_PASTE: 'Copy-Paste',
  CSV: 'CSV',
  XLSX: 'XLS/XLSX',
  GOOGLE_SHEETS: 'Google Sheets',
}

const emptyManualEntry = (): ManualEntry => ({
  name: '', phone: '', role: '', location: '', company: '',
})

interface Props {
  userId: string
  onNavigate: (page: string) => void
}

export function CreateCallingList({ userId, onNavigate }: Props) {
  const user = useAuthStore((s) => s.user)
  const [view, setView] = useState<'lists' | 'create'>('lists')

  // Lists
  const [callLists, setCallLists] = useState<CallList[]>([])
  const [loading, setLoading] = useState(true)

  // View candidates dialog
  const [candidatesOpen, setCandidatesOpen] = useState(false)
  const [selectedList, setSelectedList] = useState<CallList | null>(null)

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editList, setEditList] = useState<CallList | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState<CallList | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Create form
  const [createTab, setCreateTab] = useState<'manual' | 'paste'>('manual')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // Manual entry
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([emptyManualEntry()])

  // Copy-paste
  const [pasteText, setPasteText] = useState('')
  const [pasteParsed, setPasteParsed] = useState<ManualEntry[]>([])

  const fetchCallLists = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/call-lists')
      const json = await res.json()
      // Client-side filter: only show lists assigned to this recruiter or created by them
      const myLists = (json.callLists || []).filter(
        (l: CallList) =>
          l.createdBy === userId ||
          l.assignments.some((a: { recruiter: { id: string } }) => a.recruiter.id === userId)
      )
      setCallLists(myLists)
    } catch {
      toast.error('Failed to load calling lists')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { fetchCallLists() }, [fetchCallLists])

  // ─── Manual Entry helpers ───
  const updateManualEntry = (index: number, field: keyof ManualEntry, value: string) => {
    setManualEntries(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const addManualRow = () => setManualEntries(prev => [...prev, emptyManualEntry()])

  const removeManualRow = (index: number) => {
    if (manualEntries.length <= 1) return
    setManualEntries(prev => prev.filter((_, i) => i !== index))
  }

  // ─── Copy-Paste helpers ───
  const parsePasteInput = (text: string) => {
    if (!text.trim()) { setPasteParsed([]); return }
    const lines = text.trim().split(/\r?\n/)
    const parsed: ManualEntry[] = []
    for (const line of lines) {
      if (!line.trim()) continue
      const cells = line.split(/\t|,/).map(c => c.trim())
      if (cells.length >= 2) {
        parsed.push({
          name: cells[0] || '',
          phone: cells[1] || '',
          role: cells[2] || '',
          location: cells[3] || '',
          company: cells[4] || '',
        })
      }
    }
    setPasteParsed(parsed)
  }

  const handlePasteChange = (value: string) => {
    setPasteText(value)
    parsePasteInput(value)
  }

  // ─── Create handlers ───
  const handleCreateWithManual = async () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    const valid = manualEntries.filter(e => e.name.trim() && e.phone.trim())
    if (valid.length === 0) { toast.error('Add at least one candidate with name and phone'); return }

    const candidates = valid.map(e => ({
      name: e.name.trim(),
      phone: e.phone.trim(),
      email: null,
      role: e.role.trim() || null,
      location: e.location.trim() || null,
      company: e.company.trim() || null,
    }))

    setSaving(true)
    try {
      const res = await authFetch('/api/call-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          source: 'MANUAL',
          createdBy: userId,
          candidates,
          autoAssignRecruiter: true, // tells API to auto-assign to this recruiter
        }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed to create list'); return }
      toast.success(`Calling list created with ${candidates.length} candidates and assigned to you!`)
      resetCreateForm()
      setView('lists')
      fetchCallLists()
    } catch { toast.error('Something went wrong') }
    finally { setSaving(false) }
  }

  const handleCreateWithPaste = async () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    const valid = pasteParsed.filter(e => e.name.trim() && e.phone.trim())
    if (valid.length === 0) { toast.error('No valid candidates found. Ensure each line has Name, Phone.'); return }

    const seen = new Set<string>()
    const unique: ManualEntry[] = []
    for (const entry of valid) {
      const phone = entry.phone.trim()
      if (!seen.has(phone)) { seen.add(phone); unique.push(entry) }
    }

    const candidates = unique.map(e => ({
      name: e.name.trim(),
      phone: e.phone.trim(),
      email: null,
      role: e.role.trim() || null,
      location: e.location.trim() || null,
      company: e.company.trim() || null,
    }))

    setSaving(true)
    try {
      const res = await authFetch('/api/call-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          source: 'COPY_PASTE',
          createdBy: userId,
          candidates,
          autoAssignRecruiter: true,
        }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return }
      const dupes = valid.length - unique.length
      toast.success(`Calling list created with ${candidates.length} candidates${dupes > 0 ? ` (${dupes} duplicates removed)` : ''} and assigned to you!`)
      resetCreateForm()
      setView('lists')
      fetchCallLists()
    } catch { toast.error('Something went wrong') }
    finally { setSaving(false) }
  }

  const resetCreateForm = () => {
    setName('')
    setDescription('')
    setManualEntries([emptyManualEntry()])
    setPasteText('')
    setPasteParsed([])
    setCreateTab('manual')
  }

  // ─── Edit ───
  const openEditDialog = (list: CallList) => {
    setEditList(list)
    setEditName(list.name)
    setEditDescription(list.description || '')
    setEditOpen(true)
  }

  const handleEditSave = async () => {
    if (!editList || !editName.trim()) return
    setEditSaving(true)
    try {
      const res = await authFetch(`/api/call-lists/${editList.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), description: editDescription.trim() }),
      })
      if (!res.ok) { toast.error('Failed to update list'); return }
      toast.success('List updated')
      setEditOpen(false)
      fetchCallLists()
    } catch { toast.error('Something went wrong') }
    finally { setEditSaving(false) }
  }

  // ─── Delete ───
  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      const res = await authFetch(`/api/call-lists/${confirmDelete.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete'); return }
      toast.success('Calling list deleted')
      fetchCallLists()
    } catch { toast.error('Something went wrong') }
    finally { setConfirmDelete(null); setDeleting(false) }
  }

  // ─── Render ───

  // Permission gate
  if (!user?.createListPermission) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-4 max-w-md">
            <div className="flex items-center justify-center h-16 w-16 rounded-full bg-amber-100 text-amber-600 mx-auto">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Access Restricted</h2>
              <p className="text-sm text-muted-foreground mt-1">
                You don&apos;t have permission to create calling lists. Please contact your administrator to request access.
              </p>
            </div>
            <Button variant="outline" onClick={() => onNavigate('home')}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Home
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // CREATE VIEW
  if (view === 'create') {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => { resetCreateForm(); setView('lists') }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </div>

        <PageHeader
          title="Create Calling List"
          description="Create a new calling list with candidates. The list will be automatically assigned to you."
          icon={ListPlus}
        />

        <div className="mt-6 space-y-6">
          {/* List info */}
          <div className="rounded-lg border p-4 md:p-6 space-y-4 bg-card">
            <div className="space-y-2">
              <Label htmlFor="list-name">List Name *</Label>
              <Input
                id="list-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Tech Hiring - July 2025"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="list-desc">Description</Label>
              <Textarea
                id="list-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional description for this calling list"
                rows={2}
              />
            </div>
          </div>

          {/* Tabs: Manual Entry / Copy-Paste */}
          <div className="rounded-lg border p-4 md:p-6 bg-card">
            <Tabs value={createTab} onValueChange={(v) => setCreateTab(v as 'manual' | 'paste')} className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="manual" className="flex-1 gap-1.5">
                  <UserPlus className="h-4 w-4" /> Manual Entry
                </TabsTrigger>
                <TabsTrigger value="paste" className="flex-1 gap-1.5">
                  <ClipboardPaste className="h-4 w-4" /> Copy-Paste Input
                </TabsTrigger>
              </TabsList>

              {/* Manual Entry Tab */}
              <TabsContent value="manual" className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Add candidates one by one</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {manualEntries.filter(e => e.name.trim() && e.phone.trim()).length} valid
                    </Badge>
                    <Button variant="outline" size="sm" onClick={addManualRow}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {manualEntries.map((entry, index) => (
                    <div key={index} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center justify-center pt-2 text-muted-foreground">
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Name *</Label>
                          <Input
                            value={entry.name}
                            onChange={e => updateManualEntry(index, 'name', e.target.value)}
                            placeholder="Full name"
                            className="h-11 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Phone *</Label>
                          <Input
                            value={entry.phone}
                            onChange={e => updateManualEntry(index, 'phone', e.target.value)}
                            placeholder="Phone number"
                            className="h-11 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Role</Label>
                          <Input
                            value={entry.role}
                            onChange={e => updateManualEntry(index, 'role', e.target.value)}
                            placeholder="Job role"
                            className="h-11 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Location</Label>
                          <Input
                            value={entry.location}
                            onChange={e => updateManualEntry(index, 'location', e.target.value)}
                            placeholder="City"
                            className="h-11 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Company</Label>
                          <Input
                            value={entry.company}
                            onChange={e => updateManualEntry(index, 'company', e.target.value)}
                            placeholder="Company name"
                            className="h-11 text-sm"
                          />
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 text-muted-foreground hover:text-red-600 shrink-0"
                        onClick={() => removeManualRow(index)}
                        disabled={manualEntries.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleCreateWithManual}
                    disabled={saving || !name.trim() || !manualEntries.some(e => e.name.trim() && e.phone.trim())}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                    Create List ({manualEntries.filter(e => e.name.trim() && e.phone.trim()).length} candidates)
                  </Button>
                </div>
              </TabsContent>

              {/* Copy-Paste Tab */}
              <TabsContent value="paste" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Paste Data</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => { setPasteText(''); setPasteParsed([]) }}
                    >
                      Clear
                    </Button>
                  </div>
                  <Textarea
                    value={pasteText}
                    onChange={e => handlePasteChange(e.target.value)}
                    placeholder={"Paste data here. Each line = one candidate.\n\nSupported formats:\n\u2022 Tab-separated (copied from Excel/Sheets)\n\u2022 Comma-separated (CSV)\n\nColumn order: Name, Phone, Role, Location, Company\n\nExample:\nJohn Doe\t9876543210\tDeveloper\tBangalore\tAcme\nJane Smith\t9876543211\tDesigner\tMumbai\tBeta"}
                    rows={8}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste from Excel, Google Sheets, or any tab/comma-separated source. First two columns must be <strong>Name</strong> and <strong>Phone</strong>.
                  </p>
                </div>

                {pasteParsed.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">
                          Preview ({pasteParsed.length} {pasteParsed.length === 1 ? 'row' : 'rows'} parsed)
                        </Label>
                        <Badge variant="secondary" className="text-xs">
                          {pasteParsed.filter(e => e.name.trim() && e.phone.trim()).length} valid
                        </Badge>
                      </div>
                      <div className="rounded-md border overflow-auto max-h-48">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">#</TableHead>
                              <TableHead className="text-xs">Name</TableHead>
                              <TableHead className="text-xs">Phone</TableHead>
                              <TableHead className="text-xs hidden sm:table-cell">Role</TableHead>
                              <TableHead className="text-xs hidden lg:table-cell">Location</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pasteParsed.slice(0, 10).map((row, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                                <TableCell className="text-xs font-medium">{row.name || <span className="text-red-500">Missing</span>}</TableCell>
                                <TableCell className="text-xs">{row.phone || <span className="text-red-500">Missing</span>}</TableCell>
                                <TableCell className="text-xs hidden sm:table-cell">{row.role || '-'}</TableCell>
                                <TableCell className="text-xs hidden lg:table-cell">{row.location || '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {pasteParsed.length > 10 && (
                        <p className="text-xs text-muted-foreground">... and {pasteParsed.length - 10} more rows</p>
                      )}
                    </div>
                  </>
                )}

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleCreateWithPaste}
                    disabled={saving || !name.trim() || pasteParsed.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                    Create List ({pasteParsed.filter(e => e.name.trim() && e.phone.trim()).length} candidates)
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    )
  }

  // LISTS VIEW (default)
  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="My Calling Lists"
        description="Manage your calling lists. Create new lists or use existing ones for dialing."
        icon={PhoneCall}
      >
        <Button onClick={() => setView('create')} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-2" /> Create Calling List
        </Button>
      </PageHeader>

      <div className="mt-2">
        <Button variant="outline" size="sm" className="text-emerald-600" onClick={() => onNavigate('pending')}>
          <Clock className="h-4 w-4 mr-1.5" /> Start Dialing
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3 mt-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : callLists.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title="No calling lists yet"
          description="Create your first calling list to start making calls"
          actionLabel="Create Calling List"
          onAction={() => setView('create')}
        />
      ) : (
        <div className="space-y-3 mt-4">
          {callLists.map(list => {
            const pending = list.candidates.filter(c => c.status === 'PENDING').length
            const done = list.candidates.filter(c => c.status === 'DONE').length
            const scheduled = list.candidates.filter(c => c.status === 'SCHEDULED').length
            const total = list.candidates.length
            return (
              <div key={list.id} className="rounded-lg border p-4 hover:shadow-sm transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{list.name}</h3>
                      <Badge className={sourceColors[list.source] || ''}>{sourceLabels[list.source] || list.source}</Badge>
                    </div>
                    {list.description && <p className="text-sm text-muted-foreground truncate">{list.description}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {total} candidates</span>
                      <span className="text-emerald-600 font-medium">{pending} pending</span>
                      <span className="text-blue-600 font-medium">{done} done</span>
                      {scheduled > 0 && <span className="text-amber-600 font-medium">{scheduled} scheduled</span>}
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {format(new Date(list.createdAt), 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSelectedList(list); setCandidatesOpen(true) }}
                    >
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(list)}>
                      <Pencil className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => setConfirmDelete(list)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* View Candidates Dialog */}
      <Dialog open={candidatesOpen} onOpenChange={setCandidatesOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {selectedList?.name} — Candidates
            </DialogTitle>
          </DialogHeader>
          {selectedList && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Badge variant="secondary">{selectedList.candidates.length} total</Badge>
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">{selectedList.candidates.filter(c => c.status === 'PENDING').length} pending</Badge>
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">{selectedList.candidates.filter(c => c.status === 'DONE').length} done</Badge>
              </div>
              <div className="rounded-md border overflow-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Phone</TableHead>
                      <TableHead className="text-xs hidden sm:table-cell">Role</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Location</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Company</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedList.candidates.map((c, i) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-xs font-medium">{c.name}</TableCell>
                        <TableCell className="text-xs">{c.phone}</TableCell>
                        <TableCell className="text-xs hidden sm:table-cell">{c.role || '-'}</TableCell>
                        <TableCell className="text-xs hidden md:table-cell">{c.location || '-'}</TableCell>
                        <TableCell className="text-xs hidden lg:table-cell">{c.company || '-'}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${c.status === 'PENDING' ? 'text-amber-600' : c.status === 'DONE' ? 'text-emerald-600' : 'text-blue-600'}`}
                          >
                            {c.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Calling List</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>List Name *</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={handleEditSave}
              disabled={editSaving || !editName.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {editSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Calling List</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{confirmDelete?.name}</strong>? This will permanently remove the list and all its candidates. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
