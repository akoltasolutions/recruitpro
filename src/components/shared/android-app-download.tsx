'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Smartphone, Download, Loader2, ChevronDown, ChevronUp, Package, Calendar, HardDrive } from 'lucide-react'
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
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

/**
 * Reusable Android App download section for Settings pages.
 *
 * Layout:
 * - Current Version info card (version, release date, size)
 * - Note: "All users automatically receive the latest version."
 * - Download Current button
 * - Collapsible "Previous Versions" list with individual download buttons
 */
export function AndroidAppDownloadSection() {
  const [versions, setVersions] = useState<ApkVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [showOldVersions, setShowOldVersions] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await authFetch('/api/apk-versions')
        if (res.ok && !cancelled) {
          const data = await res.json()
          setVersions(data.versions || [])
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const activeVersion = versions.find(v => v.isActive)
  const oldVersions = versions.filter(v => !v.isActive)

  const handleDownload = async (v: ApkVersion) => {
    setDownloading(v.id)
    try {
      const res = await authFetch(`/api/apk-versions/download?id=${v.id}`)
      if (!res.ok) {
        toast.error('Download failed. Please try again.')
        setDownloading(null)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `RecruitPro-v${v.version}.apk`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Downloading RecruitPro v${v.version}`)
    } catch {
      toast.error('Download failed. Please try again.')
    }
    setDownloading(null)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Smartphone className="h-4 w-4" />
          Android Application
        </CardTitle>
        <CardDescription>
          Download the RecruitPro Android application
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !activeVersion && versions.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Smartphone className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No app versions available yet.</p>
            <p className="text-xs mt-1">Contact your administrator for the Android app.</p>
          </div>
        ) : (
          <>
            {/* ── Current Version Info ── */}
            {activeVersion && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                    <Package className="h-4 w-4" />
                    Current Android App Version
                  </span>
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 text-[10px] px-2 py-0.5 font-semibold">
                    Latest
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Version */}
                  <div className="space-y-0.5">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Version</p>
                    <p className="text-sm font-bold">v{activeVersion.version}</p>
                  </div>
                  {/* Release Date */}
                  <div className="space-y-0.5">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Release Date
                    </p>
                    <p className="text-sm font-medium">{formatDate(activeVersion.uploadedAt)}</p>
                  </div>
                  {/* Size */}
                  <div className="space-y-0.5">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                      <HardDrive className="h-3 w-3" />
                      Size
                    </p>
                    <p className="text-sm font-medium">{formatFileSize(activeVersion.size)}</p>
                  </div>
                </div>

                {activeVersion.releaseNotes && (
                  <p className="text-xs text-muted-foreground italic pt-1">
                    {activeVersion.releaseNotes}
                  </p>
                )}

                <div className="flex items-center gap-1.5 pt-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                    All users automatically receive the latest version.
                  </p>
                </div>

                {/* Download Current Button */}
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => handleDownload(activeVersion)}
                  disabled={downloading !== null}
                >
                  {downloading === activeVersion.id ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download Current Version (v{activeVersion.version})
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* ── Old Versions (collapsible) ── */}
            {oldVersions.length > 0 && (
              <>
                <Separator />
                <div>
                  <button
                    type="button"
                    onClick={() => setShowOldVersions(!showOldVersions)}
                    className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <span className="flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" />
                      Previous Versions
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                        {oldVersions.length}
                      </Badge>
                    </span>
                    {showOldVersions
                      ? <ChevronUp className="h-4 w-4" />
                      : <ChevronDown className="h-4 w-4" />
                    }
                  </button>

                  {showOldVersions && (
                    <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                      {oldVersions.map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">v{v.version}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                              <span>{formatDate(v.uploadedAt)}</span>
                              <span>{formatFileSize(v.size)}</span>
                            </div>
                            {v.releaseNotes && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[250px]">
                                {v.releaseNotes}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(v)}
                            disabled={downloading !== null}
                            className="shrink-0 ml-3"
                          >
                            {downloading === v.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5 mr-1" />
                            )}
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* If no active version but old ones exist (edge case) */}
            {!activeVersion && versions.length > 0 && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">No active version set. Download a previous version:</p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium">v{v.version}</span>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>{formatDate(v.uploadedAt)}</span>
                          <span>{formatFileSize(v.size)}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(v)}
                        disabled={downloading !== null}
                        className="shrink-0 ml-3"
                      >
                        {downloading === v.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5 mr-1" />
                        )}
                        Download
                      </Button>
                    </div>
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