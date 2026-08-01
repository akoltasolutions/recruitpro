'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Smartphone, Download, Loader2, Package, Calendar, HardDrive, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface VersionInfo {
  id: string
  versionName: string
  versionCode: number
  size: number
  checksum: string | null
  releaseNotes: string | null
  downloadUrl: string
  publishedAt: string | null
}

interface LatestInfo {
  id: string
  versionName: string
  versionCode: number
}

interface VersionResponse {
  assignedVersion: VersionInfo | null
  latestVersion: LatestInfo | null
  forceMinVersion: string | null
  assignmentSource: 'LATEST' | 'USER_OVERRIDE' | 'ORG_OVERRIDE'
  updateAvailable: boolean
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string | null): string {
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

function parseVersionCode(name: string): number {
  const parts = name.split('.').map(Number)
  return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0)
}

export function AndroidAppDownloadSection() {
  const [data, setData] = useState<VersionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await authFetch('/api/android-app/version')
        if (res.ok && !cancelled) {
          const json = await res.json()
          setData(json)
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const handleDownload = async () => {
    if (!data?.assignedVersion) return
    setDownloading(true)
    try {
      const res = await authFetch('/api/android-app/download')
      if (!res.ok) {
        toast.error('Download failed. Please try again.')
        setDownloading(false)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Akolta-Dialer-v${data.assignedVersion.versionName}.apk`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Downloading Akolta Dialer v${data.assignedVersion.versionName}`)
    } catch {
      toast.error('Download failed. Please try again.')
    }
    setDownloading(false)
  }

  const isBelowMin = data?.forceMinVersion && data?.assignedVersion
    ? parseVersionCode(data.assignedVersion.versionName) < parseVersionCode(data.forceMinVersion)
    : false

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Smartphone className="h-4 w-4" />
          Android Application
        </CardTitle>
        <CardDescription>
          Download the Akolta Dialer Android application
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.assignedVersion ? (
          <div className="text-center py-6 text-muted-foreground">
            <Smartphone className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No app versions available yet.</p>
            <p className="text-xs mt-1">Contact your administrator for the Android app.</p>
          </div>
        ) : (
          <>
            {/* Mandatory update warning */}
            {isBelowMin && (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">Mandatory Update Required</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                    You are on v{data.assignedVersion.versionName}. Minimum required: v{data.forceMinVersion}.
                  </p>
                </div>
              </div>
            )}

            {/* Update available warning */}
            {data.updateAvailable && data.latestVersion && !isBelowMin && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Update Available</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    A newer version (v{data.latestVersion.versionName}) is available.
                  </p>
                </div>
              </div>
            )}

            {/* Version Info Card */}
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                  <Package className="h-4 w-4" />
                  Your Version
                </span>
                {data.assignmentSource === 'LATEST' ? (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 text-[10px] px-2 py-0.5 font-semibold">
                    Latest
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                    {data.assignmentSource === 'USER_OVERRIDE' ? 'Assigned Version' : 'Org Version'}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-0.5">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Version</p>
                  <p className="text-sm font-bold">v{data.assignedVersion.versionName} <span className="text-xs font-normal text-muted-foreground">(code {data.assignedVersion.versionCode})</span></p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Release Date
                  </p>
                  <p className="text-sm font-medium">{formatDate(data.assignedVersion.publishedAt)}</p>
                </div>
              </div>

              {data.assignedVersion.size > 0 && (
                <div className="space-y-0.5">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    Size
                  </p>
                  <p className="text-sm font-medium">{formatFileSize(data.assignedVersion.size)}</p>
                </div>
              )}

              {data.assignedVersion.releaseNotes && (
                <p className="text-xs text-muted-foreground italic pt-1">
                  {data.assignedVersion.releaseNotes}
                </p>
              )}

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={handleDownload}
                disabled={downloading}
              >
                {downloading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Downloading...</>
                ) : (
                  <><Download className="h-4 w-4 mr-2" /> Download Akolta Dialer v{data.assignedVersion.versionName}</>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
