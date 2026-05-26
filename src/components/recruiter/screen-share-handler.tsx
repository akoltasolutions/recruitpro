'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { io, Socket } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import {
  MonitorUp,
  MonitorOff,
  Eye,
  AlertTriangle,
} from 'lucide-react'

/**
 * ScreenShareHandler
 *
 * This component runs in the background of the Recruiter panel.
 * It:
 * 1. Registers the recruiter with the screen-monitor WebSocket service
 * 2. Listens for screen-share requests from admins
 * 3. Shows a modal prompting the recruiter to accept
 * 4. Captures screen frames via getDisplayMedia and streams them
 * 5. Shows a live indicator when being monitored
 */

export function ScreenShareHandler() {
  const user = useAuthStore((s) => s.user)
  const socketRef = useRef<Socket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [showRequest, setShowRequest] = useState(false)
  const [adminName, setAdminName] = useState('')
  const [isSharing, setIsSharing] = useState(false)
  const [viewerCount, setViewerCount] = useState(0)
  const [connected, setConnected] = useState(false)

  // -----------------------------------------------------------------------
  // Capture & send frames
  // -----------------------------------------------------------------------
  const startCapturing = useCallback(
    (stream: MediaStream) => {
      streamRef.current = stream

      // Set up video element
      const vid = videoRef.current
      if (!vid) return
      vid.srcObject = stream
      vid.play().catch(() => {})

      vid.onloadedmetadata = () => {
        const cv = canvasRef.current
        if (!cv) return
        cv.width = vid.videoWidth
        cv.height = vid.videoHeight

        const ctx = cv.getContext('2d')
        if (!ctx) return

        // Capture frames at ~2 FPS (every 500ms) to keep bandwidth low
        intervalRef.current = setInterval(() => {
          if (!vid || !ctx || !socketRef.current || vid.paused || vid.ended) return

          ctx.drawImage(vid, 0, 0, cv.width, cv.height)

          // Compress to JPEG at reduced quality for bandwidth
          const frame = cv.toDataURL('image/jpeg', 0.5)

          socketRef.current.emit('screen-frame', {
            userId: user?.id,
            frame,
            timestamp: Date.now(),
          })
        }, 500)
      }
    },
    [user],
  )

  const stopCapturing = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsSharing(false)
    setViewerCount(0)
  }, [])

  // -----------------------------------------------------------------------
  // Handle admin request — show prompt
  // -----------------------------------------------------------------------
  const handleAcceptShare = useCallback(async () => {
    setShowRequest(false)

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 2 },
        },
        audio: false,
      })

      setIsSharing(true)

      // Notify server that sharing has started
      socketRef.current?.emit('screen-share-start', { userId: user?.id })

      startCapturing(stream)

      // Listen for stream ending (user clicks "Stop sharing" in browser)
      stream.getVideoTracks()[0].onended = () => {
        stopCapturing()
        socketRef.current?.emit('screen-share-stop', { userId: user?.id })
      }
    } catch (err) {
      console.log('[ScreenShare] User denied screen share or error:', err)
      setIsSharing(false)
    }
  }, [user, startCapturing, stopCapturing])

  const handleDeclineShare = useCallback(() => {
    setShowRequest(false)
  }, [])

  // -----------------------------------------------------------------------
  // Connect to WebSocket service
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!user || user.role !== 'RECRUITER') return

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
      socket.emit('recruiter-register', { userId: user.id, name: user.name || 'Recruiter' })
    })

    socket.on('disconnect', () => {
      setConnected(false)
      stopCapturing()
    })

    // Admin is requesting to see screen
    socket.on('screen-request', (data: { adminName: string; adminId: string }) => {
      setAdminName(data.adminName)
      setShowRequest(true)
    })

    // Viewer count update
    socket.on('viewers-count', (data: { count: number }) => {
      setViewerCount(data.count)
    })

    // No viewers left — optionally auto-stop
    socket.on('no-viewers', () => {
      // Don't auto-stop; let the recruiter decide
      setViewerCount(0)
    })

    // Reconnect handler
    socket.on('connect', () => {
      socket.emit('recruiter-register', { userId: user.id, name: user.name || 'Recruiter' })
    })

    return () => {
      stopCapturing()
      socket.disconnect()
    }
  }, [user, stopCapturing])

  // -----------------------------------------------------------------------
  // Manual stop button
  // -----------------------------------------------------------------------
  const handleStopSharing = useCallback(() => {
    stopCapturing()
    socketRef.current?.emit('screen-share-stop', { userId: user?.id })
  }, [user, stopCapturing])

  // Don't render for non-recruiters
  if (!user || user.role !== 'RECRUITER') return null

  return (
    <>
      {/* Hidden canvas and video for frame capture */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      <video ref={videoRef} className="hidden" playsInline muted aria-hidden="true" />

      {/* ── Screen Share Request Modal ───────────────────────────────── */}
      {showRequest && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background rounded-xl shadow-2xl border max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950 shrink-0">
                <Eye className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg">Screen Share Request</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  <strong>{adminName}</strong> is requesting to view your screen.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                By accepting, you agree to share your screen with the administrator. You can
                stop sharing at any time by clicking the stop button or using the browser&apos;s
                built-in stop sharing control.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={handleAcceptShare}
                className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <MonitorUp className="h-4 w-4" />
                Share Screen
              </Button>
              <Button
                onClick={handleDeclineShare}
                variant="outline"
                className="flex-1 gap-2"
              >
                Decline
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Live Monitoring Indicator ─────────────────────────────────── */}
      {isSharing && (
        <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:bottom-4 sm:w-auto z-[10001]">
          <div className="flex items-center gap-3 bg-red-600 text-white rounded-lg shadow-lg px-4 py-3 animate-in slide-in-from-bottom duration-300">
            <span className="flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Screen is being shared</p>
              <p className="text-xs text-red-100">
                {viewerCount > 0
                  ? `${viewerCount} viewer${viewerCount > 1 ? 's' : ''} watching`
                  : 'No viewers currently'}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleStopSharing}
              className="text-white hover:bg-red-700 hover:text-white gap-1.5 shrink-0"
            >
              <MonitorOff className="h-3.5 w-3.5" />
              Stop
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
