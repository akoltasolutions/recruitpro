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
  status: 'idle' | 'streaming' | 'paused'
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
  const [requestingUserId, setRequestingUserId] = useState<string | null>(null)

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
      console.log('[ScreenMonitor] Admin connected to WS')
    })

    socket.on('disconnect', () => {
      setConnected(false)
      console.log('[ScreenMonitor] Admin disconnected from WS')
    })

    socket.on('recruiter-list', (data: RecruiterInfo[]) => {
      setRecruiters(data)
      setLoading(false)
    })

    // Recruiter started sharing — update status
    socket.on('screen-share-started', (data: { userId: string; name: string }) => {
      setRecruiters((prev) =>
        prev.map((r) => (r.userId === data.userId ? { ...r, status: 'streaming' } : r)),
      )
    })

    // Recruiter stopped sharing
    socket.on('screen-share-stopped', (data: { userId: string }) => {
      setRecruiters((prev) =>
        prev.map((r) => (r.userId === data.userId ? { ...r, status: 'idle' } : r)),
      )
      if (viewingUserId === data.userId) {
        setViewingUserId(null)
        setViewingName('')
        setFrameSrc(null)
      }
    })

    // Screen ended (recruiter disconnected or other reason)
    socket.on('screen-ended', (data: { userId: string; reason: string }) => {
      if (viewingUserId === data.userId) {
        setViewingUserId(null)
        setViewingName('')
        setFrameSrc(null)
      }
    })

    // Receive screen frame
    socket.on('screen-frame', (data: { userId: string; frame: string; timestamp: number }) => {
      if (data.userId === viewingUserId) {
        setFrameSrc(data.frame)
      }
    })

    // Register as admin
    socket.on('connect', () => {
      socket.emit('admin-register', { userId: user.id, name: user.name || 'Admin' })
    })

    // Immediate register in case already connected
    socket.emit('admin-register', { userId: user.id, name: user.name || 'Admin' })

    return () => {
      socket.disconnect()
    }
  }, [user])

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

  const handleRequestScreen = useCallback(
    (recruiter: RecruiterInfo) => {
      if (!socketRef.current) return
      setRequestingUserId(recruiter.userId)
      socketRef.current.emit('request-screen', { targetUserId: recruiter.userId })
      // Auto-clear requesting state after 30s
      setTimeout(() => setRequestingUserId(null), 30000)
    },
    [],
  )

  const handleViewScreen = useCallback(
    (recruiter: RecruiterInfo) => {
      if (!socketRef.current) return
      setViewingUserId(recruiter.userId)
      setViewingName(recruiter.name)
      socketRef.current.emit('view-screen', { targetUserId: recruiter.userId })
    },
    [],
  )

  const handleStopViewing = useCallback(() => {
    if (!socketRef.current || !viewingUserId) return
    socketRef.current.emit('stop-viewing', { targetUserId: viewingUserId })
    setViewingUserId(null)
    setViewingName('')
    setFrameSrc(null)
  }, [viewingUserId])

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }, [])

  // Clean up on unmount
  useEffect(() => {
    const currentViewing = viewingUserId
    return () => {
      if (socketRef.current && currentViewing) {
        socketRef.current.emit('stop-viewing', { targetUserId: currentViewing })
      }
    }
  }, [viewingUserId])

  // -----------------------------------------------------------------------
  // Compute summary
  // -----------------------------------------------------------------------
  const onlineCount = recruiters.length
  const streamingCount = recruiters.filter((r) => r.status === 'streaming').length
  const viewingRecruiter = recruiters.find((r) => r.userId === viewingUserId)

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
            <p className="text-sm text-muted-foreground">View recruiter screens in real-time</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant={connected ? 'default' : 'destructive'}
            className="gap-1.5 px-3 py-1"
          >
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? 'Connected' : 'Disconnected'}
          </Badge>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>
              {onlineCount} online &middot; {streamingCount} sharing
            </span>
          </div>
        </div>
      </div>

      {/* ── Info banner ────────────────────────────────────────────────── */}
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <p className="font-medium">How Screen Monitor works</p>
            <p className="mt-1 text-amber-700 dark:text-amber-400">
              Click <strong>&quot;Request Screen&quot;</strong> to ask a recruiter to share their screen. The recruiter will
              see a prompt and must accept. Once sharing starts, click <strong>&quot;View Screen&quot;</strong> to watch
              their screen in real-time.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Screen Viewer (when viewing a recruiter) ──────────────────── */}
      {viewingUserId && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Monitor className="h-4 w-4 text-emerald-600" />
                Viewing: {viewingName}
                <Badge variant="default" className="bg-emerald-600 text-xs">
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
                  onClick={handleStopViewing}
                  className="gap-1.5"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Stop Viewing
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
                  <Monitor className="h-12 w-12 mb-3 animate-pulse" />
                  <p className="text-sm">Waiting for screen frames...</p>
                  <p className="text-xs mt-1">
                    {viewingRecruiter?.status === 'streaming'
                      ? 'Receiving data...'
                      : 'Waiting for recruiter to start sharing'}
                  </p>
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
            <h3 className="text-lg font-medium text-muted-foreground">No recruiters online</h3>
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
            const isStreaming = recruiter.status === 'streaming'

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
                    isStreaming
                      ? 'bg-emerald-500'
                      : 'bg-gray-300 dark:bg-gray-700'
                  }`}
                />
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${
                            isStreaming
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
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
                        {isStreaming && (
                          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{recruiter.name}</p>
                        <Badge
                          variant={isStreaming ? 'default' : 'secondary'}
                          className={`text-xs mt-0.5 ${
                            isStreaming
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : ''
                          }`}
                        >
                          {isStreaming ? 'Sharing' : 'Online'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {isStreaming && !isViewing ? (
                      <Button
                        size="sm"
                        onClick={() => handleViewScreen(recruiter)}
                        className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Screen
                      </Button>
                    ) : isViewing ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleStopViewing}
                        className="flex-1 gap-1.5"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        Stop Viewing
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRequestScreen(recruiter)}
                        disabled={!connected || requestingUserId === recruiter.userId}
                        className="flex-1 gap-1.5"
                      >
                        {requestingUserId === recruiter.userId ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Monitor className="h-3.5 w-3.5" />
                        )}
                        {requestingUserId === recruiter.userId
                          ? 'Requested...'
                          : 'Request Screen'}
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
