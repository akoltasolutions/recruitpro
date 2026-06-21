'use client'

import { useEffect } from 'react'

/**
 * PWA Service Worker Registration
 * Registers the service worker on mount and handles updates.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })

        // Check for updates on page focus
        const checkForUpdate = () => {
          registration.update()
        }

        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (
                newWorker.state === 'activated' &&
                navigator.serviceWorker.controller &&
                registration.active !== navigator.serviceWorker.controller
              ) {
                // New content is available
                console.log('[PWA] New content available, refresh for updates')
              }
            })
          }
        })

        // Check for updates periodically and on visibility change
        window.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            checkForUpdate()
          }
        })

        console.log('[PWA] Service worker registered:', registration.scope)
      } catch (error) {
        console.error('[PWA] Service worker registration failed:', error)
      }
    }

    // Delay registration slightly to not block initial render
    const timer = setTimeout(registerSW, 1000)
    return () => clearTimeout(timer)
  }, [])

  return null
}
