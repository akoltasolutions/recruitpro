'use client'

import { useState, useRef } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Download, Upload, Database, Users, HardDrive, Shield,
  AlertTriangle, CheckCircle, Loader2, Clock, RefreshCw, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import { format } from 'date-fns'

export function BackupManagement() {
  const [downloading, setDownloading] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDownload = async (type: string) => {
    setDownloading(type)
    try {
      const res = await authFetch(`/api/backup?type=${type}`)
      if (!res.ok) throw new Error('Failed to create backup')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url

      const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss')
      if (type === 'database') {
        a.download = `recruitpro-database-${timestamp}.db`
      } else if (type === 'users') {
        a.download = `recruitpro-users-${timestamp}.json`
      } else if (type === 'data') {
        a.download = `recruitpro-data-${timestamp}.json`
      } else {
        a.download = `recruitpro-full-backup-${timestamp}.json`
      }

      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup downloaded successfully')
    } catch {
      toast.error('Failed to download backup')
    } finally {
      setDownloading(null)
    }
  }

  const handleFileSelect = async (file: File) => {
    if (!file) return

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'json' && ext !== 'db') {
      toast.error('Unsupported file format. Please use .json or .db file.')
      return
    }

    setRestoreFile(file)

    // Preview JSON files before restore
    if (ext === 'json') {
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        if (data.version && data.app) {
          setRestorePreview({
            app: data.app,
            version: data.version,
            exportDate: data.exportDate,
            summary: data.summary || {},
          })
          setConfirmDialogOpen(true)
        } else {
          toast.error('Invalid backup file format')
        }
      } catch {
        toast.error('Failed to read backup file. File may be corrupted.')
      }
    } else {
      // .db files — confirm directly
      setRestorePreview({
        app: 'RecruitPro',
        version: 'database',
        exportDate: new Date().toISOString(),
        summary: { type: 'SQLite Database' },
      })
      setConfirmDialogOpen(true)
    }
  }

  const handleRestore = async () => {
    if (!restoreFile) return

    setRestoring(true)
    try {
      const formData = new FormData()
      formData.append('file', restoreFile)

      const res = await authFetch('/api/backup', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (data.success) {
        toast.success(data.message || 'Backup restored successfully!')
        if (data.stats) {
          const statsStr = Object.entries(data.stats)
            .map(([key, val]) => `${key}: ${val}`)
            .join(', ')
          toast.info(`Restored: ${statsStr}`)
        }
      } else {
        toast.error(data.error || 'Failed to restore backup')
      }
    } catch {
      toast.error('Failed to restore backup')
    } finally {
      setRestoring(false)
      setRestoreFile(null)
      setRestorePreview(null)
      setConfirmDialogOpen(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  return (
    <div>
      <PageHeader
        title="Backup & Restore"
        description="Download backups and restore data"
        icon={Database}
      />

      {/* Info Banner */}
      <Alert className="mb-6 border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30">
        <Shield className="h-4 w-4 text-emerald-600" />
        <AlertDescription className="text-sm text-emerald-700 dark:text-emerald-400">
          <strong>Tip:</strong> Always download a full backup before making changes or migrating servers.
          Keep backup files safe — they contain all your data including user passwords.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Download Backup ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="h-4 w-4 text-emerald-600" />
              Download Backup
            </CardTitle>
            <CardDescription>Download a complete backup of your application data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Full Backup */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 shrink-0">
                  <HardDrive className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Full Backup</p>
                  <p className="text-xs text-muted-foreground truncate">All data: users, calls, candidates, settings</p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => handleDownload('full')}
                disabled={!!downloading}
                className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
              >
                {downloading === 'full' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                {downloading === 'full' ? 'Downloading...' : 'Download'}
              </Button>
            </div>

            {/* Database Only */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 shrink-0">
                  <Database className="h-5 w-5 text-purple-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Database File</p>
                  <p className="text-xs text-muted-foreground truncate">Raw SQLite database (.db)</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownload('database')}
                disabled={!!downloading}
                className="shrink-0"
              >
                {downloading === 'database' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                {downloading === 'database' ? 'Downloading...' : 'Download'}
              </Button>
            </div>

            {/* Users Only */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 shrink-0">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Users Export</p>
                  <p className="text-xs text-muted-foreground truncate">User list without passwords</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownload('users')}
                disabled={!!downloading}
                className="shrink-0"
              >
                {downloading === 'users' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                {downloading === 'users' ? 'Downloading...' : 'Download'}
              </Button>
            </div>

            {/* Data Only (no users) */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 shrink-0">
                  <RefreshCw className="h-5 w-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Data Only</p>
                  <p className="text-xs text-muted-foreground truncate">Clients, candidates, calls (no users)</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownload('data')}
                disabled={!!downloading}
                className="shrink-0"
              >
                {downloading === 'data' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                {downloading === 'data' ? 'Downloading...' : 'Download'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Restore Backup ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4 text-amber-600" />
              Restore Backup
            </CardTitle>
            <CardDescription>Restore data from a previously downloaded backup file</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Upload Area */}
            <div
              className={`
                relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-colors
                ${dragOver
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30'
                }
              `}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.db"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelect(file)
                }}
              />
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Drop backup file here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports .json (full/data backup) and .db (database file)
                  </p>
                </div>
              </div>
            </div>

            {/* Warning */}
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm text-amber-700 dark:text-amber-400">
                <strong>Warning:</strong> Restoring a backup will <strong>overwrite existing data</strong> with
                the data from the backup file. This action cannot be undone. Always download a fresh backup before restoring.
              </AlertDescription>
            </Alert>

            {/* Restore Preview Dialog */}
            <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Confirm Restore
                  </DialogTitle>
                  <DialogDescription>
                    This will overwrite your current data with the backup file. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>

                {restorePreview && (
                  <div className="space-y-4 py-2">
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Backup Details</span>
                        <Badge variant="secondary">{restorePreview.app} v{restorePreview.version}</Badge>
                      </div>

                      {restorePreview.exportDate && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          Exported: {format(new Date(restorePreview.exportDate), 'dd MMM yyyy, hh:mm a')}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(restorePreview.summary).map(([key, val]) => (
                          <div key={key} className="p-2 rounded bg-muted/50 text-center">
                            <p className="text-lg font-bold">{typeof val === 'number' ? val : '—'}</p>
                            <p className="text-xs text-muted-foreground capitalize">{String(key).replace(/([A-Z])/g, ' $1')}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                      ⚠️ All current data will be replaced. Make sure you have a recent backup.
                    </p>
                  </div>
                )}

                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setConfirmDialogOpen(false)
                      setRestorePreview(null)
                      setRestoreFile(null)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRestore}
                    disabled={restoring}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {restoring ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Restoring...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Restore Backup
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Last restore status */}
            {restoreFile && !confirmDialogOpen && (
              <div className="flex items-center gap-2 p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <p className="text-sm">File &quot;{restoreFile.name}&quot; ready for restore</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Info */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Backup Types Explained</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="text-sm font-medium">Full Backup</p>
              </div>
              <p className="text-xs text-muted-foreground">Complete snapshot of everything — users, passwords, calls, candidates, settings. Best for migration.</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-purple-500" />
                <p className="text-sm font-medium">Database File</p>
              </div>
              <p className="text-xs text-muted-foreground">Raw SQLite .db file. Exact copy of the database. Fastest restore method.</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <p className="text-sm font-medium">Users Export</p>
              </div>
              <p className="text-xs text-muted-foreground">User list with names, emails, roles. Passwords excluded for security.</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <p className="text-sm font-medium">Data Only</p>
              </div>
              <p className="text-xs text-muted-foreground">All data except users — candidates, calls, clients, dispositions, templates.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface RestorePreview {
  app: string
  version: string
  exportDate: string
  summary: Record<string, unknown>
}
