'use client'

import { useState, useRef, useCallback } from 'react'
import { authFetch } from '@/stores/auth-store'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  DatabaseBackup, Download, Upload, Users, FileSpreadsheet,
  Shield, AlertTriangle, Loader2, CheckCircle, HardDrive,
  FileCode, UserPlus, TableProperties, Archive, Package, FileArchive, File, Layers,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface ColumnMapping {
  [targetField: string]: string
}

interface PreviewData {
  totalRows: number
  headers: string[]
  sampleData: Record<string, string>[]
}

interface ImportResult {
  imported: number
  skipped: number
  totalRows: number
  errors: string[]
}

const TARGET_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'email', label: 'Email', required: true },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'role', label: 'Role', required: false },
  { key: 'designation', label: 'Designation', required: false },
  { key: 'department', label: 'Department', required: false },
  { key: 'organization', label: 'Organization', required: false },
]

// ── Code backup format definitions ─────────────────────────────────────────

const CODE_FORMATS = [
  {
    key: 'zip',
    label: '.ZIP',
    description: 'Universal format — works on all platforms',
    icon: Archive,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
    badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    needsSystem: false,
  },
  {
    key: 'tar',
    label: '.TAR',
    description: 'Uncompressed archive — fast to create',
    icon: Package,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    needsSystem: false,
  },
  {
    key: 'tar.gz',
    label: '.TAR.GZ',
    description: 'Compressed tar — smallest file size',
    icon: FileArchive,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    recommended: true,
    needsSystem: false,
  },
  {
    key: '7z',
    label: '.7Z',
    description: 'High compression — needs p7zip installed',
    icon: File,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
    badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    needsSystem: true,
  },
] as const

type CodeFormat = typeof CODE_FORMATS[number]['key']

// ── Component ──────────────────────────────────────────────────────────────

export function BackupRestorePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup & Restore"
        description="Manage code backups, database operations, and data imports/exports"
        icon={DatabaseBackup}
      />

      <Tabs defaultValue="code" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full overflow-x-auto">
          <TabsTrigger value="code" className="text-xs sm:text-sm gap-1.5">
            <FileCode className="h-4 w-4 hidden sm:block" />
            Code
          </TabsTrigger>
          <TabsTrigger value="database" className="text-xs sm:text-sm gap-1.5">
            <HardDrive className="h-4 w-4 hidden sm:block" />
            Database
          </TabsTrigger>
          <TabsTrigger value="restore" className="text-xs sm:text-sm gap-1.5">
            <Shield className="h-4 w-4 hidden sm:block" />
            Restore
          </TabsTrigger>
          <TabsTrigger value="export" className="text-xs sm:text-sm gap-1.5">
            <Download className="h-4 w-4 hidden sm:block" />
            Export
          </TabsTrigger>
          <TabsTrigger value="import" className="text-xs sm:text-sm gap-1.5">
            <Upload className="h-4 w-4 hidden sm:block" />
            Import
          </TabsTrigger>
        </TabsList>

        <CodeBackupSection />
        <DatabaseBackupSection />
        <DatabaseRestoreSection />
        <ExportSection />
        <ImportSection />
      </Tabs>
    </div>
  )
}

// ── Section 1: Code Backup ──────────────────────────────────────────────────

