'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  PhoneCall, Plus, Trash2, Users, Eye, FileSpreadsheet, Pencil, FileText,
  UserPlus, ClipboardPaste, GripVertical, Link, RefreshCw, Globe, Loader2,
} from 'lucide-react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import { format, formatDistanceToNow } from 'date-fns'

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

interface User {
  id: string
  name: string
  email: string
  isActive: boolean
}

interface ManualEntry {
  name: string
  phone: string
  role: string
  location: string
  company: string
}

const columnFields = [
  { value: 'name', label: 'Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'role', label: 'Role' },
  { value: 'location', label: 'Location' },
  { value: 'company', label: 'Company' },
]

const gsColumnFields = [
  { value: 'name', label: 'Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'role', label: 'Role' },
  { value: 'location', label: 'Location' },
]

const emptyManualEntry = (): ManualEntry => ({
  name: '', phone: '', role: '', location: '', company: '',
})

export function CallListManagement({ userId }: { userId: string }) {
  const [callLists, setCallLists] = useState<CallList[]>([])
  const [recruiters, setRecruiters] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [candidatesOpen, setCandidatesOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<CallList | null>(null)
  const [selectedList, setSelectedList] = useState<CallList | null>(null)
  const [selectedRecruiters, setSelectedRecruiters] = useState<string[]>([])

  // Edit state
  const [editOpen, setEditOpen] = useState(false)
  const [editList, setEditList] = useState<CallList | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  // Create form
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  // Create tab state
  const [createTab, setCreateTab] = useState<'manual' | 'paste'>('manual')

  // Manual entry state
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([emptyManualEntry()])

  // Copy-paste state
  const [pasteText, setPasteText] = useState('')
  const [pasteParsed, setPasteParsed] = useState<ManualEntry[]>([])
  const [pasteColumns, setPasteColumns] = useState<string[]>([])

  // Upload state
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([])
  const [csvColumns, setCsvColumns] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [uploadSource, setUploadSource] = useState<string>('CSV')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const xlsxInputRef = useRef<HTMLInputElement>(null)

  // Google Sheets state
  const [gsOpen, setGsOpen] = useState(false)
  const [gsUrl, setGsUrl] = useState('')
  const [gsGid, setGsGid] = useState('0')
  const [gsFetching, setGsFetching] = useState(false)
  const [gsColumns, setGsColumns] = useState<string[]>([])
  const [gsRows, setGsRows] = useState<Record<string, string>[]>([])
  const [gsMapping, setGsMapping] = useState<Record<string, string>>({})
  const [gsAutoSync, setGsAutoSync] = useState(false)
  const [gsSyncInterval, setGsSyncInterval] = useState('30') // minutes
  const [gsSyncing, setGsSyncing] = useState<string | null>(null) // callListId being synced

  const fetchCallLists = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/call-lists')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setCallLists(json.callLists || [])
    } catch { toast.error('Failed to load call lists') }
    finally { setLoading(false) }
  }, [])

  const fetchRecruiters = useCallback(async () => {
    try {
      const res = await authFetch('/api/users')
      if (!res.ok) return
      const json = await res.json()
      setRecruiters(json.users || [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchCallLists(); fetchRecruiters() }, [fetchCallLists, fetchRecruiters])

  // ─── Google Sheets auto-sync useEffect ───
  useEffect(() => {
    if (callLists.length === 0) return
    const gsLists = callLists.filter(l => l.source === 'GOOGLE_SHEETS' && l.syncInterval > 0)
    if (gsLists.length === 0) return

    const minInterval = Math.min(...gsLists.map(l => l.syncInterval))
    const intervalMs = minInterval * 60 * 1000

    const syncAll = async () => {
      for (const list of gsLists) {
        try {
          await authFetch(`/api/call-lists/${list.id}/sync`, { method: 'POST' })
        } catch { /* silent */ }
      }
      fetchCallLists()
    }

    const timer = setInterval(syncAll, intervalMs)
    return () => clearInterval(timer)
  }, [callLists, fetchCallLists])

  // ─── Manual Entry helpers ───
  const updateManualEntry = (index: number, field: keyof ManualEntry, value: string) => {
    setManualEntries(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const addManualRow = () => {
    setManualEntries(prev => [...prev, emptyManualEntry()])
  }

  const removeManualRow = (index: number) => {
    if (manualEntries.length <= 1) return
    setManualEntries(prev => prev.filter((_, i) => i !== index))
  }

  const handleCreateWithManual = async () => {
    if (!name) { toast.error('Name is required'); return }
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
        body: JSON.stringify({ name, description, source: 'MANUAL', createdBy: userId, candidates }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return }
      toast.success(`Call list created with ${candidates.length} candidates`)
      setCreateOpen(false)
      resetCreateForm()
      fetchCallLists()
    } catch { toast.error('Something went wrong') }
    finally { setSaving(false) }
  }

  // ─── Copy-Paste helpers ───
  const parsePasteInput = (text: string) => {
    if (!text.trim()) { setPasteParsed([]); setPasteColumns([]); return }

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
    setPasteColumns(parsed.length > 0 ? Object.keys(parsed[0]) : [])
  }

  const handlePasteChange = (value: string) => {
    setPasteText(value)
    parsePasteInput(value)
  }

  const handleCreateWithPaste = async () => {
    if (!name) { toast.error('Name is required'); return }
    const valid = pasteParsed.filter(e => e.name.trim() && e.phone.trim())
    if (valid.length === 0) { toast.error('No valid candidates found. Ensure each line has Name, Phone (tab or comma separated).'); return }

    const seen = new Set<string>()
    const unique: ManualEntry[] = []
    for (const entry of valid) {
      const phone = entry.phone.trim()
      if (!seen.has(phone)) {
        seen.add(phone)
        unique.push(entry)
      }
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
        body: JSON.stringify({ name, description, source: 'COPY_PASTE', createdBy: userId, candidates }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return }
      const dupes = valid.length - unique.length
      toast.success(`Call list created with ${candidates.length} candidates${dupes > 0 ? ` (${dupes} duplicates removed)` : ''}`)
      setCreateOpen(false)
      resetCreateForm()
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
    setPasteColumns([])
  }

  const handleCreateOpen = (tab?: 'manual' | 'paste') => {
    resetCreateForm()
    setCreateTab(tab || 'manual')
    setCreateOpen(true)
  }

  // ─── Delete ───
  const handleDelete = async () => {
    if (!confirmDelete) return
    const listId = confirmDelete.id
    const listName = confirmDelete.name
    setConfirmDelete(null)
    try {
      const res = await authFetch(`/api/call-lists/${listId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || `Failed to delete "${listName}"`)
        return
      }
      toast.success(`"${listName}" deleted successfully`)
      fetchCallLists()
    } catch {
      toast.error('Something went wrong while deleting')
    }
  }

  // ─── CSV / XLSX upload ───
  const autoDetectMapping = (cols: string[]) => {
    const mapping: Record<string, string> = {}
    cols.forEach(col => {
      const lower = col.toLowerCase()
      if (lower.includes('name') && !lower.includes('client') && !lower.includes('company')) mapping[col] = 'name'
      else if (lower.includes('phone') || lower.includes('mobile') || lower.includes('number')) mapping[col] = 'phone'
      else if (lower.includes('email') || lower.includes('mail')) mapping[col] = 'email'
      else if (lower.includes('role') || lower.includes('position') || lower.includes('title') || lower.includes('job')) mapping[col] = 'role'
      else if (lower.includes('location') || lower.includes('city') || lower.includes('place')) mapping[col] = 'location'
      else if (lower.includes('company') || lower.includes('org') || lower.includes('employer')) mapping[col] = 'company'
    })
    return mapping
  }

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadSource('CSV')

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const cols = results.meta.fields || []
        setCsvColumns(cols)
        setParsedData(results.data as Record<string, string>[])
        setColumnMapping(autoDetectMapping(cols))
        toast.success(`Parsed ${results.data.length} rows from CSV`)
      },
      error: () => toast.error('Failed to parse CSV file'),
    })
  }

  const handleXLSXUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadSource('XLSX')

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        if (!firstSheetName) { toast.error('The workbook has no sheets'); return }
        const worksheet = workbook.Sheets[firstSheetName]
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, { defval: '' })

        if (jsonData.length === 0) { toast.error('The sheet is empty'); return }

        const cols = Object.keys(jsonData[0])
        setCsvColumns(cols)
        setParsedData(jsonData)
        setColumnMapping(autoDetectMapping(cols))

        const sheetCount = workbook.SheetNames.length
        toast.success(`Parsed ${jsonData.length} rows from ${file.name}${sheetCount > 1 ? ` (Sheet: ${firstSheetName}, ${sheetCount} sheets total)` : ''}`)
      } catch { toast.error('Failed to parse XLS/XLSX file') }
    }
    reader.onerror = () => toast.error('Failed to read file')
    reader.readAsArrayBuffer(file)
  }

  const handleImportCSV = async () => {
    if (parsedData.length === 0) { toast.error('No data to import'); return }
    if (!name) { toast.error('Enter a name for the call list'); return }

    const seen = new Set<string>()
    const uniqueData = parsedData.filter(row => {
      const phone = String(row[columnMapping.phone] || '').trim()
      if (!phone || seen.has(phone)) return false
      seen.add(phone)
      return true
    })

    const candidates = uniqueData.map(row => ({
      name: columnMapping.name && columnMapping.name !== 'SKIP' ? String(row[columnMapping.name] || '').trim() : '',
      phone: columnMapping.phone && columnMapping.phone !== 'SKIP' ? String(row[columnMapping.phone] || '').trim() : '',
      email: columnMapping.email && columnMapping.email !== 'SKIP' ? String(row[columnMapping.email] || '').trim() || null : null,
      role: columnMapping.role && columnMapping.role !== 'SKIP' ? String(row[columnMapping.role] || '').trim() || null : null,
      location: columnMapping.location && columnMapping.location !== 'SKIP' ? String(row[columnMapping.location] || '').trim() || null : null,
      company: columnMapping.company && columnMapping.company !== 'SKIP' ? String(row[columnMapping.company] || '').trim() || null : null,
    })).filter(c => c.name && c.phone)

    if (candidates.length === 0) { toast.error('No valid candidates found. Check your column mapping.'); return }

    setSaving(true)
    try {
      const res = await authFetch('/api/call-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, source: uploadSource, createdBy: userId, candidates }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return }
      toast.success(`Imported ${candidates.length} candidates (${parsedData.length - uniqueData.length} duplicates removed)`)
      setUploadOpen(false)
      setName('')
      setDescription('')
      setParsedData([])
      setCsvColumns([])
      setColumnMapping({})
      fetchCallLists()
    } catch { toast.error('Something went wrong') }
    finally { setSaving(false) }
  }

  // ─── Google Sheets ───
  const handleGsOpen = () => {
    setGsUrl('')
    setGsGid('0')
    setGsFetching(false)
    setGsColumns([])
    setGsRows([])
    setGsMapping({})
    setGsAutoSync(false)
    setGsSyncInterval('30')
    setName('')
    setDescription('')
    setGsOpen(true)
  }

  const handleGsClose = () => {
    setGsUrl('')
    setGsGid('0')
    setGsFetching(false)
    setGsColumns([])
    setGsRows([])
    setGsMapping({})
    setGsAutoSync(false)
    setGsSyncInterval('30')
    setGsOpen(false)
  }

  const handleGsFetch = async () => {
    if (!gsUrl.trim()) { toast.error('Please enter a Google Sheets URL'); return }
    setGsFetching(true)
    try {
      const res = await authFetch('/api/google-sheets/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: gsUrl.trim(), gid: gsGid.trim() || '0' }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Failed to fetch Google Sheet')
        return
      }
      setGsColumns(json.columns || [])
      setGsRows(json.rows || [])
      setGsMapping(autoDetectMapping(json.columns || []))
      toast.success(`Fetched ${json.rows?.length || 0} rows from Google Sheet`)
    } catch {
      toast.error('Failed to fetch Google Sheet. Check the URL and try again.')
    } finally {
      setGsFetching(false)
    }
  }

  const handleGsImport = async () => {
    if (gsRows.length === 0) { toast.error('No data to import'); return }
    if (!name) { toast.error('Enter a name for the call list'); return }

    const seen = new Set<string>()
    const uniqueData = gsRows.filter(row => {
      const phone = String(row[gsMapping.phone] || '').trim()
      if (!phone || seen.has(phone)) return false
      seen.add(phone)
      return true
    })

    const candidates = uniqueData.map(row => ({
      name: gsMapping.name ? String(row[gsMapping.name] || '').trim() : '',
      phone: gsMapping.phone ? String(row[gsMapping.phone] || '').trim() : '',
      role: gsMapping.role ? String(row[gsMapping.role] || '').trim() || null : null,
      location: gsMapping.location ? String(row[gsMapping.location] || '').trim() || null : null,
    })).filter(c => c.name && c.phone)

    if (candidates.length === 0) { toast.error('No valid candidates found. Check your column mapping.'); return }

    setSaving(true)
    try {
      const res = await authFetch('/api/call-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          source: 'GOOGLE_SHEETS',
          createdBy: userId,
          candidates,
          googleSheetsUrl: gsUrl.trim(),
          googleSheetGid: gsGid.trim() || '0',
          syncInterval: gsAutoSync ? Number(gsSyncInterval) : 0,
        }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return }
      toast.success(`Imported ${candidates.length} candidates from Google Sheets (${gsRows.length - uniqueData.length} duplicates removed)`)
      handleGsClose()
      fetchCallLists()
    } catch { toast.error('Something went wrong') }
    finally { setSaving(false) }
  }

  const handleGsSync = async (listId: string) => {
    setGsSyncing(listId)
    try {
      const res = await authFetch(`/api/call-lists/${listId}/sync`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Sync failed')
        return
      }
      toast.success(`Sync complete: ${json.created} created, ${json.updated} updated (${json.total} total)`)
      fetchCallLists()
    } catch {
      toast.error('Failed to sync')
    } finally {
      setGsSyncing(null)
    }
  }

  // ─── Assign ───
  const openAssignDialog = (list: CallList) => {
    setSelectedList(list)
    setSelectedRecruiters(list.assignments.map(a => a.recruiter.id))
    setAssignOpen(true)
  }

  const handleAssign = async () => {
    if (!selectedList) return
    try {
      const res = await authFetch(`/api/call-lists/${selectedList.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recruiterIds: selectedRecruiters }),
      })
      if (!res.ok) { toast.error('Failed to assign'); return }
      toast.success('Recruiters assigned')
      setAssignOpen(false)
      fetchCallLists()
    } catch { toast.error('Something went wrong') }
  }

  const toggleRecruiter = (id: string) => {
    setSelectedRecruiters(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    )
  }

  // ─── Edit ───
  const openEditDialog = (list: CallList) => {
    setEditList(list)
    setEditName(list.name)
    setEditDescription(list.description || '')
    setEditOpen(true)
  }

  const handleEditSave = async () => {
    if (!editList || !editName) return
    setEditSaving(true)
    try {
      const res = await authFetch(`/api/call-lists/${editList.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDescription }),
      })
      if (!res.ok) { toast.error('Failed to update call list'); return }
      toast.success('Call list updated')
      setEditOpen(false)
      fetchCallLists()
    } catch { toast.error('Something went wrong') }
    finally { setEditSaving(false) }
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

  const formatSyncInterval = (minutes: number): string => {
    if (minutes >= 1440) return `${minutes / 1440} day${minutes / 1440 !== 1 ? 's' : ''}`
    if (minutes >= 60) return `${minutes / 60} hour${minutes / 60 !== 1 ? 's' : ''}`
    return `${minutes} min`
  }

  return (
    <div>
      <PageHeader title="Call List Management" description="Manage candidate lists for calling" icon={PhoneCall}>
        <Button variant="outline" onClick={() => { setName(''); setDescription(''); setUploadSource('CSV'); setUploadOpen(true) }}>
          <FileText className="h-4 w-4 mr-2" /> Import CSV
        </Button>
        <Button variant="outline" onClick={() => { setName(''); setDescription(''); setUploadSource('XLSX'); setUploadOpen(true) }}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Import XLS/XLSX
        </Button>
        <Button variant="outline" onClick={handleGsOpen}>
          <Globe className="h-4 w-4 mr-2" /> Google Sheets
        </Button>
        <Button onClick={() => handleCreateOpen('manual')} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-2" /> Create List (Manual)
        </Button>
      </PageHeader>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : callLists.length === 0 ? (
        <EmptyState icon={PhoneCall} title="No call lists" description="Create or import a call list to get started" actionLabel="Create List" onAction={() => handleCreateOpen('manual')} />
      ) : (
        <div className="space-y-3">
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
                      {list.source === 'GOOGLE_SHEETS' && (
                        <Badge variant="outline" className="text-xs">
                          Auto-sync: {list.syncInterval > 0 ? `every ${formatSyncInterval(list.syncInterval)}` : 'disabled'}
                        </Badge>
                      )}
                    </div>
                    {list.description && <p className="text-sm text-muted-foreground truncate">{list.description}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {total} candidates</span>
                      <span className="text-emerald-600 font-medium">{pending} pending</span>
                      <span className="text-blue-600 font-medium">{done} done</span>
                      {scheduled > 0 && <span className="text-amber-600 font-medium">{scheduled} scheduled</span>}
                      <span>Created {format(new Date(list.createdAt), 'MMM dd, yyyy')}</span>
                      {list.source === 'GOOGLE_SHEETS' && list.lastSyncedAt && (
                        <span className="text-blue-500">Last synced: {formatDistanceToNow(new Date(list.lastSyncedAt), { addSuffix: true })}</span>
                      )}
                    </div>
                    {list.assignments.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">Assigned:</span>
                        {list.assignments.map(a => (
                          <Badge key={a.recruiter.id} variant="secondary" className="text-xs">{a.recruiter.name}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedList(list); setCandidatesOpen(true) }}>
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(list)}>
                      <Pencil className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    {list.source === 'GOOGLE_SHEETS' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleGsSync(list.id)}
                        disabled={gsSyncing === list.id}
                      >
                        {gsSyncing === list.id
                          ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          : <RefreshCw className="h-4 w-4 mr-1" />
                        }
                        Sync
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openAssignDialog(list)}>
                      <Users className="h-4 w-4 mr-1" /> Assign
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => setConfirmDelete(list)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══════════ Create List Dialog (Manual Entry + Copy-Paste) ═══════════ */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) resetCreateForm(); setCreateOpen(open) }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Call List</DialogTitle></DialogHeader>

          <div className="space-y-4 py-2">
            {/* Shared: list name & description */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>List Name *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Tech Hiring - July 2025" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={2} />
              </div>
            </div>

            <Separator />

            {/* Tabs: Manual Entry / Copy-Paste */}
            <Tabs value={createTab} onValueChange={(v) => setCreateTab(v as 'manual' | 'paste')} className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="manual" className="flex-1 gap-1.5">
                  <UserPlus className="h-4 w-4" /> Manual Entry
                </TabsTrigger>
                <TabsTrigger value="paste" className="flex-1 gap-1.5">
                  <ClipboardPaste className="h-4 w-4" /> Copy-Paste Input
                </TabsTrigger>
              </TabsList>

              {/* ─── Manual Entry Tab ─── */}
              <TabsContent value="manual" className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Add candidates one by one</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{manualEntries.filter(e => e.name.trim() && e.phone.trim()).length} valid</Badge>
                    <Button variant="outline" size="sm" onClick={addManualRow}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {manualEntries.map((entry, index) => (
                    <div key={index} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center justify-center pt-2 text-muted-foreground">
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Name *</Label>
                          <Input value={entry.name} onChange={e => updateManualEntry(index, 'name', e.target.value)} placeholder="Full name" className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Phone *</Label>
                          <Input value={entry.phone} onChange={e => updateManualEntry(index, 'phone', e.target.value)} placeholder="Phone number" className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Role</Label>
                          <Input value={entry.role} onChange={e => updateManualEntry(index, 'role', e.target.value)} placeholder="Job role" className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Location</Label>
                          <Input value={entry.location} onChange={e => updateManualEntry(index, 'location', e.target.value)} placeholder="City" className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Company</Label>
                          <Input value={entry.company} onChange={e => updateManualEntry(index, 'company', e.target.value)} placeholder="Company name" className="h-8 text-sm" />
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
              </TabsContent>

              {/* ─── Copy-Paste Input Tab ─── */}
              <TabsContent value="paste" className="mt-4 space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Paste Data</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => { setPasteText(''); setPasteParsed([]); setPasteColumns([]) }}
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
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetCreateForm(); setCreateOpen(false) }}>Cancel</Button>
            <Button
              onClick={createTab === 'manual' ? handleCreateWithManual : handleCreateWithPaste}
              disabled={saving || !name || (createTab === 'manual' ? !manualEntries.some(e => e.name.trim() && e.phone.trim()) : pasteParsed.length === 0)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? 'Creating...' : createTab === 'manual'
                ? `Create with ${manualEntries.filter(e => e.name.trim() && e.phone.trim()).length} Candidate${manualEntries.filter(e => e.name.trim() && e.phone.trim()).length !== 1 ? 's' : ''}`
                : `Create with ${pasteParsed.filter(e => e.name.trim() && e.phone.trim()).length} Candidate${pasteParsed.filter(e => e.name.trim() && e.phone.trim()).length !== 1 ? 's' : ''}`
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Upload Dialog (CSV / XLSX) ═══════════ */}
      <Dialog open={uploadOpen} onOpenChange={(open) => { setUploadOpen(open); if (!open) { setParsedData([]); setCsvColumns([]); setColumnMapping({}); setUploadSource('CSV') } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {uploadSource === 'XLSX' ? <FileSpreadsheet className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              Import from {uploadSource === 'XLSX' ? 'XLS/XLSX' : 'CSV'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>List Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Name for this call list" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={2} /></div>
            <div className="space-y-2">
              <Label>Upload {uploadSource === 'XLSX' ? 'Excel' : 'CSV'} File</Label>
              {uploadSource === 'XLSX' ? (
                <Input ref={xlsxInputRef} type="file" accept=".xls,.xlsx" onChange={handleXLSXUpload} />
              ) : (
                <Input ref={fileInputRef} type="file" accept=".csv" onChange={handleCSVUpload} />
              )}
              <p className="text-xs text-muted-foreground">
                {uploadSource === 'XLSX'
                  ? 'Supports .xls and .xlsx files. First sheet will be used. Headers must be in the first row.'
                  : 'Supports .csv files with headers in the first row.'
                }
              </p>
            </div>

            {csvColumns.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Column Mapping ({parsedData.length} rows)</Label>
                  <div className="grid gap-2">
                    {columnFields.map(field => (
                      <div key={field.value} className="flex items-center gap-2">
                        <Label className="w-24 text-sm shrink-0">{field.label}</Label>
                        <select
                          value={columnMapping[field.value] || ''}
                          onChange={(e) => setColumnMapping(prev => ({ ...prev, [field.value]: e.target.value }))}
                          className="flex-1 h-9 px-3 rounded-md border border-input bg-transparent text-sm"
                        >
                          <option value="">Select column</option>
                          <option value="SKIP" className="text-muted-foreground">— Skip —</option>
                          {csvColumns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Preview (first 5 rows)</Label>
                  <div className="rounded-md border overflow-auto max-h-48">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {csvColumns.map(col => <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.slice(0, 5).map((row, i) => (
                          <TableRow key={i}>
                            {csvColumns.map(col => <TableCell key={col} className="text-xs py-1.5 whitespace-nowrap">{String(row[col] || '')}</TableCell>)}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleImportCSV} disabled={saving || parsedData.length === 0 || !name} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Importing...' : `Import ${parsedData.length} Candidates`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Google Sheets Import Dialog ═══════════ */}
      <Dialog open={gsOpen} onOpenChange={(open) => { if (!open) handleGsClose() }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600" />
              Import from Google Sheets
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Section 1: List Name & Description */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>List Name *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Tech Hiring - July 2025" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={2} />
              </div>
            </div>

            <Separator />

            {/* Section 2: Google Sheets URL */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Google Sheets URL</Label>
              <div className="space-y-2">
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={gsUrl}
                    onChange={e => setGsUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="pl-10"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm shrink-0 whitespace-nowrap">Sheet GID (tab #)</Label>
                  <Input
                    value={gsGid}
                    onChange={e => setGsGid(e.target.value)}
                    placeholder="0"
                    className="w-24"
                  />
                  <Button
                    onClick={handleGsFetch}
                    disabled={gsFetching || !gsUrl.trim()}
                    variant="outline"
                    className="shrink-0"
                  >
                    {gsFetching ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Fetching...</>
                    ) : (
                      <><Link className="h-4 w-4 mr-2" /> Fetch Sheet</>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste a Google Sheets link. The sheet must be published to the web (File &rarr; Share &rarr; Publish to web).
                </p>
              </div>
            </div>

            {/* Section 3: Data Preview (shown after successful fetch) */}
            {gsColumns.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Data Preview</Label>
                    <Badge variant="secondary" className="text-xs">{gsRows.length} rows</Badge>
                  </div>
                  <div className="rounded-md border overflow-auto max-h-48">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {gsColumns.map(col => <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gsRows.slice(0, 5).map((row, i) => (
                          <TableRow key={i}>
                            {gsColumns.map(col => (
                              <TableCell key={col} className="text-xs py-1.5 whitespace-nowrap max-w-[200px] truncate">
                                {String(row[col] || '')}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {gsRows.length > 5 && (
                    <p className="text-xs text-muted-foreground">... and {gsRows.length - 5} more rows</p>
                  )}
                </div>

                {/* Section 4: Column Mapping */}
                <Separator />
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Column Mapping</Label>
                  <p className="text-xs text-muted-foreground">Map your sheet columns to the system fields below.</p>
                  <div className="grid gap-2">
                    {gsColumnFields.map(field => (
                      <div key={field.value} className="flex items-center gap-2">
                        <Label className="w-24 text-sm shrink-0">{field.label}</Label>
                        <select
                          value={gsMapping[field.value] || ''}
                          onChange={(e) => setGsMapping(prev => ({ ...prev, [field.value]: e.target.value }))}
                          className="flex-1 h-9 px-3 rounded-md border border-input bg-transparent text-sm"
                        >
                          <option value="">Select column</option>
                          <option value="SKIP" className="text-muted-foreground">— Skip —</option>
                          {gsColumns.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 5: Auto Sync Settings */}
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Auto Sync Settings</Label>
                    <Switch
                      checked={gsAutoSync}
                      onCheckedChange={setGsAutoSync}
                    />
                  </div>
                  {gsAutoSync && (
                    <div className="flex items-center gap-2">
                      <Label className="text-sm shrink-0">Sync interval</Label>
                      <select
                        value={gsSyncInterval}
                        onChange={(e) => setGsSyncInterval(e.target.value)}
                        className="w-40 h-9 px-3 rounded-md border border-input bg-transparent text-sm"
                      >
                        <option value="5">Every 5 minutes</option>
                        <option value="15">Every 15 minutes</option>
                        <option value="30">Every 30 minutes</option>
                        <option value="60">Every 1 hour</option>
                        <option value="360">Every 6 hours</option>
                        <option value="720">Every 12 hours</option>
                        <option value="1440">Every 24 hours</option>
                      </select>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Automatically sync data from the Google Sheet at the selected interval.
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleGsClose}>Cancel</Button>
            <Button
              onClick={handleGsImport}
              disabled={saving || gsRows.length === 0 || !name}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? 'Importing...' : `Import ${gsRows.length} Candidates`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Candidates Dialog ═══════════ */}
      <Dialog open={candidatesOpen} onOpenChange={setCandidatesOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedList?.name} - Candidates ({selectedList?.candidates.length || 0})</DialogTitle></DialogHeader>
          <div className="rounded-md border overflow-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="hidden sm:table-cell">Role</TableHead>
                  <TableHead className="hidden md:table-cell">Location</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedList?.candidates.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.phone}</TableCell>
                    <TableCell className="hidden sm:table-cell">{c.role || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell">{c.location || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={c.status === 'DONE' ? 'border-emerald-500 text-emerald-700' : c.status === 'SCHEDULED' ? 'border-amber-500 text-amber-700' : 'border-slate-400 text-slate-600'}>
                        {c.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Assign Dialog ═══════════ */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Recruiters to &ldquo;{selectedList?.name}&rdquo;</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-64 overflow-y-auto">
            {recruiters.filter(r => r.isActive).map(r => (
              <div key={r.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                <Checkbox checked={selectedRecruiters.includes(r.id)} onCheckedChange={() => toggleRecruiter(r.id)} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleAssign} className="bg-emerald-600 hover:bg-emerald-700">Assign ({selectedRecruiters.length})</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Edit Dialog ═══════════ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Call List</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Name *</Label><Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Call list name" /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Optional description" rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving || !editName} className="bg-emerald-600 hover:bg-emerald-700">{editSaving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Delete Call List"
        description={`Are you sure you want to delete "${confirmDelete?.name}" and all its ${confirmDelete?.candidates.length} candidates? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
