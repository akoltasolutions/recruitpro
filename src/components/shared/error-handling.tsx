'use client'

import React from 'react'
import { useState, useEffect, useCallback } from 'react'
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

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary component that catches rendering errors
 * and shows a recovery UI instead of a blank screen.
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; onReset?: () => void }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Caught error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="flex flex-col items-center gap-4 p-8 max-w-sm text-center">
            <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-950/30 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">
                {this.state.error?.message || 'An unexpected error occurred.'}
              </p>
              <p className="text-xs text-muted-foreground">
                Please try again later.
              </p>
            </div>
            <Button onClick={this.handleReset} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