function CodeBackupSection() {
  const [loadingFormat, setLoadingFormat] = useState<string | null>(null)
  const [preDeployLoading, setPreDeployLoading] = useState(false)
  const [lastBackup, setLastBackup] = useState<string | null>(null)
  const [preDeployInfo, setPreDeployInfo] = useState<{ filename: string; size: string; time: string } | null>(null)

  const handleCodeBackup = useCallback(async (format: CodeFormat) => {
    setLoadingFormat(format)
    try {
      const res = await authFetch(`/api/admin/backup/code?format=${format}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create backup')
      }
      const blob = await res.blob()
      downloadBlob(blob, `recruitpro-backup.${format}`)
      setLastBackup(new Date().toLocaleString())
      toast.success(`Code backup (.${format}) downloaded successfully`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create code backup')
    } finally {
      setLoadingFormat(null)
    }
  }, [])

  const handlePreDeployBackup = useCallback(async () => {
    setPreDeployLoading(true)
    try {
      const res = await authFetch('/api/admin/backup/code', {
        method: 'POST',
        body: JSON.stringify({ action: 'pre-deploy' }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create pre-deploy backup')
      }
      setPreDeployInfo({
        filename: data.filename,
        size: data.size,
        time: new Date().toLocaleString(),
      })
      toast.success(`Pre-deploy backup saved: ${data.filename} (${data.size})`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create pre-deploy backup')
    } finally {
      setPreDeployLoading(false)
    }
  }, [])

  return (
    <TabsContent value="code" className="space-y-4">
      {/* ── Quick Download Buttons ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileCode className="h-5 w-5 text-amber-500" />
            Code Backup
          </CardTitle>
          <CardDescription>
            Download a compressed archive of the entire application source code. Excludes node_modules, .next, .git, upload, skills, and log files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Format Buttons Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CODE_FORMATS.map((fmt) => {
              const Icon = fmt.icon
              const isLoading = loadingFormat === fmt.key
              return (
                <div
                  key={fmt.key}
                  className={`rounded-lg border p-3 ${fmt.bgColor} transition-all hover:shadow-sm`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-5 w-5 ${fmt.color}`} />
                      <span className="font-semibold text-sm">{fmt.label}</span>
                      {fmt.recommended && (
                        <Badge className={`${fmt.badgeColor} text-[10px] px-1.5 py-0`}>
                          Recommended
                        </Badge>
                      )}
                    </div>
                    {fmt.needsSystem && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        <Layers className="h-3 w-3 mr-0.5" />
                        System
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2.5">{fmt.description}</p>
                  <Button
                    onClick={() => handleCodeBackup(fmt.key)}
                    disabled={isLoading}
                    size="sm"
                    className="w-full"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Download .{fmt.key}
                      </>
                    )}
                  </Button>
                </div>
              )
            })}
          </div>

          {lastBackup && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Last download: {lastBackup}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pre-Deploy Backup ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HardDrive className="h-5 w-5 text-orange-500" />
            Pre-Deploy Backup
          </CardTitle>
          <CardDescription>
            Creates a .tar.gz backup on the server filesystem before deploying updates. Automatically keeps the last 5 backups.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handlePreDeployBackup}
            disabled={preDeployLoading}
            className="w-full sm:w-auto"
          >
            {preDeployLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Pre-Deploy Backup...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 mr-2" />
                Create Pre-Deploy Backup (.tar.gz)
              </>
            )}
          </Button>

          {preDeployInfo && (
            <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 p-3">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-xs text-green-700 dark:text-green-400 space-y-0.5">
                  <p className="font-semibold">Pre-deploy backup saved</p>
                  <p>File: <span className="font-mono">{preDeployInfo.filename}</span></p>
                  <p>Size: {preDeployInfo.size} &middot; Time: {preDeployInfo.time}</p>
                </div>
              </div>
            </div>
          )}

          <Separator className="my-3" />

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Excluded:</strong> node_modules, .next, .git, upload/, skills/, dev.log, worklog.md, .zscripts/, backups/
            </p>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  )
}

// ── Section 2: Database Backup ─────────────────────────────────────────────

function DatabaseBackupSection() {
  const [loading, setLoading] = useState(false)
  const [lastBackup, setLastBackup] = useState<string | null>(null)

  const handleDatabaseBackup = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/admin/backup/database', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create database backup')
      }
      const blob = await res.blob()
      downloadBlob(blob, 'recruitpro-db-backup.sql')
      setLastBackup(new Date().toLocaleString())
      toast.success('Database backup downloaded successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create database backup')
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <TabsContent value="database" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HardDrive className="h-5 w-5 text-blue-500" />
            Database Backup
          </CardTitle>
          <CardDescription>
            Generate a full SQL dump of the SQLite database. This can be used to restore the database later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleDatabaseBackup} disabled={loading} className="w-full sm:w-auto">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating SQL Dump...
              </>
            ) : (
              <>
                <DatabaseBackup className="h-4 w-4 mr-2" />
                Generate Database Backup
              </>
            )}
          </Button>

          {lastBackup && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Last backup: {lastBackup}
            </div>
          )}

          <Separator className="my-3" />

          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <strong>Warning:</strong> Restoring a database backup will overwrite all current data. 
                Always create a backup before restoring.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  )
}

// ── Section 3: Database Restore ───────────────────────────────────────────────

