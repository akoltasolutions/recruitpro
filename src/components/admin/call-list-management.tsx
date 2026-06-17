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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  PhoneCall, Plus, Trash2, Users, Eye, FileSpreadsheet, Pencil, FileText,
  UserPlus, ClipboardPaste, GripVertical, Link, RefreshCw, Globe, Loader2,
  GitMerge, Copy, Search, MoreVertical, AlertTriangle, Upload,
} from 'lucide-react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import { format, formatDistanceToNow } from 'date-fns'
import { PaginationControls, InfiniteScrollLoader } from '@/components/shared/pagination-controls'

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
  candidates: Array<{ id: string; status: string }>
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
  email: string
  role: string
  location: string
  company: string
  notes: string
}

interface DuplicateGroup {
  phone: string
  count: number
  candidateIds: string[]
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
  name: '', phone: '', email: '', role: '', location: '', company: '', notes: '',
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

  // ─── New feature states ───
  // Merge list state
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeSourceListId, setMergeSourceListId] = useState('')
  const [mergeMode, setMergeMode] = useState<'APPEND' | 'SKIP_DUPLICATES' | 'REPLACE_DUPLICATES'>('SKIP_DUPLICATES')
  const [keepOldNotes, setKeepOldNotes] = useState(true)
  const [merging, setMerging] = useState(false)

  // Bulk actions state
  const [addNumbersOpen, setAddNumbersOpen] = useState(false)
  const [addNumbersTab, setAddNumbersTab] = useState<'manual' | 'paste'>('manual')
  const [addNumbersEntries, setAddNumbersEntries] = useState<ManualEntry[]>([emptyManualEntry()])
  const [addNumbersSaving, setAddNumbersSaving] = useState(false)
  const [addNumbersPasteText, setAddNumbersPasteText] = useState('')
  const [addNumbersPasteParsed, setAddNumbersPasteParsed] = useState<ManualEntry[]>([])
  const [updateStatusOpen, setUpdateStatusOpen] = useState(false)
  const [updateStatusIds, setUpdateStatusIds] = useState<string[]>([])
  const [newStatus, setNewStatus] = useState('PENDING')
  const [updateStatusSaving, setUpdateStatusSaving] = useState(false)
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([])

  // Candidate filter state
  const [filterRole, setFilterRole] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteFilteredConfirm, setDeleteFilteredConfirm] = useState(false)
  const [deleteFilteredSaving, setDeleteFilteredSaving] = useState(false)

  // ─── Server-side pagination state ───
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // ─── List-level search ───
  const [listSearchQuery, setListSearchQuery] = useState('')
  const [debouncedListSearch, setDebouncedListSearch] = useState('')

  // ─── Fetched candidate details (for candidates dialog) ───
  const [candidateDetails, setCandidateDetails] = useState<Candidate[]>([])
  const [candidateDetailsLoading, setCandidateDetailsLoading] = useState(false)

  // Deduplicate state
  const [dedupOpen, setDedupOpen] = useState(false)
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([])
  const [dedupLoading, setDedupLoading] = useState(false)

  // Import more state
  const [importMoreOpen, setImportMoreOpen] = useState(false)
  const [importMoreParsedData, setImportMoreParsedData] = useState<Record<string, string>[]>([])
  const [importMoreCsvColumns, setImportMoreCsvColumns] = useState<string[]>([])
  const [importMoreColumnMapping, setImportMoreColumnMapping] = useState<Record<string, string>>({})
  const importMoreFileRef = useRef<HTMLInputElement>(null)

  const fetchCallLists = useCallback(async (page = 1, limit = 50, searchVal = '', append = false) => {
    try {
      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(limit))
      if (searchVal) params.set('search', searchVal)

      const res = await authFetch(`/api/call-lists?${params.toString()}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      if (append) {
        setCallLists(prev => [...prev, ...(json.callLists || [])])
      } else {
        setCallLists(json.callLists || [])
      }
      setTotalCount(json.totalCount || 0)
      setCurrentPage(json.page || page)
      setTotalPages(json.totalPages || 1)
    } catch { toast.error('Failed to load calling lists') }
    finally { setLoading(false); setLoadingMore(false) }
  }, [])

  const fetchRecruiters = useCallback(async () => {
    try {
      const res = await authFetch('/api/users')
      if (!res.ok) return
      const json = await res.json()
      setRecruiters(json.users || [])
    } catch { /* ignore */ }
  }, [])

  // ─── Debounced list search ───
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedListSearch(listSearchQuery.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [listSearchQuery])

  // Initial load + refetch when search or page size changes
  useEffect(() => {
    setCurrentPage(1)
    setCallLists([])
    fetchCallLists(1, pageSize, debouncedListSearch)
    fetchRecruiters()
  }, [debouncedListSearch, pageSize, fetchCallLists, fetchRecruiters])

  // ─── Infinite Scroll ───
  const hasMore = currentPage < totalPages && callLists.length < totalCount

  const loadMoreFn = () => {
    if (loadingMore || !hasMore) return
    fetchCallLists(currentPage + 1, pageSize, debouncedListSearch, true)
  }

  const loadMoreRef = useRef(loadMoreFn)
  loadMoreRef.current = loadMoreFn

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreRef.current()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ─── Fetch full candidate details for a list (for candidates dialog) ───
  const fetchListCandidates = useCallback(async (listId: string) => {
    setCandidateDetailsLoading(true)
    try {
      const res = await authFetch(`/api/call-lists/${listId}/candidates`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setCandidateDetails(json.candidates || [])
    } catch {
      toast.error('Failed to load candidates')
      setCandidateDetails([])
    } finally {
      setCandidateDetailsLoading(false)
    }
  }, [])

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
      fetchCallLists(1, pageSize, debouncedListSearch)
    }

    const timer = setInterval(syncAll, intervalMs)
    return () => clearInterval(timer)
  }, [callLists, fetchCallLists, pageSize, debouncedListSearch])

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
      toast.success(`Calling list created with ${candidates.length} candidates`)
      setCreateOpen(false)
      resetCreateForm()
      fetchCallLists(1, pageSize, debouncedListSearch)
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

      // Strategy 1: Tab-separated (Excel/Sheets copy) — most reliable
      // Strategy 2: Comma-separated (CSV)
      // Strategy 3: Multi-space separated (2+ spaces between fields)
      // Strategy 4: Single-space with phone detection — find first token that
      //   looks like a phone number (6+ digits) and split name/phone there
      let cells: string[]

      if (line.includes('\t')) {
        cells = line.split('\t').map(c => c.trim())
      } else if (line.includes(',')) {
        cells = line.split(',').map(c => c.trim())
      } else if (/  /.test(line)) {
        // Multi-space: split on 2+ spaces
        cells = line.split(/  +/).map(c => c.trim())
      } else {
        // Single-space: detect phone boundary (first token that is 6+ digits)
        const tokens = line.split(/\s+/)
        const phoneIdx = tokens.findIndex(t => /^\d{6,15}$/.test(t.replace(/[\-+()]/g, '')))
        if (phoneIdx > 0) {
          // Everything before phone = name, phone = phone, rest = role/location/company
          const name = tokens.slice(0, phoneIdx).join(' ')
          const phone = tokens[phoneIdx]
          const rest = tokens.slice(phoneIdx + 1)
          cells = [name, phone, rest[0] || '', rest[1] || '', rest.slice(2).join(' ') || '']
        } else if (phoneIdx === 0) {
          // Phone is first token — use as-is (no name)
          const rest = tokens.slice(1)
          cells = [tokens[0], rest[0] || '', rest[1] || '', rest[2] || '', rest.slice(3).join(' ') || '']
        } else {
          // No phone detected — treat first token as name, second as phone (best effort)
          cells = tokens.length >= 2
            ? [tokens[0], tokens[1], tokens.slice(2).join(' ')]
            : tokens
        }
      }

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
      toast.success(`Calling list created with ${candidates.length} candidates${dupes > 0 ? ` (${dupes} duplicates removed)` : ''}`)
      setCreateOpen(false)
      resetCreateForm()
      fetchCallLists(1, pageSize, debouncedListSearch)
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
      fetchCallLists(1, pageSize, debouncedListSearch)
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
    if (!name) { toast.error('Enter a name for the calling list'); return }

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
      fetchCallLists(1, pageSize, debouncedListSearch)
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
    if (!name) { toast.error('Enter a name for the calling list'); return }

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
      fetchCallLists(1, pageSize, debouncedListSearch)
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
      fetchCallLists(1, pageSize, debouncedListSearch)
    } catch {
      toast.error('Failed to sync')
    } finally {
      setGsSyncing(null)
    }
  }

  // ─── Merge List ───
  const openMergeDialog = () => {
    setMergeSourceListId('')
    setMergeMode('SKIP_DUPLICATES')
    setKeepOldNotes(true)
    setMergeOpen(true)
  }

  const handleMerge = async () => {
    if (!selectedList || !mergeSourceListId) { toast.error('Please select a source list'); return }
    setMerging(true)
    try {
      const res = await authFetch(`/api/call-lists/${selectedList.id}/candidates/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceListId: mergeSourceListId, mergeMode, keepOldNotes }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed to merge'); return }
      const result = await res.json()
      toast.success(`Merge complete: ${result.added} added, ${result.skipped} skipped, ${result.replaced} replaced (${result.total} total)`)
      setMergeOpen(false)
      fetchCallLists(1, pageSize, debouncedListSearch)
    } catch { toast.error('Something went wrong') }
    finally { setMerging(false) }
  }

  // ─── Add Numbers Paste helpers ───
  const parseAddNumbersPaste = (text: string) => {
    if (!text.trim()) { setAddNumbersPasteParsed([]); return }
    const lines = text.trim().split(/\r?\n/)
    const parsed: ManualEntry[] = []
    for (const line of lines) {
      if (!line.trim()) continue
      const cells = line.split(/\t|,/).map(c => c.trim())
      if (cells.length >= 2) {
        parsed.push({ name: cells[0] || '', phone: cells[1] || '', role: cells[2] || '', location: cells[3] || '', company: cells[4] || '', email: '', notes: '' })
      }
    }
    setAddNumbersPasteParsed(parsed)
  }

  const handleAddNumbersPaste = async () => {
    if (!selectedList) return
    const valid = addNumbersPasteParsed.filter(e => e.name.trim() && e.phone.trim())
    if (valid.length === 0) { toast.error('No valid candidates. Ensure each line has Name,Phone (tab/comma separated)'); return }

    setAddNumbersSaving(true)
    try {
      const seen = new Set<string>()
      const unique = valid.filter(e => { const p = e.phone.trim(); if (seen.has(p)) return false; seen.add(p); return true })
      const candidates = unique.map(e => ({
        name: e.name.trim(), phone: e.phone.trim(),
        role: e.role.trim() || undefined, location: e.location.trim() || undefined,
        company: e.company.trim() || undefined,
      }))

      const res = await authFetch(`/api/call-lists/${selectedList.id}/candidates/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ADD', data: { candidates } }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return }
      const json = await res.json()
      const dupes = valid.length - unique.length
      toast.success(`${json.count} candidates added${dupes > 0 ? ` (${dupes} duplicates skipped)` : ''}`)
      setAddNumbersOpen(false)
      setAddNumbersPasteText('')
      setAddNumbersPasteParsed([])
      fetchCallLists(1, pageSize, debouncedListSearch)
    } catch { toast.error('Something went wrong') }
    finally { setAddNumbersSaving(false) }
  }

  // ─── Add Numbers (bulk add to existing list) ───
  const updateAddNumberEntry = (index: number, field: keyof ManualEntry, value: string) => {
    setAddNumbersEntries(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const addAddNumberRow = () => {
    setAddNumbersEntries(prev => [...prev, emptyManualEntry()])
  }

  const removeAddNumberRow = (index: number) => {
    if (addNumbersEntries.length <= 1) return
    setAddNumbersEntries(prev => prev.filter((_, i) => i !== index))
  }

  const handleAddNumbers = async () => {
    if (!selectedList) return
    const valid = addNumbersEntries.filter(e => e.name.trim() && e.phone.trim())
    if (valid.length === 0) { toast.error('Add at least one candidate with name and phone'); return }

    setAddNumbersSaving(true)
    try {
      const res = await authFetch(`/api/call-lists/${selectedList.id}/candidates/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ADD',
          data: {
            candidates: valid.map(e => ({
              name: e.name.trim(),
              phone: e.phone.trim(),
              email: e.email.trim() || undefined,
              role: e.role.trim() || undefined,
              location: e.location.trim() || undefined,
              company: e.company.trim() || undefined,
              notes: e.notes.trim() || undefined,
            })),
          },
        }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return }
      const json = await res.json()
      toast.success(`${json.count} candidates added`)
      setAddNumbersOpen(false)
      setAddNumbersEntries([emptyManualEntry()])
      fetchCallLists(1, pageSize, debouncedListSearch)
    } catch { toast.error('Something went wrong') }
    finally { setAddNumbersSaving(false) }
  }

  // ─── Delete by Filter helpers ───
  const getFilteredCandidates = () => {
    if (!selectedList) return []
    const query = searchQuery.trim().toLowerCase()
    return candidateDetails.filter(c => {
      if (filterRole && (c.role || '').toLowerCase() !== filterRole.toLowerCase()) return false
      if (filterLocation && (c.location || '').toLowerCase() !== filterLocation.toLowerCase()) return false
      if (filterStatus && c.status !== filterStatus) return false
      if (query) {
        const haystack = `${c.name} ${c.phone} ${c.role || ''} ${c.location || ''} ${c.email || ''}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }

  const getUniqueValues = (field: 'role' | 'location' | 'status') => {
    if (!selectedList) return []
    const values = new Set(candidateDetails.map(c => c[field]).filter(Boolean) as string[])
    return Array.from(values).sort()
  }

  const clearFilters = () => {
    setFilterRole('')
    setFilterLocation('')
    setFilterStatus('')
    setSearchQuery('')
  }

  const hasActiveFilters = !!(filterRole || filterLocation || filterStatus || searchQuery.trim())

  const handleDeleteFiltered = async () => {
    if (!selectedList) return
    const filtered = getFilteredCandidates()
    if (filtered.length === 0) { toast.error('No candidates match the current filters'); return }

    setDeleteFilteredSaving(true)
    try {
      const res = await authFetch(`/api/call-lists/${selectedList.id}/candidates/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE', candidateIds: filtered.map(c => c.id) }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return }
      const json = await res.json()
      toast.success(`${json.count} filtered candidates removed`)
      setDeleteFilteredConfirm(false)
      setSelectedCandidateIds([])
      clearFilters()
      fetchCallLists(1, pageSize, debouncedListSearch)
    } catch { toast.error('Something went wrong') }
    finally { setDeleteFilteredSaving(false) }
  }

  // ─── Bulk Delete Selected ───
  const handleBulkDelete = async () => {
    if (!selectedList || selectedCandidateIds.length === 0) { toast.error('No candidates selected'); return }
    try {
      const res = await authFetch(`/api/call-lists/${selectedList.id}/candidates/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE', candidateIds: selectedCandidateIds }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return }
      const json = await res.json()
      toast.success(`${json.count} candidates removed`)
      setSelectedCandidateIds([])
      fetchCallLists(1, pageSize, debouncedListSearch)
    } catch { toast.error('Something went wrong') }
  }

  // ─── Bulk Update Status ───
  const openUpdateStatusDialog = () => {
    if (selectedCandidateIds.length === 0) { toast.error('Select candidates first'); return }
    setUpdateStatusIds([...selectedCandidateIds])
    setNewStatus('PENDING')
    setUpdateStatusOpen(true)
  }

  const handleUpdateStatus = async () => {
    if (!selectedList) return
    setUpdateStatusSaving(true)
    try {
      const res = await authFetch(`/api/call-lists/${selectedList.id}/candidates/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_STATUS', candidateIds: updateStatusIds, data: { status: newStatus } }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return }
      const json = await res.json()
      toast.success(`${json.count} candidates updated to ${newStatus}`)
      setUpdateStatusOpen(false)
      setSelectedCandidateIds([])
      fetchCallLists(1, pageSize, debouncedListSearch)
    } catch { toast.error('Something went wrong') }
    finally { setUpdateStatusSaving(false) }
  }

  // ─── Deduplicate ───
  const openDedupDialog = async () => {
    if (!selectedList) return
    setDuplicates([])
    setDedupLoading(true)
    setDedupOpen(true)
    try {
      const res = await authFetch(`/api/call-lists/${selectedList.id}/deduplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'LIST' }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); setDedupOpen(false); return }
      const json = await res.json()
      setDuplicates(json.duplicates || [])
    } catch { toast.error('Something went wrong') }
    finally { setDedupLoading(false) }
  }

  const handleRemoveDuplicates = async () => {
    if (!selectedList) return
    try {
      const res = await authFetch(`/api/call-lists/${selectedList.id}/deduplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REMOVE' }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return }
      const json = await res.json()
      toast.success(`${json.removed} duplicate candidates removed`)
      setDedupOpen(false)
      setDuplicates([])
      fetchCallLists(1, pageSize, debouncedListSearch)
    } catch { toast.error('Something went wrong') }
  }

  // ─── Import More (add to existing list) ───
  const openImportMoreDialog = () => {
    setImportMoreParsedData([])
    setImportMoreCsvColumns([])
    setImportMoreColumnMapping({})
    setImportMoreOpen(true)
  }

  const handleImportMoreUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
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
          setImportMoreCsvColumns(cols)
          setImportMoreParsedData(jsonData)
          setImportMoreColumnMapping(autoDetectMapping(cols))
          toast.success(`Parsed ${jsonData.length} rows from Excel`)
        } catch { toast.error('Failed to parse Excel file') }
      }
      reader.readAsArrayBuffer(file)
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const cols = results.meta.fields || []
          setImportMoreCsvColumns(cols)
          setImportMoreParsedData(results.data as Record<string, string>[])
          setImportMoreColumnMapping(autoDetectMapping(cols))
          toast.success(`Parsed ${results.data.length} rows from CSV`)
        },
        error: () => toast.error('Failed to parse CSV file'),
      })
    }
  }

  const handleImportMore = async () => {
    if (!selectedList || importMoreParsedData.length === 0) { toast.error('No data to import'); return }

    const candidates = importMoreParsedData.map(row => ({
      name: importMoreColumnMapping.name ? String(row[importMoreColumnMapping.name] || '').trim() : '',
      phone: importMoreColumnMapping.phone ? String(row[importMoreColumnMapping.phone] || '').trim() : '',
      email: importMoreColumnMapping.email ? String(row[importMoreColumnMapping.email] || '').trim() || undefined : undefined,
      role: importMoreColumnMapping.role ? String(row[importMoreColumnMapping.role] || '').trim() || undefined : undefined,
      location: importMoreColumnMapping.location ? String(row[importMoreColumnMapping.location] || '').trim() || undefined : undefined,
      company: importMoreColumnMapping.company ? String(row[importMoreColumnMapping.company] || '').trim() || undefined : undefined,
    })).filter(c => c.name && c.phone)

    if (candidates.length === 0) { toast.error('No valid candidates found. Check your column mapping.'); return }

    setAddNumbersSaving(true)
    try {
      const res = await authFetch(`/api/call-lists/${selectedList.id}/candidates/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ADD', data: { candidates } }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return }
      const json = await res.json()
      toast.success(`${json.count} candidates imported into "${selectedList.name}"`)
      setImportMoreOpen(false)
      setImportMoreParsedData([])
      setImportMoreCsvColumns([])
      setImportMoreColumnMapping({})
      fetchCallLists(1, pageSize, debouncedListSearch)
    } catch { toast.error('Something went wrong') }
    finally { setAddNumbersSaving(false) }
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
      fetchCallLists(1, pageSize, debouncedListSearch)
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
      if (!res.ok) { toast.error('Failed to update calling list'); return }
      toast.success('Calling list updated')
      setEditOpen(false)
      fetchCallLists(1, pageSize, debouncedListSearch)
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
      <PageHeader title="Calling List Management" description="Manage candidate lists for calling" icon={PhoneCall}>
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

      {/* Search bar */}
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search calling lists..."
          value={listSearchQuery}
          onChange={(e) => setListSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : callLists.length === 0 ? (
        <EmptyState icon={PhoneCall} title="No calling lists" description="Create or import a calling list to get started" actionLabel="Create List" onAction={() => handleCreateOpen('manual')} />
      ) : (
        <div className="space-y-3">
          {callLists.map(list => {
            const total = list.candidates?.length || 0
            const done = list.candidates?.filter((c) => c.status === 'DONE').length || 0
            const scheduled = list.candidates?.filter((c) => c.status === 'SCHEDULED').length || 0
            const pending = total - done - scheduled
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
                      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 text-xs px-1.5 py-0">{pending} pending</Badge>
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 text-xs px-1.5 py-0">{done} done</Badge>
                      {scheduled > 0 && <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 text-xs px-1.5 py-0">{scheduled} scheduled</Badge>}
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
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedList(list); fetchListCandidates(list.id); setCandidatesOpen(true) }}>
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

          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} className="h-1" />

          {/* Infinite scroll loader */}
          <InfiniteScrollLoader loadingMore={loadingMore} isEnd={!hasMore && callLists.length > 0} />

          {/* Pagination controls */}
          <PaginationControls
            totalCount={totalCount}
            displayedCount={callLists.length}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            pageSizeOptions={[50, 100]}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize)
              setCurrentPage(1)
              setCallLists([])
            }}
            onLoadMore={loadMoreFn}
            loadingMore={loadingMore}
            loading={loading}
            hasMore={hasMore}
          />
        </div>
      )}

      {/* ═══════════ Create List Dialog (Manual Entry + Copy-Paste) ═══════════ */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) resetCreateForm(); setCreateOpen(open) }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh]">
          <DialogHeader><DialogTitle>Create Calling List</DialogTitle></DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 space-y-4 py-2">
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
                    placeholder={"Paste data here. Each line = one candidate.\n\nSupported formats:\n\u2022 Tab-separated (copied from Excel/Sheets)\n\u2022 Comma-separated (CSV)\n\u2022 Space-separated (2+ spaces between fields)\n\nColumn order: Name, Phone, Role, Location, Company\n\nExamples:\nJohn Doe\t9876543210\tDeveloper\tBangalore\tAcme\nJane Smith,9876543211,Designer,Mumbai,Beta\nRahul Kumar  9876543212  Manager  Delhi  XYZ"}
                    rows={8}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste from Excel, Google Sheets, or any tab/comma/space-separated source. First two columns must be <strong>Name</strong> and <strong>Phone</strong>.
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
                      <div className="rounded-md border overflow-x-auto max-h-48">
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

          <DialogFooter className="pt-2 border-t">
            <div className="flex flex-col gap-2 w-full">
              <div className="flex items-center gap-3">
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
              </div>
              {/* Show helpful hints when button is disabled */}
              {!saving && (createTab === 'paste' ? pasteParsed.length > 0 && !name : manualEntries.some(e => e.name.trim() && e.phone.trim()) && !name) && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠ Please enter a <strong>List Name</strong> above to enable the create button.
                </p>
              )}
              {!saving && (createTab === 'paste' ? pasteParsed.length === 0 && pasteText.trim() : !manualEntries.some(e => e.name.trim() && e.phone.trim())) && name && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠ No valid candidates detected. Ensure each line has <strong>Name</strong> and <strong>Phone</strong> (tab, comma, or multi-space separated).
                </p>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Upload Dialog (CSV / XLSX) ═══════════ */}
      <Dialog open={uploadOpen} onOpenChange={(open) => { setUploadOpen(open); if (!open) { setParsedData([]); setCsvColumns([]); setColumnMapping({}); setUploadSource('CSV') } }}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {uploadSource === 'XLSX' ? <FileSpreadsheet className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              Import from {uploadSource === 'XLSX' ? 'XLS/XLSX' : 'CSV'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 space-y-4 py-2">
            <div className="space-y-2"><Label>List Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Name for this calling list" /></div>
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
                  <div className="rounded-md border overflow-x-auto max-h-48">
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
          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleImportCSV} disabled={saving || parsedData.length === 0 || !name} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Importing...' : `Import ${parsedData.length} Candidates`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Google Sheets Import Dialog ═══════════ */}
      <Dialog open={gsOpen} onOpenChange={(open) => { if (!open) handleGsClose() }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600" />
              Import from Google Sheets
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 space-y-4 py-2">
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
                  <div className="rounded-md border overflow-x-auto max-h-48">
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

          <DialogFooter className="pt-2 border-t">
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
      <Dialog open={candidatesOpen} onOpenChange={(open) => { setCandidatesOpen(open); if (!open) { setSelectedCandidateIds([]); clearFilters(); setCandidateDetails([]) } }}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{selectedList?.name} - Candidates ({candidateDetailsLoading ? '...' : candidateDetails.length || selectedList?.candidates?.length || 0})</DialogTitle>
            <DialogDescription>View and manage candidates in this calling list</DialogDescription>
          </DialogHeader>

          {/* Action buttons row */}
          <div className="flex flex-wrap gap-2 py-1">
            <Button variant="outline" size="sm" onClick={() => { setSelectedCandidateIds([]); openMergeDialog() }}>
              <GitMerge className="h-4 w-4 mr-1.5" /> Merge List
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreVertical className="h-4 w-4 mr-1.5" /> Bulk Actions
                  {selectedCandidateIds.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 text-xs px-1.5">{selectedCandidateIds.length}</Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handleBulkDelete} disabled={selectedCandidateIds.length === 0} className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Selected ({selectedCandidateIds.length})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openUpdateStatusDialog} disabled={selectedCandidateIds.length === 0}>
                  <Copy className="h-4 w-4 mr-2" /> Update Status ({selectedCandidateIds.length})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setAddNumbersEntries([emptyManualEntry()]); setAddNumbersTab('manual'); setAddNumbersPasteText(''); setAddNumbersPasteParsed([]); setAddNumbersOpen(true) }}>
                  <UserPlus className="h-4 w-4 mr-2" /> Add Numbers
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { if (getFilteredCandidates().length === 0) { toast.error('No candidates match filters'); return }; setDeleteFilteredConfirm(true) }} disabled={!hasActiveFilters} className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Filtered ({getFilteredCandidates().length})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => { setSelectedCandidateIds([]); openDedupDialog() }}>
              <Search className="h-4 w-4 mr-1.5" /> Find Duplicates
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setAddNumbersEntries([emptyManualEntry()]); setAddNumbersTab('manual'); setAddNumbersPasteText(''); setAddNumbersPasteParsed([]); setAddNumbersOpen(true) }}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Numbers
            </Button>
            <Button variant="outline" size="sm" onClick={openImportMoreDialog}>
              <Upload className="h-4 w-4 mr-1.5" /> Import More
            </Button>
            {(selectedCandidateIds.length > 0 || hasActiveFilters) && (
              <div className="flex items-center gap-2 ml-auto">
                {selectedCandidateIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCandidateIds([])}>
                    Clear selection
                  </Button>
                )}
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Filter + Search row */}
          <div className="flex flex-wrap items-center gap-2 py-2 border rounded-lg px-3 bg-muted/30">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search name, phone, location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-xs pl-8 pr-3"
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">|</span>
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Role:</span>
            <select
              value={filterRole || '__all__'}
              onChange={(e) => setFilterRole(e.target.value === '__all__' ? '' : e.target.value)}
              className="h-8 px-2 text-xs rounded-md border border-input bg-transparent min-w-[110px]"
            >
              <option value="__all__">All Roles</option>
              {getUniqueValues('role').map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Location:</span>
            <select
              value={filterLocation || '__all__'}
              onChange={(e) => setFilterLocation(e.target.value === '__all__' ? '' : e.target.value)}
              className="h-8 px-2 text-xs rounded-md border border-input bg-transparent min-w-[120px]"
            >
              <option value="__all__">All Locations</option>
              {getUniqueValues('location').map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Status:</span>
            <select
              value={filterStatus || '__all__'}
              onChange={(e) => setFilterStatus(e.target.value === '__all__' ? '' : e.target.value)}
              className="h-8 px-2 text-xs rounded-md border border-input bg-transparent min-w-[120px]"
            >
              <option value="__all__">All Statuses</option>
              {getUniqueValues('status').map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {hasActiveFilters && (
              <Badge variant="secondary" className="text-xs">
                Showing {getFilteredCandidates().length} of {candidateDetails.length || 0}
              </Badge>
            )}
          </div>

          <div className="rounded-md border overflow-x-auto max-h-96 flex-1 min-h-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={candidateDetails.length ? selectedCandidateIds.length === candidateDetails.length : false}
                      onCheckedChange={(checked) => {
                        if (!selectedList) return
                        setSelectedCandidateIds(checked ? candidateDetails.map(c => c.id) : [])
                      }}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="hidden sm:table-cell">Role</TableHead>
                  <TableHead className="hidden md:table-cell">Location</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedList && (() => {
                  if (candidateDetailsLoading) {
                    return (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          <div className="flex items-center justify-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">Loading candidates...</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  }
                  const displayCandidates = hasActiveFilters ? getFilteredCandidates() : candidateDetails
                  return displayCandidates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        {hasActiveFilters ? 'No candidates match the current filters' : 'No candidates in this list'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayCandidates.map(c => (
                      <TableRow key={c.id} className={selectedCandidateIds.includes(c.id) ? 'bg-muted/50' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={selectedCandidateIds.includes(c.id)}
                            onCheckedChange={(checked) => {
                              setSelectedCandidateIds(prev =>
                                checked
                                  ? [...prev, c.id]
                                  : prev.filter(id => id !== c.id)
                              )
                            }}
                          />
                        </TableCell>
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
                    ))
                  )
                })()}
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

      {/* ═══════════ Merge List Dialog ═══════════ */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5" />
              Merge into &ldquo;{selectedList?.name}&rdquo;
            </DialogTitle>
            <DialogDescription>Import candidates from another calling list into this one.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 space-y-4 py-2">
            <div className="space-y-2">
              <Label>Source List *</Label>
              <Select value={mergeSourceListId} onValueChange={setMergeSourceListId} modal={false}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a calling list to merge from" />
                </SelectTrigger>
                <SelectContent>
                  {callLists
                    .filter(l => l.id !== selectedList?.id)
                    .map(l => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} ({l.candidates.length} candidates)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {callLists.filter(l => l.id !== selectedList?.id).length === 0 && (
                <p className="text-xs text-muted-foreground">No other lists available to merge.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Merge Mode *</Label>
              <Select value={mergeMode} onValueChange={(v) => setMergeMode(v as 'APPEND' | 'SKIP_DUPLICATES' | 'REPLACE_DUPLICATES')} modal={false}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="APPEND">Append All - Add every candidate, even duplicates</SelectItem>
                  <SelectItem value="SKIP_DUPLICATES">Skip Duplicates - Only add new phone numbers</SelectItem>
                  <SelectItem value="REPLACE_DUPLICATES">Replace Duplicates - Update existing with new data</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mergeMode === 'REPLACE_DUPLICATES' && (
              <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                <Checkbox
                  id="keepOldNotes"
                  checked={keepOldNotes}
                  onCheckedChange={(checked) => setKeepOldNotes(checked === true)}
                />
                <Label htmlFor="keepOldNotes" className="text-sm cursor-pointer">
                  Keep existing notes when replacing duplicates
                </Label>
              </div>
            )}

            {mergeSourceListId && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Merging will combine {callLists.find(l => l.id === mergeSourceListId)?.candidates.length || 0} candidates
                  into &ldquo;{selectedList?.name}&rdquo; ({selectedList?.candidates.length || 0} candidates).
                  {mergeMode === 'APPEND' && ' All candidates will be added, including any duplicates.'}
                  {mergeMode === 'SKIP_DUPLICATES' && ' Candidates with the same phone number will be skipped.'}
                  {mergeMode === 'REPLACE_DUPLICATES' && ' Candidates with the same phone number will be updated with new data.'}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setMergeOpen(false)}>Cancel</Button>
            <Button onClick={handleMerge} disabled={merging || !mergeSourceListId} className="bg-emerald-600 hover:bg-emerald-700">
              {merging ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Merging...</> : 'Merge Lists'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Add Numbers Dialog ═══════════ */}
      <Dialog open={addNumbersOpen} onOpenChange={(open) => { setAddNumbersOpen(open); if (!open) { setAddNumbersEntries([emptyManualEntry()]); setAddNumbersPasteText(''); setAddNumbersPasteParsed([]) } }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Add Candidates to &ldquo;{selectedList?.name}&rdquo;
            </DialogTitle>
            <DialogDescription>Add new candidates manually or by copy-paste.</DialogDescription>
          </DialogHeader>
          <Tabs value={addNumbersTab} onValueChange={(v) => setAddNumbersTab(v as 'manual' | 'paste')} className="flex-1 min-h-0 flex flex-col">
            <TabsList className="mb-3">
              <TabsTrigger value="manual" className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Manual Entry</TabsTrigger>
              <TabsTrigger value="paste" className="gap-1.5"><ClipboardPaste className="h-3.5 w-3.5" /> Copy-Paste</TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
              <div className="space-y-3 py-2">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs">
                    {addNumbersEntries.filter(e => e.name.trim() && e.phone.trim()).length} valid entries
                  </Badge>
                  <Button variant="outline" size="sm" onClick={addAddNumberRow}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
                  </Button>
                </div>
                <div className="rounded-md border overflow-x-auto max-h-72">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead className="min-w-[100px]">Name *</TableHead>
                        <TableHead className="min-w-[100px]">Phone *</TableHead>
                        <TableHead className="min-w-[100px] hidden sm:table-cell">Email</TableHead>
                        <TableHead className="min-w-[100px] hidden lg:table-cell">Role</TableHead>
                        <TableHead className="min-w-[100px] hidden lg:table-cell">Location</TableHead>
                        <TableHead className="min-w-[100px] hidden lg:table-cell">Company</TableHead>
                        <TableHead className="min-w-[100px] hidden lg:table-cell">Notes</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {addNumbersEntries.map((entry, index) => (
                        <TableRow key={index}>
                          <TableCell className="text-xs text-muted-foreground">{index + 1}</TableCell>
                          <TableCell><Input value={entry.name} onChange={e => updateAddNumberEntry(index, 'name', e.target.value)} placeholder="Name" className="h-8 text-sm" /></TableCell>
                          <TableCell><Input value={entry.phone} onChange={e => updateAddNumberEntry(index, 'phone', e.target.value)} placeholder="Phone" className="h-8 text-sm" /></TableCell>
                          <TableCell className="hidden sm:table-cell"><Input value={entry.email} onChange={e => updateAddNumberEntry(index, 'email', e.target.value)} placeholder="Email" className="h-8 text-sm" /></TableCell>
                          <TableCell className="hidden lg:table-cell"><Input value={entry.role} onChange={e => updateAddNumberEntry(index, 'role', e.target.value)} placeholder="Role" className="h-8 text-sm" /></TableCell>
                          <TableCell className="hidden lg:table-cell"><Input value={entry.location} onChange={e => updateAddNumberEntry(index, 'location', e.target.value)} placeholder="Location" className="h-8 text-sm" /></TableCell>
                          <TableCell className="hidden lg:table-cell"><Input value={entry.company} onChange={e => updateAddNumberEntry(index, 'company', e.target.value)} placeholder="Company" className="h-8 text-sm" /></TableCell>
                          <TableCell className="hidden lg:table-cell"><Input value={entry.notes} onChange={e => updateAddNumberEntry(index, 'notes', e.target.value)} placeholder="Notes" className="h-8 text-sm" /></TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 w-9 p-0 text-muted-foreground hover:text-red-600"
                              onClick={() => removeAddNumberRow(index)}
                              disabled={addNumbersEntries.length <= 1}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="paste" className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
              <div className="space-y-3 py-2">
                <div className="space-y-2">
                  <Label className="text-sm">Paste Candidate Data</Label>
                  <Textarea
                    placeholder={"Paste candidate data here. Each line should contain:\nName, Phone, Role, Location\n\nExample:\nRahul Sharma, 9876543210, Software Engineer, Bangalore\nPriya Patel, 9876543211, Product Manager, Mumbai"}
                    value={addNumbersPasteText}
                    onChange={(e) => { setAddNumbersPasteText(e.target.value); parseAddNumbersPaste(e.target.value) }}
                    className="min-h-[160px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Supports tab-separated or comma-separated values. Columns: Name, Phone, Role (optional), Location (optional), Company (optional)
                  </p>
                </div>

                {addNumbersPasteParsed.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Preview ({addNumbersPasteParsed.length} rows parsed)</Label>
                      <Badge variant="secondary" className="text-xs">
                        {addNumbersPasteParsed.filter(e => e.name.trim() && e.phone.trim()).length} valid
                      </Badge>
                    </div>
                    <div className="rounded-md border overflow-x-auto max-h-48">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead className="hidden sm:table-cell">Role</TableHead>
                            <TableHead className="hidden sm:table-cell">Location</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {addNumbersPasteParsed.slice(0, 20).map((entry, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="text-sm">{entry.name || <span className="text-red-400">missing</span>}</TableCell>
                              <TableCell className="text-sm">{entry.phone || <span className="text-red-400">missing</span>}</TableCell>
                              <TableCell className="hidden sm:table-cell text-sm">{entry.role || '-'}</TableCell>
                              <TableCell className="hidden sm:table-cell text-sm">{entry.location || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {addNumbersPasteParsed.length > 20 && (
                      <p className="text-xs text-muted-foreground">...and {addNumbersPasteParsed.length - 20} more rows</p>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setAddNumbersOpen(false)}>Cancel</Button>
            {addNumbersTab === 'manual' ? (
              <Button
                onClick={handleAddNumbers}
                disabled={addNumbersSaving || !addNumbersEntries.some(e => e.name.trim() && e.phone.trim())}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {addNumbersSaving ? 'Adding...' : `Add ${addNumbersEntries.filter(e => e.name.trim() && e.phone.trim()).length} Candidates`}
              </Button>
            ) : (
              <Button
                onClick={handleAddNumbersPaste}
                disabled={addNumbersSaving || addNumbersPasteParsed.filter(e => e.name.trim() && e.phone.trim()).length === 0}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {addNumbersSaving ? 'Adding...' : `Add ${addNumbersPasteParsed.filter(e => e.name.trim() && e.phone.trim()).length} Candidates`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Delete Filtered Confirm Dialog ═══════════ */}
      <Dialog open={deleteFilteredConfirm} onOpenChange={setDeleteFilteredConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Delete Filtered Candidates
            </DialogTitle>
            <DialogDescription>
              This will permanently remove all candidates matching the current filters.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg border p-3 space-y-1 bg-muted/30">
              {searchQuery.trim() && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Search:</span>
                  <span className="font-medium">&ldquo;{searchQuery.trim()}&rdquo;</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Role:</span>
                <span className="font-medium">{filterRole || 'All'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Location:</span>
                <span className="font-medium">{filterLocation || 'All'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-medium">{filterStatus || 'All'}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm font-semibold">
                <span>Candidates to delete:</span>
                <span className="text-red-600">{getFilteredCandidates().length}</span>
              </div>
            </div>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                This action cannot be undone. {getFilteredCandidates().length} candidate{getFilteredCandidates().length !== 1 ? 's' : ''} will be permanently removed.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFilteredConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteFiltered} disabled={deleteFilteredSaving}>
              {deleteFilteredSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...</> : `Delete ${getFilteredCandidates().length} Candidates`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Update Status Dialog ═══════════ */}
      <Dialog open={updateStatusOpen} onOpenChange={setUpdateStatusOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Status</DialogTitle>
            <DialogDescription>Change status for {updateStatusIds.length} selected candidate{updateStatusIds.length !== 1 ? 's' : ''}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>New Status</Label>
            <Select value={newStatus} onValueChange={setNewStatus} modal={false}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="DONE">Done</SelectItem>
                <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                <SelectItem value="SKIPPED">Skipped</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateStatusOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateStatus} disabled={updateStatusSaving} className="bg-emerald-600 hover:bg-emerald-700">
              {updateStatusSaving ? 'Updating...' : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Deduplicate Dialog ═══════════ */}
      <Dialog open={dedupOpen} onOpenChange={(open) => { setDedupOpen(open); if (!open) setDuplicates([]) }}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Find Duplicates
            </DialogTitle>
            <DialogDescription>Find candidates with duplicate phone numbers in &ldquo;{selectedList?.name}&rdquo;.</DialogDescription>
          </DialogHeader>

          {dedupLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : duplicates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No duplicate phone numbers found in this list.</p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 space-y-3 py-2">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Found {duplicates.length} phone number{duplicates.length !== 1 ? 's' : ''} with duplicates
                  ({duplicates.reduce((sum, d) => sum + d.count - 1, 0)} extra entries).
                  Removing will keep only the oldest entry for each duplicate.
                </AlertDescription>
              </Alert>

              <div className="rounded-md border overflow-x-auto max-h-64">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-center">Count</TableHead>
                      <TableHead className="text-center">Duplicates</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {duplicates.map(d => (
                      <TableRow key={d.phone}>
                        <TableCell className="font-medium">{d.phone}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="border-amber-500 text-amber-700">{d.count}</Badge>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">{d.count - 1}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setDedupOpen(false)}>Close</Button>
            {duplicates.length > 0 && (
              <Button variant="destructive" onClick={handleRemoveDuplicates}>
                <Trash2 className="h-4 w-4 mr-1.5" /> Remove {duplicates.reduce((sum, d) => sum + d.count - 1, 0)} Duplicates
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Import More Dialog ═══════════ */}
      <Dialog open={importMoreOpen} onOpenChange={(open) => { setImportMoreOpen(open); if (!open) { setImportMoreParsedData([]); setImportMoreCsvColumns([]); setImportMoreColumnMapping({}) } }}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import More into &ldquo;{selectedList?.name}&rdquo;
            </DialogTitle>
            <DialogDescription>Import additional candidates from CSV or Excel into this existing list.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 space-y-4 py-2">
            <div className="space-y-2">
              <Label>Upload File (CSV or Excel)</Label>
              <Input ref={importMoreFileRef} type="file" accept=".csv,.xls,.xlsx" onChange={handleImportMoreUpload} />
              <p className="text-xs text-muted-foreground">Supports .csv, .xls, and .xlsx files. Headers must be in the first row.</p>
            </div>

            {importMoreCsvColumns.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Column Mapping ({importMoreParsedData.length} rows)</Label>
                  <div className="grid gap-2">
                    {columnFields.map(field => (
                      <div key={field.value} className="flex items-center gap-2">
                        <Label className="w-24 text-sm shrink-0">{field.label}</Label>
                        <select
                          value={importMoreColumnMapping[field.value] || ''}
                          onChange={(e) => setImportMoreColumnMapping(prev => ({ ...prev, [field.value]: e.target.value }))}
                          className="flex-1 h-9 px-3 rounded-md border border-input bg-transparent text-sm"
                        >
                          <option value="">Select column</option>
                          <option value="SKIP" className="text-muted-foreground">— Skip —</option>
                          {importMoreCsvColumns.map(col => (
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
                  <div className="rounded-md border overflow-x-auto max-h-40">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {importMoreCsvColumns.map(col => <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importMoreParsedData.slice(0, 5).map((row, i) => (
                          <TableRow key={i}>
                            {importMoreCsvColumns.map(col => <TableCell key={col} className="text-xs py-1.5 whitespace-nowrap">{String(row[col] || '')}</TableCell>)}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setImportMoreOpen(false)}>Cancel</Button>
            <Button onClick={handleImportMore} disabled={addNumbersSaving || importMoreParsedData.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
              {addNumbersSaving ? 'Importing...' : `Import ${importMoreParsedData.length} Candidates`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Edit Dialog ═══════════ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Calling List</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Name *</Label><Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Calling list name" /></div>
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
        title="Delete Calling List"
        description={`Are you sure you want to delete "${confirmDelete?.name}" and all its ${confirmDelete?.candidates.length} candidates? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
