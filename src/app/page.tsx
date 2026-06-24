'use client'

import { useState, useCallback } from 'react'
import { AppContent } from '@/components/app-router'
import { AppErrorBoundary, OfflineOverlay, useNetworkStatus, ChunkErrorGuard } from '@/components/shared/error-handling'

export default function Home() {
  const isOnline = useNetworkStatus()
  const [retrying, setRetrying] = useState(false)

  // Offline retry handler
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
    <ChunkErrorGuard>
      <AppErrorBoundary onReset={() => window.location.reload()}>
        <OfflineOverlay isOnline={isOnline} onRetry={handleRetry} retrying={retrying} />
        <AppContent />
      </AppErrorBoundary>
    </ChunkErrorGuard>
  )
}