function DatabaseRestoreSection() {
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleRestore = useCallback(async () => {
    if (!selectedFile) {
      toast.error('Please select a file first')
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await authFetch('/api/admin/backup/restore', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Restore failed')
      }

      toast.success(data.message || 'Database restored successfully')
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore database')
    } finally {
      setLoading(false)
      setConfirmOpen(false)
    }
  }, [selectedFile])

  const handleConfirm = () => {
    setConfirmOpen(true)
  }

  return (
    <TabsContent value="restore" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-red-500" />
            Database Restore
          </CardTitle>
          <CardDescription>
            Restore a database from a previously created SQL backup file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3 mb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div className="text-xs text-red-700 dark:text-red-400 space-y-1">
                <p><strong>WARNING: This is a destructive operation!</strong></p>
                <p>Restoring a backup will completely overwrite the current database. A pre-restore backup will be automatically created before proceeding.</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".sql"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  setSelectedFile(file)
                }}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full sm:w-auto"
              >
                <Upload className="h-4 w-4 mr-2" />
                {selectedFile ? selectedFile.name : 'Select SQL File'}
              </Button>
            </div>

            {selectedFile && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">{(selectedFile.size / 1024).toFixed(1)} KB</Badge>
                <span className="text-muted-foreground truncate max-w-[200px]">{selectedFile.name}</span>
              </div>
            )}
          </div>

          <Button
            onClick={handleConfirm}
            disabled={!selectedFile || loading}
            variant="destructive"
            className="w-full sm:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Restoring Database...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 mr-2" />
                Restore Database
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm Database Restore"
        description={
          selectedFile
            ? `You are about to restore the database from "${selectedFile.name}". This will overwrite ALL current data. A pre-restore backup will be created automatically. Are you absolutely sure?`
            : 'No file selected.'
        }
        confirmLabel="Yes, Restore Database"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleRestore}
      />
    </TabsContent>
  )
}

// ── Section 4: Export Data ──────────────────────────────────────────────────

