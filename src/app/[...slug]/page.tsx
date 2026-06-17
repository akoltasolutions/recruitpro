'use client'

import { useState, useCallback } from 'react'
import { AppContent } from '@/components/app-router'
import { AppErrorBoundary, OfflineOverlay, useNetworkStatus } from '@/components/shared/error-handling'

/**
 * Catch-all route — renders the SPA for all paths.
 *
 * This ensures that:
 * - Direct URL access works (e.g., /dashboard, /signup, /team-performance)
 * - Page refreshes work on any route (no 404s)
 * - All navigation uses clean URLs without #
 *
 * The client-side router in AppContent reads the original URL path
 * from the browser and renders the correct component.
 */
export default function CatchAllPage() {
  const isOnline = useNetworkStatus()
  const [retrying, setRetrying] = useState(false)

  const handleRetry = useCallback(() => {
    setRetrying(true)
    setTimeout(() => {
      if (navigator.onLine) {
        setRetrying(false)
        window.location.reload()
      } else {
        setRetrying(false)
      }
    }, 1500)
  }, [])

  return (
    <AppErrorBoundary onReset={() => window.location.reload()}>
      <OfflineOverlay isOnline={isOnline} onRetry={handleRetry} retrying={retrying} />
      <AppContent />
    </AppErrorBoundary>
  )
}
