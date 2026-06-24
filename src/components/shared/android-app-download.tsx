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

/** Shape returned by the legacy /api/download-apk?info=1 endpoint */
interface LegacyApkInfo {
  available: boolean
  version?: string
  releaseDate?: string | null
  releaseNotes?: string | null
  size: number
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'N/A'
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return 'N/A'
  }
}

/**
 * Reusable Android App download section for Settings pages.
 *
 * Data sources (priority order):
 * 1. /api/apk-versions — version-managed APKs (may have multiple versions)
 * 2. /api/download-apk?info=1 — legacy fallback (single APK at upload/recruitpro.apk)
 *
 * Layout:
 * - Current Version info (version, release date, size)
 * - "All users automatically receive the latest version."
 * - Download Current Version button
 * - Collapsible "Previous Versions" list (only when version-managed APKs exist)
 */
export function AndroidAppDownloadSection() {
  const [versions, setVersions] = useState<ApkVersion[]>([])
  const [legacyApk, setLegacyApk] = useState<LegacyApkInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [showOldVersions, setShowOldVersions] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // 1. Try version-managed API first
      let hasVersions = false
      try {
        const res = await authFetch('/api/apk-versions')
        if (res.ok && !cancelled) {
          const data = await res.json()
          const list: ApkVersion[] = data.versions || []
          if (list.length > 0) {
            setVersions(list)
            hasVersions = true
          }
        }
      } catch { /* ignore */ }

      // 2. If no version-managed APKs, fall back to legacy endpoint
      if (!hasVersions && !cancelled) {
        try {
          const res = await fetch('/api/download-apk?info=1')
          if (res.ok && !cancelled) {
            const data: LegacyApkInfo = await res.json()
            if (data.available) {
              setLegacyApk(data)
            }
          }
        } catch { /* ignore */ }
      }

      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const activeVersion = versions.find(v => v.isActive)
  const oldVersions = versions.filter(v => !v.isActive)

  // Determine what to show: version-managed active, or legacy APK, or nothing
  const hasActiveVersion = !!activeVersion
  const hasLegacy = !!legacyApk
  const hasAnyVersion = hasActiveVersion || hasLegacy
  const displayVersion = activeVersion?.version || legacyApk?.version || '1.0'
  const displayDate = activeVersion?.uploadedAt || legacyApk?.releaseDate || null
  const displaySize = activeVersion?.size || legacyApk?.size || 0
  const displayNotes = activeVersion?.releaseNotes || legacyApk?.releaseNotes || ''

  // Download a version-managed APK by ID (authenticated)
  const handleDownloadVersion = async (v: ApkVersion) => {
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

  // Download the current version (version-managed or legacy)
  const handleDownloadCurrent = async () => {
    if (activeVersion) {
      // Use authenticated download for version-managed APK
      await handleDownloadVersion(activeVersion)
    } else if (hasLegacy) {
      // Legacy APK — use public download endpoint (no auth needed)
      setDownloading('legacy')
      try {
        const res = await fetch('/api/download-apk')
        if (!res.ok) {
          toast.error('Download failed. Please try again.')
          setDownloading(null)
          return
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `RecruitPro-v${displayVersion}.apk`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success(`Downloading RecruitPro v${displayVersion}`)
      } catch {
        toast.error('Download failed. Please try again.')
      }
      setDownloading(null)
    }
  }

  const isDownloading = downloading !== null

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
        ) : !hasAnyVersion ? (
          <div className="text-center py-6 text-muted-foreground">
            <Smartphone className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No app versions available yet.</p>
            <p className="text-xs mt-1">Contact your administrator for the Android app.</p>
          </div>
        ) : (
          <>
            {/* ── Current Version Info ── */}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Version */}
                <div className="space-y-0.5">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Version</p>
                  <p className="text-sm font-bold">v{displayVersion}</p>
                </div>
                {/* Release Date */}
                <div className="space-y-0.5">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Release Date
                  </p>
                  <p className="text-sm font-medium">{formatDate(displayDate)}</p>
                </div>
              </div>

              {displaySize > 0 && (
                <div className="space-y-0.5">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    Size
                  </p>
                  <p className="text-sm font-medium">{formatFileSize(displaySize)}</p>
                </div>
              )}

              {displayNotes && (
                <p className="text-xs text-muted-foreground italic pt-1">
                  {displayNotes}
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
                onClick={handleDownloadCurrent}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download Current Version (v{displayVersion})
                  </>
                )}
              </Button>
            </div>

            {/* ── Old Versions (collapsible, only for version-managed APKs) ── */}
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
                            onClick={() => handleDownloadVersion(v)}
                            disabled={isDownloading}
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
          </>
        )}
      </CardContent>
    </Card>
  )
}