function ExportSection() {
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [format, setFormat] = useState<'csv' | 'excel'>('csv')

  const handleExport = useCallback(async (type: 'users' | 'candidates') => {
    if (type === 'users') setLoadingUsers(true)
    else setLoadingCandidates(true)

    try {
      const endpoint = type === 'users'
        ? `/api/admin/backup/export-users?format=${format}`
        : `/api/admin/backup/export-candidates?format=${format}`

      const res = await authFetch(endpoint)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Export failed')
      }

      const blob = await res.blob()
      const ext = format === 'excel' ? '.xlsx' : '.csv'
      downloadBlob(blob, `${type}-export${ext}`)
      toast.success(`${type === 'users' ? 'Users' : 'Candidates'} exported successfully`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    } finally {
      if (type === 'users') setLoadingUsers(false)
      else setLoadingCandidates(false)
    }
  }, [format])

  return (
    <TabsContent value="export" className="space-y-4">
      {/* Users Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-emerald-500" />
            Export Recruiters / Users
          </CardTitle>
          <CardDescription>
            Export all users with their organization, department, and designation details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            <strong>Columns:</strong> Name, Email, Phone, Role, Organization, Department, Designation, Status, Created Date
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Select value={format} onValueChange={(v) => setFormat(v as 'csv' | 'excel')} modal={false}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="excel">Excel (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => handleExport('users')} disabled={loadingUsers} className="w-full sm:w-auto">
              {loadingUsers ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export Users
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Candidates Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5 text-violet-500" />
            Export Candidates
          </CardTitle>
          <CardDescription>
            Export all candidates with their call list, status, and pipeline stage information.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            <strong>Columns:</strong> Name, Phone, Email, Job Role, Location, Company, Status, Call List, Pipeline Stage, Created Date, Notes
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Select value={format} onValueChange={(v) => setFormat(v as 'csv' | 'excel')} modal={false}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="excel">Excel (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => handleExport('candidates')} disabled={loadingCandidates} className="w-full sm:w-auto">
              {loadingCandidates ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export Candidates
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  )
}

// ── Section 5: Import Users ──────────────────────────────────────────────────

function ImportSection() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [resultDialogOpen, setResultDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-generate default mapping when preview data changes
  const autoMap = useCallback((headers: string[]) => {
    const autoMapping: ColumnMapping = {}
    for (const target of TARGET_FIELDS) {
      const matched = headers.find(
        (h) =>
          h.toLowerCase() === target.key.toLowerCase() ||
          h.toLowerCase() === target.label.toLowerCase() ||
          h.toLowerCase().includes(target.key.toLowerCase())
      )
      autoMapping[target.key] = matched || '__skip__'
    }
    setMapping(autoMapping)
  }, [])

  const handlePreview = useCallback(async () => {
    if (!selectedFile) {
      toast.error('Please select a file first')
      return
    }

    setPreviewLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await authFetch('/api/admin/backup/import-users?action=preview', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Preview failed')
      }

      setPreviewData(data)
      autoMap(data.headers)
      setPreviewDialogOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to preview file')
    } finally {
      setPreviewLoading(false)
    }
  }, [selectedFile, autoMap])

  const handleImport = useCallback(async () => {
    if (!selectedFile || !previewData) {
      toast.error('Missing file or preview data')
      return
    }

    setImportLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('mapping', JSON.stringify(mapping))

      const res = await authFetch('/api/admin/backup/import-users?action=import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Import failed')
      }

      setImportResult(data)
      setResultDialogOpen(true)
      toast.success(`Successfully imported ${data.imported} users`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import users')
    } finally {
      setImportLoading(false)
    }
  }, [selectedFile, previewData, mapping])

  return (
    <TabsContent value="import" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-emerald-500" />
            Import Users
          </CardTitle>
          <CardDescription>
            Import users from a CSV or Excel file. Supports column mapping for flexible data structures.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                setSelectedFile(file)
                setPreviewData(null)
                setImportResult(null)
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto"
            >
              <Upload className="h-4 w-4 mr-2" />
              {selectedFile ? selectedFile.name : 'Select File (CSV/Excel)'}
            </Button>
          </div>

          {selectedFile && (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{(selectedFile.size / 1024).toFixed(1)} KB</Badge>
              <span className="text-muted-foreground truncate max-w-[200px]">{selectedFile.name}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Button
              onClick={handlePreview}
              disabled={!selectedFile || previewLoading}
              variant="outline"
              className="w-full sm:w-auto"
            >
              {previewLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <TableProperties className="h-4 w-4 mr-2" />
                  Preview Data
                </>
              )}
            </Button>

            <Button
              onClick={handleImport}
              disabled={!selectedFile || !previewData || importLoading}
              className="w-full sm:w-auto"
            >
              {importLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Import Users
                </>
              )}
            </Button>
          </div>

          {importResult && (
            <div className="rounded-lg border bg-green-50 dark:bg-green-950/30 p-3 mt-2">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-xs text-green-700 dark:text-green-400">
                  <p className="font-semibold">Import Complete</p>
                  <p>Imported: <strong>{importResult.imported}</strong> | Skipped: <strong>{importResult.skipped}</strong> | Total: <strong>{importResult.totalRows}</strong></p>
                  {importResult.errors.length > 0 && (
                    <p className="mt-1 text-red-600 dark:text-red-400">
                      {importResult.errors.length} errors occurred. Check details for more info.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Preview / Column Mapping Dialog ──────────────────────────── */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-[calc(100%-1.5rem)] sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TableProperties className="h-5 w-5" />
              Column Mapping
            </DialogTitle>
            <DialogDescription>
              Map the columns from your file to the target fields. Auto-mapped columns are pre-selected.
            </DialogDescription>
          </DialogHeader>

          {previewData && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">{previewData.totalRows} rows</Badge>
                <Badge variant="outline">{previewData.headers.length} columns</Badge>
              </div>

              {/* Column Mapping Grid */}
              <div className="space-y-3">
                {TARGET_FIELDS.map((target) => (
                  <div key={target.key} className="grid grid-cols-[1fr_24px_1fr] items-center gap-2">
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      {target.label}
                      {target.required && (
                        <span className="text-red-500">*</span>
                      )}
                    </div>
                    <span className="text-muted-foreground text-center">←</span>
                    <Select
                      value={mapping[target.key] || '__skip__'}
                      onValueChange={(v) =>
                        setMapping((prev) => ({ ...prev, [target.key]: v }))
                      }
                      modal={false}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip__">— Skip —</SelectItem>
                        {previewData.headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Preview Data Table */}
              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto max-h-48">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        {previewData.headers.map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.sampleData.map((row, idx) => (
                        <tr key={idx} className="border-t">
                          {previewData.headers.map((h) => (
                            <td key={h} className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate">
                              {row[h] || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Showing first 3 rows of {previewData.totalRows} total rows.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => {
                  setPreviewDialogOpen(false)
                  // Import will happen via the main Import button
                }}>
                  Apply Mapping
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Import Result Dialog ──────────────────────────────────────── */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-w-[calc(100%-1.5rem)] sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Import Results
            </DialogTitle>
            <DialogDescription>
              Summary of the user import operation.
            </DialogDescription>
          </DialogHeader>

          {importResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-green-50 dark:bg-green-950/30 p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-1">Imported</p>
                </div>
                <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{importResult.skipped}</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">Skipped</p>
                </div>
                <div className="rounded-lg border bg-muted p-3 text-center">
                  <p className="text-2xl font-bold">{importResult.totalRows}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total</p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-red-600">
                    Errors ({importResult.errors.length}):
                  </p>
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 max-h-48 overflow-y-auto">
                    <ul className="space-y-1">
                      {importResult.errors.map((err, idx) => (
                        <li key={idx} className="text-xs text-red-600 dark:text-red-400">
                          • {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                All imported users have been assigned random passwords. They will need to reset their password on first login.
              </p>

              <div className="flex justify-end">
                <Button onClick={() => setResultDialogOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </TabsContent>
  )
}

// ── Shared Helpers ─────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, fallbackName?: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fallbackName || 'download'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
