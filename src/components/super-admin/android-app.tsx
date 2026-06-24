'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { authFetch } from '@/stores/auth-store'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Smartphone, Package, Layers, Download, Upload, Loader2, CheckCircle, AlertTriangle,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface ApkVersion {
  id: string
  version: string
  fileName: string
  originalName: string
  size: number
  uploadedAt: string
  releaseNotes: string
  isActive: boolean
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Main Page Component ──────────────────────────────────────────────────

export function AndroidAppPage() {
  const [versions, setVersions] = useState<ApkVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [version, setVersion] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [setActive, SetSetActive] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ApkVersion | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await authFetch('/api/admin/backup/android-versions')
        if (res.ok && !cancelled) {
          const data = await res.json()
          setVersions(data.versions || [])
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const fetchVersions = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/backup/android-versions')
      if (res.ok) {
        const data = await res.json()
        setVersions(data.versions || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const handleUpload = async () => {
    if (!selectedFile || !version.trim()) {
      toast.error('Please select an APK file and enter a version number')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('apk', selectedFile)
      formData.append('version', version.trim())
      formData.append('releaseNotes', releaseNotes.trim())
      formData.append('setActive', String(setActive))

      const res = await authFetch('/api/admin/backup/android-versions', {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        toast.success(`APK v${version.trim()} uploaded successfully!`)
        setVersion('')
        setReleaseNotes('')
        setSelectedFile(null)
        SetSetActive(true)
        if (fileInputRef.current) fileInputRef.current.value = ''
        fetchVersions()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Upload failed')
      }
    } catch {
      toast.error('Upload failed')
    }
    setUploading(false)
  }

  const handleSetActive = async (v: ApkVersion) => {
    setActivatingId(v.id)
    try {
      const res = await authFetch('/api/admin/backup/android-versions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: v.id }),
      })
      if (res.ok) {
        toast.success(`v${v.version} set as active version`)
        fetchVersions()
      } else {
        toast.error('Failed to set active version')
      }
    } catch { toast.error('Failed') }
    setActivatingId(null)
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeletingId(confirmDelete.id)
    try {
      const res = await authFetch(`/api/admin/backup/android-versions?id=${confirmDelete.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success(`v${confirmDelete.version} deleted`)
        setConfirmDelete(null)
        fetchVersions()
      } else {
        toast.error('Delete failed')
      }
    } catch { toast.error('Delete failed') }
    setDeletingId(null)
  }

  const handleDownload = (v: ApkVersion) => {
    window.open(`/api/admin/backup/android-versions/download?id=${v.id}`, '_blank')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Android App"
        description="Manage Android APK versions. Upload new builds and set the active version served to all users."
        icon={Smartphone}
      />

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5 text-emerald-600" />
            Upload New APK Version
          </CardTitle>
          <CardDescription>
            Upload Android APK files. The active version is served to all users via the login page download button.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Version *</label>
              <input
                type="text"
                placeholder="e.g. 1.0.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Release Notes</label>
              <input
                type="text"
                placeholder="e.g. Fixed auto-dial, added dark mode"
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept=".apk"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                {selectedFile ? selectedFile.name : 'Select APK File (.apk)'}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="setActive"
              type="checkbox"
              checked={setActive}
              onChange={(e) => SetSetActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="setActive" className="text-sm">
              Set as active version (served to users on login page)
            </label>
          </div>

          <Button
            onClick={handleUpload}
            disabled={uploading || !selectedFile || !version.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</> : <><Upload className="h-4 w-4 mr-2" /> Upload APK</>}
          </Button>
        </CardContent>
      </Card>

      {/* Version List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Layers className="h-5 w-5 text-blue-600" />
            All Versions
            {versions.length > 0 && (
              <Badge variant="secondary" className="ml-2">{versions.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Smartphone className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No APK versions uploaded yet.</p>
              <p className="text-xs mt-1">Upload your first version above.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {versions
                .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
                .map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                    v.isActive
                      ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">v{v.version}</span>
                      {v.isActive && (
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 text-[10px] px-1.5 py-0">
                          Active
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{formatFileSize(v.size)}</span>
                      <span>{new Date(v.uploadedAt).toLocaleDateString()}</span>
                      {v.releaseNotes && (
                        <span className="truncate max-w-[200px]">{v.releaseNotes}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDownload(v)}
                      title="Download this version"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {!v.isActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSetActive(v)}
                        disabled={activatingId === v.id}
                        title="Set as active version"
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                      >
                        {activatingId === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDelete(v)}
                      disabled={deletingId === v.id}
                      title="Delete this version"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      {deletingId === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete APK v{confirmDelete?.version}?</DialogTitle>
            <DialogDescription>
              This will permanently delete the APK file. If this is the active version, the most recent remaining version will become active.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletingId !== null}>
              {deletingId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}