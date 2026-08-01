'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { authFetch } from '@/stores/auth-store'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Smartphone, Package, Upload, Download, Loader2, CheckCircle, AlertTriangle,
  Users, Building2, BarChart3, Settings, Archive, RotateCcw, Trash2, Edit,
  Copy, Eye, Shield, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface ApkVersion {
  id: string
  appName: string
  versionName: string
  versionCode: number
  fileName: string
  originalName: string
  size: number
  checksum: string | null
  releaseNotes: string | null
  status: string
  downloadCount: number
  uploadedBy: string | null
  publishedBy: string | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  _count: {
    userAssignments: number
    orgAssignments: number
    downloads: number
  }
}

interface UserAssignment {
  id: string
  userId: string
  versionId: string
  assignedBy: string | null
  createdAt: string
  version: { id: string; versionName: string; versionCode: number; status: string }
  user: { id: string; name: string; email: string; organizationId: string | null } | null
}

interface OrgAssignment {
  id: string
  organizationId: string
  versionId: string
  assignedBy: string | null
  createdAt: string
  version: { id: string; versionName: string; versionCode: number; status: string }
  organization: { id: string; name: string; email: string } | null
}

interface Analytics {
  totalDownloads: number
  thisWeekDownloads: number
  todayDownloads: number
  downloadsPerVersion: Array<{ versionId: string; versionName: string; versionCode: number; count: number }>
  recentDownloads: Array<{
    id: string; userId: string; userName: string; userEmail: string
    organizationId: string | null; versionName: string; versionCode: number
    ipAddress: string | null; userAgent: string | null; createdAt: string
  }>
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '—' }
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } catch { return '—' }
}

function statusBadge(status: string) {
  switch (status) {
    case 'PUBLISHED':
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 text-[10px] px-1.5 py-0">Published</Badge>
    case 'TESTING':
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 text-[10px] px-1.5 py-0">Testing</Badge>
    case 'DRAFT':
      return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Draft</Badge>
    case 'ARCHIVED':
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 text-[10px] px-1.5 py-0">Archived</Badge>
    default:
      return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{status}</Badge>
  }
}

// ── Main Component ─────────────────────────────────────────────────────────

