'use client'

import React from 'react'
import { useState, useEffect } from 'react'
import { WifiOff, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Network-aware wrapper that detects offline status and provides retry capability.
 * Designed for Android WebView environments.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

interface OfflineOverlayProps {
  isOnline: boolean
  onRetry?: () => void
  retrying?: boolean
}

/**
 * Full-screen offline overlay shown when network is unavailable.
 * Includes a retry button that re-checks connectivity.
 */
export function OfflineOverlay({ isOnline, onRetry, retrying }: OfflineOverlayProps) {
  if (isOnline) return null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 p-8 max-w-sm text-center">
        <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
          <WifiOff className="h-8 w-8 text-red-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">No Internet Connection</h2>
          <p className="text-sm text-muted-foreground">
            Please check your network connection and try again.
          </p>
        </div>
        <Button
          onClick={onRetry}
          disabled={retrying}
          className="gap-2"
        >
          {retrying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              Retry
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// ── Chunk error detection ──────────────────────────────────────────

/** Check if an error is a chunk loading failure */
function isChunkLoadError(error: Error): boolean {
  if (!error || !error.message) return false
  const msg = error.message.toLowerCase()
  return (
    msg.includes('loading chunk') ||
    msg.includes('loading script') ||
    msg.includes('chunkloaderror') ||
    msg.includes('chunk failed') ||
    msg.includes('network error') ||
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('script error') ||
    msg.includes('dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    error.name === 'ChunkLoadError'
  )
}

const MAX_CHUNK_RETRIES = 3
const CHUNK_RETRY_KEY = '__component_chunk_retry'

function getChunkRetryCount(): number {
  try { return parseInt(sessionStorage.getItem(CHUNK_RETRY_KEY) || '0', 10) } catch { return 0 }
}

function incrementChunkRetryCount(): number {
  const count = getChunkRetryCount() + 1
  try { sessionStorage.setItem(CHUNK_RETRY_KEY, String(count)) } catch { /* ignore */ }
  return count
}

function resetChunkRetryCount(): void {
  try { sessionStorage.removeItem(CHUNK_RETRY_KEY) } catch { /* ignore */ }
}

// ── Error Boundary ─────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  autoRetrying: boolean
  countdown: number
}

/**
 * Enhanced error boundary that:
 * - Catches rendering errors and shows recovery UI
 * - Auto-detects chunk loading errors and auto-retries
 * - Auto-reloads on chunk failures (up to 3 times with cache-busting)
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  ErrorBoundaryState
> {
  private retryTimer: ReturnType<typeof setInterval> | null = null

  constructor(props: { children: React.ReactNode; onReset?: () => void }) {
    super(props)
    this.state = { hasError: false, error: null, autoRetrying: false, countdown: 3 }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, autoRetrying: false, countdown: 3 }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Caught error:', error?.message, errorInfo)

    // Auto-retry for chunk errors
    if (isChunkLoadError(error)) {
      const count = incrementChunkRetryCount()
      if (count <= MAX_CHUNK_RETRIES) {
        console.warn(`[AppErrorBoundary] Chunk error detected, auto-retry ${count}/${MAX_CHUNK_RETRIES}`)
        this.setState({ autoRetrying: true, countdown: 3 })
        this.retryTimer = setInterval(() => {
          this.setState(prev => {
            if (prev.countdown <= 1) {
              if (this.retryTimer) clearInterval(this.retryTimer)
              // Reload with cache-bust
              const url = new URL(window.location.href)
              url.searchParams.set('_rc', String(Date.now()))
              window.location.href = url.toString()
              return { countdown: 0 }
            }
            return { countdown: prev.countdown - 1 }
          })
        }, 1000)
      } else {
        console.error('[AppErrorBoundary] Max chunk retries exceeded')
        resetChunkRetryCount()
      }
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearInterval(this.retryTimer)
  }

  handleReset = () => {
    if (this.retryTimer) clearInterval(this.retryTimer)
    const isChunk = this.state.error ? isChunkLoadError(this.state.error) : false
    resetChunkRetryCount()
    if (isChunk) {
      const url = new URL(window.location.href)
      url.searchParams.set('_rc', String(Date.now()))
      window.location.href = url.toString()
    } else {
      this.setState({ hasError: false, error: null, autoRetrying: false, countdown: 3 })
      this.props.onReset?.()
    }
  }

  render() {
    if (this.state.hasError) {
      const isChunk = this.state.error ? isChunkLoadError(this.state.error) : false

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="flex flex-col items-center gap-4 p-8 max-w-sm text-center">
            <div className={`h-16 w-16 rounded-full flex items-center justify-center ${isChunk ? 'bg-blue-100 dark:bg-blue-950/30' : 'bg-amber-100 dark:bg-amber-950/30'}`}>
              {this.state.autoRetrying ? (
                <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
              ) : (
                <AlertTriangle className={`h-8 w-8 ${isChunk ? 'text-blue-500' : 'text-amber-500'}`} />
              )}
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">
                {this.state.autoRetrying ? 'Recovering...' : 'Something went wrong'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {this.state.autoRetrying
                  ? 'App resources failed to load'
                  : (this.state.error?.message || 'An unexpected error occurred.')}
              </p>
              {this.state.autoRetrying && (
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  Auto-retrying in {this.state.countdown}...
                </p>
              )}
              {!this.state.autoRetrying && !isChunk && (
                <p className="text-xs text-muted-foreground">
                  Please try again later.
                </p>
              )}
            </div>
            {!this.state.autoRetrying && (
              <Button onClick={this.handleReset} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                {isChunk ? 'Reload App' : 'Try Again'}
              </Button>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// ── Window-level Chunk Error Guard ──────────────────────────────────

/**
 * Installs window-level error listeners that catch chunk/script loading
 * failures before React can process them. Auto-reloads on first detection.
 *
 * Usage: Render <ChunkErrorGuard /> once near the app root.
 */
export function ChunkErrorGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleScriptError = (event: Event | ErrorEvent) => {
      const target = event.target as HTMLScriptElement | HTMLLinkElement | null
      if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
        console.error('[ChunkErrorGuard] Script/link load failure:', target.src || target.href)
        // Don't auto-reload here — let the error propagate to React's error boundary
        // which has proper retry logic with countdown UI
      }
    }

    const handleWindowError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.error as Error)) {
        console.error('[ChunkErrorGuard] Window chunk error:', event.message)
        event.preventDefault() // Prevent default browser error handling
      }
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      const err = event.reason instanceof Error ? event.reason : null
      if (err && isChunkLoadError(err)) {
        console.error('[ChunkErrorGuard] Unhandled chunk rejection:', err.message)
        event.preventDefault()
      }
    }

    window.addEventListener('error', handleScriptError, true) // capture phase
    window.addEventListener('error', handleWindowError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleScriptError, true)
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  return <>{children}</>
}