'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Smartphone, Download, Loader2, Package } from 'lucide-react'
import { toast } from 'sonner'

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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

/**
 * Reusable Android App download section.
 * Shows a dropdown of all available APK versions and a download button.
 * Can be placed in any Settings page (recruiter, admin, super-admin).
 */
export function AndroidAppDownloadSection() {
  const [versions, setVersions] = useState<ApkVersion[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await authFetch('/api/apk-versions')
        if (res.ok && !cancelled) {
          const data = await res.json()
          const list: ApkVersion[] = data.versions || []
          setVersions(list)
          // Auto-select the active version, or the first (newest)
          const active = list.find(v => v.isActive)
          if (active) setSelectedId(active.id)
          else if (list.length > 0) setSelectedId(list[0].id)
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const selectedVersion = versions.find(v => v.id === selectedId)

  const handleDownload = async () => {
    if (!selectedId || !selectedVersion) return
    setDownloading(true)
    try {
      // Use authFetch to include Bearer token, then create a blob download link
      const res = await authFetch(`/api/apk-versions/download?id=${selectedId}`)
      if (!res.ok) {
        toast.error('Download failed. Please try again.')
        setDownloading(false)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `RecruitPro-v${selectedVersion.version}.apk`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Downloading RecruitPro v${selectedVersion.version}`)
    } catch {
      toast.error('Download failed. Please try again.')
    }
    setDownloading(false)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Smartphone className="h-4 w-4" />
          Android App Download
        </CardTitle>
        <CardDescription>
          Download the RecruitPro Android application. Select a version from the list below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Smartphone className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No app versions available yet.</p>
            <p className="text-xs mt-1">Contact your administrator for the Android app.</p>
          </div>
        ) : (
          <>
            {/* Version Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Version</label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a version" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">v{v.version}</span>
                        {v.isActive && (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 text-[10px] px-1.5 py-0">
                            Active
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(v.size)}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Selected version details */}
            {selectedVersion && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" />
                    RecruitPro v{selectedVersion.version}
                  </span>
                  {selectedVersion.isActive && (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 text-[10px] px-1.5 py-0">
                      Latest Active
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatFileSize(selectedVersion.size)}</span>
                  <span>{formatDate(selectedVersion.uploadedAt)}</span>
                </div>
                {selectedVersion.releaseNotes && (
                  <p className="text-xs text-muted-foreground italic">
                    {selectedVersion.releaseNotes}
                  </p>
                )}
              </div>
            )}

            {/* Download Button */}
            <Button
              className="w-full"
              onClick={handleDownload}
              disabled={!selectedId || downloading}
            >
              {downloading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Download APK
                  {selectedVersion && (
                    <span className="ml-1.5 font-normal opacity-80">
                      (v{selectedVersion.version})
                    </span>
                  )}
                </>
              )}
            </Button>

            {/* All versions list */}
            {versions.length > 1 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2 font-medium">
                  All Available Versions ({versions.length})
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedId(v.id)}
                      className={`flex items-center justify-between w-full rounded-md px-3 py-2 text-sm transition-colors text-left ${
                        v.id === selectedId
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium">v{v.version}</span>
                        {v.isActive && (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 text-[10px] px-1.5 py-0">
                            Active
                          </Badge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(v.size)} · {formatDate(v.uploadedAt)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}