'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Monitor,
  MonitorOff,
  Eye,
  EyeOff,
  RefreshCw,
  Users,
  Wifi,
  WifiOff,
  Maximize2,
  Minimize2,
  AlertTriangle,
  ScreenShare,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { io, Socket } from 'socket.io-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecruiterInfo {
  userId: string
  name: string
  status: 'idle' | 'monitoring'
  connectedAt: number
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ScreenMonitor() {
  const user = useAuthStore((s) => s.user)
  const [recruiters, setRecruiters] = useState<RecruiterInfo[]>([])
  const [connected, setConnected] = useState(false)
  const [viewingUserId, setViewingUserId] = useState<string | null>(null)
  const [viewingName, setViewingName] = useState('')
  const [frameSrc, setFrameSrc] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [startingUserId, setStartingUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const socketRef = useRef<Socket | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // -----------------------------------------------------------------------
  // Connect to WebSocket
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!user) return

    const socket = io('/?XTransformPort=3004', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 15000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('admin-register', { userId: user.id, name: user.name || 'Admin' })
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('recruiter-list', (data: RecruiterInfo[]) => {
      setRecruiters(data)
      setLoading(false)
    })

    // Recruiter started being monitored
    socket.on('monitoring-started', (data: { userId: string; name: string }) => {
      setRecruiters((prev) =>
        prev.map((r) =>
          r.userId === data.userId ? { ...r, status: 'monitoring' } : r,
        ),
      )
      setStartingUserId(null)
      setError(null)
    })

    // Monitoring ended
    socket.on('monitoring-ended', (data: { userId: string; reason: string }) => {
      setRecruiters((prev) =>
        prev.map((r) =>
          r.userId === data.userId ? { ...r, status: 'idle' } : r,
        ),
      )
      if (viewingUserId === data.userId) {
        setViewingUserId(null)
        setViewingName('')
        setFrameSrc(null)

        if (data.reason === 'capture-denied') {
          setError(
            'Screen capture was denied by the recruiter\'s browser. This can happen if the user clicks "Cancel" on the screen picker.',
          )
        } else if (data.reason === 'disconnected') {
          setError('The recruiter has disconnected from the application.')
        } else {
          setError(null)
        }
      }
    })

    // Receive screen frame
    socket.on('screen-frame', (data: { userId: string; frame: string; timestamp: number }) => {
      if (data.userId === viewingUserId) {
        setFrameSrc(data.frame)
      }
    })

    // Immediate register in case already connected
    socket.emit('admin-register', { userId: user.id, name: user.name || 'Admin' })

    return () => {
      socket.disconnect()
    }
  }, [user, viewingUserId])

  // -----------------------------------------------------------------------
  // Auto-refresh recruiter list
  // -----------------------------------------------------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      socketRef.current?.emit('admin-register', {
        userId: user?.id,
        name: user?.name || 'Admin',
      })
    }, 15000)
    return () => clearInterval(interval)
  }, [user])

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const handleStartMonitoring = useCallback(
    (recruiter: RecruiterInfo) => {
      if (!socketRef.current) return
      setStartingUserId(recruiter.userId)
      setError(null)
      setViewingUserId(recruiter.userId)
      setViewingName(recruiter.name)
      socketRef.current.emit('start-monitoring', {
        targetUserId: recruiter.userId,
      })
    },
    [],
  )

  const handleStopMonitoring = useCallback(() => {
    if (!socketRef.current || !viewingUserId) return
    socketRef.current.emit('stop-monitoring', { targetUserId: viewingUserId })
    setViewingUserId(null)
    setViewingName('')
    setFrameSrc(null)
    setError(null)
  }, [viewingUserId])

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {})
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {})
    }
  }, [])

  // Clean up on unmount
  useEffect(() => {
    const currentViewing = viewingUserId
    return () => {
      if (socketRef.current && currentViewing) {
        socketRef.current.emit('stop-monitoring', {
          targetUserId: currentViewing,
        })
      }
    }
  }, [viewingUserId])

  // -----------------------------------------------------------------------
  // Compute summary
  // -----------------------------------------------------------------------
  const onlineCount = recruiters.length
  const monitoringCount = recruiters.filter((r) => r.status === 'monitoring').length

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950">
            <ScreenShare className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Screen Monitor</h2>
            <p className="text-sm text-muted-foreground">
              View recruiter screens in real-time
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant={connected ? 'default' : 'destructive'}
            className="gap-1.5 px-3 py-1"
          >
            {connected ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {connected ? 'Connected' : 'Disconnected'}
          </Badge>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>
              {onlineCount} online &middot; {monitoringCount} being monitored
            </span>
          </div>
        </div>
      </div>

      {/* ── Info banner ────────────────────────────────────────────────── */}
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <p className="font-medium">Silent Screen Monitoring</p>
            <p className="mt-1 text-amber-700 dark:text-amber-400">
              Click <strong>&quot;Start Monitoring&quot;</strong> on a recruiter card to begin capturing
              their screen. A screen picker will appear on the recruiter&apos;s browser — they need to
              select their screen for capture to begin. Click <strong>&quot;Stop Monitoring&quot;</strong>
              to end the session.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setError(null)}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Screen Viewer (when monitoring a recruiter) ────────────────── */}
      {viewingUserId && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Monitor className="h-4 w-4 text-emerald-600" />
                Monitoring: {viewingName}
                <Badge variant="default" className="bg-red-600 text-xs">
                  LIVE
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={toggleFullscreen}
                  className="gap-1.5"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                  {isFullscreen ? 'Exit' : 'Fullscreen'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleStopMonitoring}
                  className="gap-1.5"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Stop Monitoring
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div
              ref={containerRef}
              className="relative bg-black w-full"
              style={{ aspectRatio: '16 / 9' }}
            >
              {frameSrc ? (
                <img
                  src={frameSrc}
                  alt={`${viewingName}'s screen`}
                  className="w-full h-full object-contain"
                  draggable={false}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60">
                  {startingUserId === viewingUserId ? (
                    <>
                      <RefreshCw className="h-12 w-12 mb-3 animate-spin" />
                      <p className="text-sm">Initiating screen capture...</p>
                      <p className="text-xs mt-1 text-white/40">
                        Waiting for recruiter&apos;s browser to respond
                      </p>
                    </>
                  ) : (
                    <>
                      <Monitor className="h-12 w-12 mb-3 animate-pulse" />
                      <p className="text-sm">Waiting for screen frames...</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Loading state ──────────────────────────────────────────────── */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!loading && recruiters.length === 0 && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center text-center">
            <MonitorOff className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">
              No recruiters online
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Recruiters will appear here when they log into the application.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Recruiter Cards ────────────────────────────────────────────── */}
      {!loading && recruiters.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recruiters.map((recruiter) => {
            const isViewing = viewingUserId === recruiter.userId
            const isMonitoring = recruiter.status === 'monitoring'

            return (
              <Card
                key={recruiter.userId}
                className={`overflow-hidden transition-all ${
                  isViewing ? 'ring-2 ring-emerald-500 shadow-lg' : ''
                }`}
              >
                {/* Status bar */}
                <div
                  className={`h-1 ${
                    isMonitoring
                      ? 'bg-red-500'
                      : 'bg-gray-300 dark:bg-gray-700'
                  }`}
                />
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${
                            isMonitoring
                              ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {recruiter.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)}
                        </div>
                        {isMonitoring && (
                          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{recruiter.name}</p>
                        <Badge
                          variant={isMonitoring ? 'destructive' : 'secondary'}
                          className="text-xs mt-0.5"
                        >
                          {isMonitoring ? 'Monitoring' : 'Online'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {isViewing ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleStopMonitoring}
                        className="flex-1 gap-1.5"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        Stop Monitoring
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant={isMonitoring ? 'default' : 'outline'}
                        onClick={() => handleStartMonitoring(recruiter)}
                        disabled={!connected}
                        className={`flex-1 gap-1.5 ${
                          isMonitoring
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : ''
                        }`}
                      >
                        {isMonitoring ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <Monitor className="h-3.5 w-3.5" />
                        )}
                        {isMonitoring ? 'View Now' : 'Start Monitoring'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