export function AndroidAppPage() {
  const [versions, setVersions] = useState<ApkVersion[]>([])
  const [forceMinVersion, setForceMinVersion] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [activeTab, setActiveTab] = useState('versions')

  // Upload form
  const [appName, setAppName] = useState('Akolta Dialer')
  const [versionName, setVersionName] = useState('')
  const [versionCode, setVersionCode] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [uploadStatus, setUploadStatus] = useState('DRAFT')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Edit dialog
  const [editDialog, setEditDialog] = useState<ApkVersion | null>(null)
  const [editForm, setEditForm] = useState({ versionName: '', versionCode: '', releaseNotes: '', status: '', appName: '' })

  // Delete dialog
  const [confirmDelete, setConfirmDelete] = useState<ApkVersion | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Assignments
  const [userAssignments, setUserAssignments] = useState<UserAssignment[]>([])
  const [orgAssignments, setOrgAssignments] = useState<OrgAssignment[]>([])
  const [assignLoading, setAssignLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userResults, setUserResults] = useState<Array<{ id: string; name: string; email: string }>>([])
  const [orgSearch, setOrgSearch] = useState('')
  const [orgResults, setOrgResults] = useState<Array<{ id: string; name: string; email: string }>>([])
  const [assignVersionId, setAssignVersionId] = useState('')
  const [assigningType, setAssigningType] = useState<'user' | 'org'>('user')
  const [assignTargetId, setAssignTargetId] = useState('')
  const [assigning, setAssigning] = useState(false)

  // Analytics
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  // Settings
  const [savingSettings, setSavingSettings] = useState(false)
  const [minVersionInput, setMinVersionInput] = useState('')

  // Collapsible sections
  const [showUpload, setShowUpload] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [showAssignments, setShowAssignments] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // ── Fetch data ─────────────────────────────────────────────────────────

  const refreshVersions = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/backup/android-versions')
      if (res.ok) {
        const data = await res.json()
        setVersions(data.versions || [])
        setForceMinVersion(data.forceMinVersion || '')
        setMinVersionInput(data.forceMinVersion || '')
      }
    } catch { /* ignore */ }
  }, [])

  const refreshAssignments = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/backup/android-versions/assignments')
      if (res.ok) {
        const data = await res.json()
        setUserAssignments(data.userAssignments || [])
        setOrgAssignments(data.orgAssignments || [])
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await authFetch('/api/admin/backup/android-versions')
        if (res.ok && !cancelled) {
          const data = await res.json()
          setVersions(data.versions || [])
          setForceMinVersion(data.forceMinVersion || '')
          setMinVersionInput(data.forceMinVersion || '')
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!showAssignments) return
    let cancelled = false
    ;(async () => {
      setAssignLoading(true)
      try {
        const res = await authFetch('/api/admin/backup/android-versions/assignments')
        if (res.ok && !cancelled) {
          const data = await res.json()
          setUserAssignments(data.userAssignments || [])
          setOrgAssignments(data.orgAssignments || [])
        }
      } catch { /* ignore */ }
      if (!cancelled) setAssignLoading(false)
    })()
    return () => { cancelled = true }
  }, [showAssignments])

  useEffect(() => {
    if (!showAnalytics) return
    let cancelled = false
    ;(async () => {
      setAnalyticsLoading(true)
      try {
        const res = await authFetch('/api/admin/backup/android-versions/analytics')
        if (res.ok && !cancelled) {
          const data = await res.json()
          setAnalytics(data)
        }
      } catch { /* ignore */ }
      if (!cancelled) setAnalyticsLoading(false)
    })()
    return () => { cancelled = true }
  }, [showAnalytics])

  // ── Search users/orgs for assignment ───────────────────────────────────

  const searchUsers = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setUserResults([]); return }
    try {
      const res = await authFetch(`/api/admin/users?search=${encodeURIComponent(q)}&limit=10`)
      if (res.ok) {
        const data = await res.json()
        setUserResults(data.users || [])
      }
    } catch { setUserResults([]) }
  }, [])

  const searchOrgs = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setOrgResults([]); return }
    try {
      const res = await authFetch(`/api/admin/organizations?search=${encodeURIComponent(q)}&limit=10`)
      if (res.ok) {
        const data = await res.json()
        setOrgResults(data.organizations || data || [])
      }
    } catch { setOrgResults([]) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => searchUsers(userSearch), 300)
    return () => clearTimeout(t)
  }, [userSearch, searchUsers])

  useEffect(() => {
    const t = setTimeout(() => searchOrgs(orgSearch), 300)
    return () => clearTimeout(t)
  }, [orgSearch, searchOrgs])

  // ── Actions ────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!selectedFile || !versionName.trim() || !versionCode) {
      toast.error('APK file, version name, and version code are required')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('apk', selectedFile)
      fd.append('appName', appName)
      fd.append('versionName', versionName.trim())
      fd.append('versionCode', versionCode)
      fd.append('releaseNotes', releaseNotes.trim())
      fd.append('status', uploadStatus)
      fd.append('setActive', uploadStatus === 'PUBLISHED' ? 'true' : 'false')

      const res = await authFetch('/api/admin/backup/android-versions', { method: 'POST', body: fd })
      if (res.ok) {
        toast.success(`APK v${versionName.trim()} uploaded!`)
        setVersionName('')
        setVersionCode('')
        setReleaseNotes('')
        setSelectedFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        refreshVersions()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Upload failed')
      }
    } catch { toast.error('Upload failed') }
    setUploading(false)
  }

  const handlePatch = async (action: string, id: string, extra?: Record<string, unknown>) => {
    setActionLoading(id)
    try {
      const res = await authFetch('/api/admin/backup/android-versions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, ...extra }),
      })
      if (res.ok) {
        const labels: Record<string, string> = { set_active: 'activated', publish: 'published', archive: 'archived', rollback: 'rolled back to' }
        toast.success(`Version ${labels[action] || 'updated'}`)
        refreshVersions()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Action failed')
      }
    } catch { toast.error('Action failed') }
    setActionLoading(null)
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeletingId(confirmDelete.id)
    try {
      const res = await authFetch(`/api/admin/backup/android-versions?id=${confirmDelete.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success(`v${confirmDelete.versionName} deleted`)
        setConfirmDelete(null)
        refreshVersions()
      } else toast.error('Delete failed')
    } catch { toast.error('Delete failed') }
    setDeletingId(null)
  }

  const openEdit = (v: ApkVersion) => {
    setEditForm({ versionName: v.versionName, versionCode: String(v.versionCode), releaseNotes: v.releaseNotes || '', status: v.status, appName: v.appName })
    setEditDialog(v)
  }

  const handleEditSave = async () => {
    if (!editDialog) return
    setActionLoading(editDialog.id)
    try {
      const res = await authFetch('/api/admin/backup/android-versions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update', id: editDialog.id,
          versionName: editForm.versionName,
          versionCode: parseInt(editForm.versionCode, 10),
          releaseNotes: editForm.releaseNotes,
          status: editForm.status,
          appName: editForm.appName,
        }),
      })
      if (res.ok) {
        toast.success('Version updated')
        setEditDialog(null)
        refreshVersions()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Update failed')
      }
    } catch { toast.error('Update failed') }
    setActionLoading(null)
  }

  const handleAssign = async () => {
    if (!assignVersionId || !assignTargetId) {
      toast.error('Select a version and a target')
      return
    }
    setAssigning(true)
    try {
      const res = await authFetch('/api/admin/backup/android-versions/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: assigningType, targetId: assignTargetId, versionId: assignVersionId }),
      })
      if (res.ok) {
        toast.success(`${assigningType === 'user' ? 'User' : 'Organization'} assigned`)
        setAssignTargetId('')
        refreshAssignments()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Assignment failed')
      }
    } catch { toast.error('Assignment failed') }
    setAssigning(false)
  }

  const handleRemoveAssignment = async (type: 'user' | 'org', targetId: string) => {
    try {
      const res = await authFetch(`/api/admin/backup/android-versions/assignments?type=${type}&targetId=${targetId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Assignment removed')
        refreshAssignments()
      }
    } catch { toast.error('Failed to remove') }
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const res = await authFetch('/api/admin/platform-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'force_min_android_version', value: minVersionInput }),
      })
      if (res.ok) {
        toast.success('Settings saved')
        setForceMinVersion(minVersionInput)
      } else toast.error('Failed to save settings')
    } catch { toast.error('Failed to save settings') }
    setSavingSettings(false)
  }

  const copyChecksum = (cs: string | null) => {
    if (!cs) return
    navigator.clipboard.writeText(cs)
    toast.success('Checksum copied')
  }

  const published = versions.find(v => v.status === 'PUBLISHED')

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Android App Management" description="Manage APK versions, assignments, and analytics" icon={Smartphone} />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Android App Management" description="Manage APK versions, assignments, and analytics" icon={Smartphone} />

      {/* ── 1. Current Latest Release ── */}
      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-600" />
              Current Release
            </CardTitle>
            {published ? statusBadge(published.status) : null}
          </div>
        </CardHeader>
        <CardContent>
          {published ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">App</p>
                  <p className="text-sm font-semibold mt-0.5">{published.appName}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Version</p>
                  <p className="text-sm font-bold mt-0.5">v{published.versionName} <span className="text-xs text-muted-foreground font-normal">(code {published.versionCode})</span></p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Released</p>
                  <p className="text-sm font-medium mt-0.5">{formatDate(published.publishedAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Size</p>
                  <p className="text-sm font-medium mt-0.5">{formatFileSize(published.size)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Downloads</p>
                  <p className="text-sm font-medium mt-0.5">{published.downloadCount}</p>
                </div>
                {published.checksum && (
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Checksum (SHA-256)</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs font-mono text-muted-foreground truncate max-w-[300px] sm:max-w-[500px]">{published.checksum}</p>
                      <button onClick={() => copyChecksum(published.checksum)} className="shrink-0 text-muted-foreground hover:text-foreground" title="Copy">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {published.releaseNotes && (
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Release Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{published.releaseNotes}</p>
                </div>
              )}
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => window.open(`/api/admin/backup/android-versions/download?id=${published.id}`, '_blank')}>
                <Download className="h-4 w-4 mr-2" /> Download APK
              </Button>
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No published version yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Upload New APK ── */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowUpload(!showUpload)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-600" />
              Upload New APK
            </CardTitle>
            {showUpload ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardHeader>
        {showUpload && (
          <CardContent className="space-y-4 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">App Name</Label>
                <Input value={appName} onChange={e => setAppName(e.target.value)} placeholder="Akolta Dialer" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Version Name *</Label>
                <Input value={versionName} onChange={e => setVersionName(e.target.value)} placeholder="e.g. 1.3.0" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Version Code *</Label>
                <Input type="number" value={versionCode} onChange={e => setVersionCode(e.target.value)} placeholder="e.g. 130" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <select
                  value={uploadStatus}
                  onChange={e => setUploadStatus(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="TESTING">Testing</option>
                  <option value="PUBLISHED">Published (set as active)</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Release Notes</Label>
              <Textarea value={releaseNotes} onChange={e => setReleaseNotes(e.target.value)} placeholder="What's new in this version..." rows={2} className="text-sm" />
            </div>
            <div>
              <input ref={fileInputRef} type="file" accept=".apk" onChange={e => setSelectedFile(e.target.files?.[0] || null)} className="hidden" />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
                <Upload className="h-4 w-4 mr-2" />
                {selectedFile ? (
                  <span className="truncate">{selectedFile.name} ({formatFileSize(selectedFile.size)})</span>
                ) : 'Select APK File (.apk)'}
              </Button>
            </div>
            <Button onClick={handleUpload} disabled={uploading || !selectedFile || !versionName.trim() || !versionCode} className="bg-emerald-600 hover:bg-emerald-700">
              {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</> : <><Upload className="h-4 w-4 mr-2" /> Upload APK</>}
            </Button>
          </CardContent>
        )}
      </Card>

      {/* ── 3. All Versions ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-emerald-600" />
            All Versions
            {versions.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{versions.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Smartphone className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No APK versions uploaded yet.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {versions.map(v => (
                <div
                  key={v.id}
                  className={`flex items-start justify-between p-3 rounded-lg border transition-colors gap-3 ${
                    v.status === 'PUBLISHED'
                      ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">v{v.versionName}</span>
                      <span className="text-xs text-muted-foreground">code {v.versionCode}</span>
                      {statusBadge(v.status)}
                      {v.status === 'PUBLISHED' && (
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 text-[10px] px-1.5 py-0">Default</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      <span>{formatFileSize(v.size)}</span>
                      <span>{formatDateShort(v.createdAt)}</span>
                      <span>{v.downloadCount} downloads</span>
                      {v._count.userAssignments > 0 && <span>{v._count.userAssignments} users</span>}
                      {v._count.orgAssignments > 0 && <span>{v._count.orgAssignments} orgs</span>}
                    </div>
                    {v.releaseNotes && (
                      <p className="text-xs text-muted-foreground mt-1 truncate max-w-[300px]">{v.releaseNotes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => window.open(`/api/admin/backup/android-versions/download?id=${v.id}`, '_blank')} title="Download">
                      <Download className="h-4 w-4" />
                    </Button>
                    {v.status !== 'PUBLISHED' && v.status !== 'ARCHIVED' && (
                      <Button size="sm" variant="ghost" onClick={() => handlePatch('publish', v.id)} disabled={actionLoading === v.id} title="Publish" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                        {actionLoading === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      </Button>
                    )}
                    {v.status === 'ARCHIVED' && (
                      <Button size="sm" variant="ghost" onClick={() => handlePatch('rollback', v.id)} disabled={actionLoading === v.id} title="Rollback" className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30">
                        {actionLoading === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      </Button>
                    )}
                    {v.status !== 'ARCHIVED' && v.status !== 'PUBLISHED' && (
                      <Button size="sm" variant="ghost" onClick={() => handlePatch('archive', v.id)} disabled={actionLoading === v.id} title="Archive" className="text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30">
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openEdit(v)} title="Edit" className="text-muted-foreground hover:text-foreground">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(v)} disabled={deletingId === v.id} title="Delete" className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                      {deletingId === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 4. Version Assignments ── */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowAssignments(!showAssignments)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              Version Assignments
            </CardTitle>
            {showAssignments ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardHeader>
        {showAssignments && (
          <CardContent className="pt-0 space-y-4">
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-200 font-medium flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Assignment priority: Individual user &gt; Organization &gt; Latest published
              </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full">
                <TabsTrigger value="users" className="flex-1">
                  <Users className="h-3.5 w-3.5 mr-1.5" /> Users
                </TabsTrigger>
                <TabsTrigger value="orgs" className="flex-1">
                  <Building2 className="h-3.5 w-3.5 mr-1.5" /> Organizations
                </TabsTrigger>
              </TabsList>

              <TabsContent value="users" className="space-y-4 mt-4">
                {/* Assign user form */}
                <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs font-medium">Assign Version to User</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <Input placeholder="Search users by name or email..." value={userSearch} onChange={e => setUserSearch(e.target.value)} className="h-8 text-sm" />
                      {userResults.length > 0 && (
                        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto">
                          {userResults.map(u => (
                            <button key={u.id} onClick={() => { setAssignTargetId(u.id); setUserSearch(u.name); setUserResults([]); setAssigningType('user') }} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between">
                              <span>{u.name}</span><span className="text-xs text-muted-foreground ml-2">{u.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <select value={assigningType === 'user' ? assignVersionId : assignVersionId} onChange={e => setAssignVersionId(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                      <option value="">Select version...</option>
                      {versions.filter(v => v.status !== 'ARCHIVED').map(v => (
                        <option key={v.id} value={v.id}>v{v.versionName} (code {v.versionCode})</option>
                      ))}
                    </select>
                  </div>
                  <Button size="sm" onClick={handleAssign} disabled={assigning || !assignTargetId || !assignVersionId} className="bg-emerald-600 hover:bg-emerald-700">
                    {assigning ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null} Assign
                  </Button>
                </div>

                {/* User assignments list */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {assignLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : userAssignments.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No user assignments</p>
                  ) : userAssignments.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-2.5 rounded-md border text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{a.user?.name || a.userId}</p>
                        <p className="text-xs text-muted-foreground">{a.user?.email || ''} → v{a.version.versionName}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleRemoveAssignment('user', a.userId)} className="text-red-500 hover:text-red-600 shrink-0 ml-2">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="orgs" className="space-y-4 mt-4">
                {/* Assign org form */}
                <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs font-medium">Assign Version to Organization</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <Input placeholder="Search organizations..." value={orgSearch} onChange={e => setOrgSearch(e.target.value)} className="h-8 text-sm" />
                      {orgResults.length > 0 && (
                        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto">
                          {orgResults.map(o => (
                            <button key={o.id} onClick={() => { setAssignTargetId(o.id); setOrgSearch(o.name); setOrgResults([]); setAssigningType('org') }} className="w-full text-left px-3 py-2 text-sm hover:bg-muted">
                              {o.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <select value={assignVersionId} onChange={e => setAssignVersionId(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                      <option value="">Select version...</option>
                      {versions.filter(v => v.status !== 'ARCHIVED').map(v => (
                        <option key={v.id} value={v.id}>v{v.versionName} (code {v.versionCode})</option>
                      ))}
                    </select>
                  </div>
                  <Button size="sm" onClick={handleAssign} disabled={assigning || !assignTargetId || !assignVersionId} className="bg-emerald-600 hover:bg-emerald-700">
                    {assigning ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null} Assign
                  </Button>
                </div>

                {/* Org assignments list */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {assignLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : orgAssignments.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No organization assignments</p>
                  ) : orgAssignments.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-2.5 rounded-md border text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{a.organization?.name || a.organizationId}</p>
                        <p className="text-xs text-muted-foreground">{a.organization?.email || ''} → v{a.version.versionName}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleRemoveAssignment('org', a.organizationId)} className="text-red-500 hover:text-red-600 shrink-0 ml-2">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        )}
      </Card>

      {/* ── 5. Download Analytics ── */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowAnalytics(!showAnalytics)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-emerald-600" />
              Download Analytics
            </CardTitle>
            {showAnalytics ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardHeader>
        {showAnalytics && (
          <CardContent className="pt-0 space-y-4">
            {analyticsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : analytics ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-600">{analytics.totalDownloads}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Total Downloads</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold">{analytics.thisWeekDownloads}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">This Week</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold">{analytics.todayDownloads}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Today</p>
                  </div>
                </div>

                {analytics.downloadsPerVersion.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2">Downloads by Version</p>
                    <div className="space-y-1.5">
                      {analytics.downloadsPerVersion.map(dv => {
                        const maxCount = Math.max(...analytics.downloadsPerVersion.map(x => x.count), 1)
                        const pct = (dv.count / maxCount) * 100
                        return (
                          <div key={dv.versionId} className="flex items-center gap-3">
                            <span className="text-xs font-mono w-16 shrink-0">v{dv.versionName}</span>
                            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-medium w-10 text-right">{dv.count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {analytics.recentDownloads.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2">Recent Downloads</p>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {analytics.recentDownloads.map(d => (
                        <div key={d.id} className="flex items-center justify-between py-1.5 text-xs border-b last:border-0">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium">{d.userName}</span>
                            <span className="text-muted-foreground ml-1.5">v{d.versionName}</span>
                          </div>
                          <span className="text-muted-foreground ml-2 shrink-0">{formatDateShort(d.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No analytics data available.</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── 6. Settings ── */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowSettings(!showSettings)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4 text-emerald-600" />
              Settings
            </CardTitle>
            {showSettings ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardHeader>
        {showSettings && (
          <CardContent className="pt-0 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Force Minimum Android Version</Label>
              <p className="text-[11px] text-muted-foreground">Users below this version will see a mandatory update warning.</p>
              <div className="flex items-center gap-2">
                <Input value={minVersionInput} onChange={e => setMinVersionInput(e.target.value)} placeholder="e.g. 1.1.0" className="h-9 text-sm max-w-[200px]" />
                <Button size="sm" onClick={handleSaveSettings} disabled={savingSettings} className="bg-emerald-600 hover:bg-emerald-700">
                  {savingSettings ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null} Save
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={!!confirmDelete} onOpenChange={open => { if (!open) setConfirmDelete(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete APK v{confirmDelete?.versionName}?</DialogTitle>
            <DialogDescription>
              This will permanently delete the APK file and all related download records. If this is the published version, the most recent draft/testing version will be promoted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletingId !== null}>
              {deletingId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editDialog} onOpenChange={open => { if (!open) setEditDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Version v{editDialog?.versionName}</DialogTitle>
            <DialogDescription>Update version metadata.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">App Name</Label>
              <Input value={editForm.appName} onChange={e => setEditForm(f => ({ ...f, appName: e.target.value }))} className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Version Name</Label>
                <Input value={editForm.versionName} onChange={e => setEditForm(f => ({ ...f, versionName: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Version Code</Label>
                <Input type="number" value={editForm.versionCode} onChange={e => setEditForm(f => ({ ...f, versionCode: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="DRAFT">Draft</option>
                <option value="TESTING">Testing</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Release Notes</Label>
              <Textarea value={editForm.releaseNotes} onChange={e => setEditForm(f => ({ ...f, releaseNotes: e.target.value }))} rows={2} className="text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={actionLoading !== null} className="bg-emerald-600 hover:bg-emerald-700">
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
