'use client'

import { useEffect, useCallback, useRef } from 'react'

/** Detect chunk loading errors from the error object */
function isChunkError(error: Error & { digest?: string }): boolean {
  if (!error) return false
  const msg = (error.message || error.digest || '').toLowerCase()
  return (
    msg.includes('loading chunk') ||
    msg.includes('chunkloaderror') ||
    msg.includes('chunk failed') ||
    msg.includes('loading script') ||
    msg.includes('script error') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('load failed') ||
    msg.includes('dynamically imported module') ||
    msg.includes('importing a module script failed')
  )
}

const MAX_RETRIES = 3
const RETRY_KEY = '__global_error_retry'

function getRetryCount(): number {
  try { return parseInt(sessionStorage.getItem(RETRY_KEY) || '0', 10) } catch { return 0 }
}
function setRetryCount(n: number): void {
  try { sessionStorage.setItem(RETRY_KEY, String(n)) } catch { /* ignore */ }
}
function clearRetryCount(): void {
  try { sessionStorage.removeItem(RETRY_KEY) } catch { /* ignore */ }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const isChunk = isChunkError(error)
  const willAutoRetry = useRef(false)

  // Auto-retry for chunk errors using DOM manipulation (no React setState in effect)
  useEffect(() => {
    if (!isChunk) return
    const count = getRetryCount()
    if (count >= MAX_RETRIES) {
      clearRetryCount()
      return // Let user manually retry
    }
    setRetryCount(count + 1)
    willAutoRetry.current = true

    // Update DOM to show recovering state
    const iconEl = document.getElementById('ge-icon')
    const titleEl = document.getElementById('ge-title')
    const countdownEl = document.getElementById('ge-countdown')
    const btnEl = document.getElementById('ge-btn')
    if (iconEl) iconEl.textContent = '🔄'
    if (titleEl) titleEl.textContent = 'Recovering...'
    if (countdownEl) countdownEl.style.display = 'block'
    if (btnEl) btnEl.style.display = 'none'

    let remaining = 3
    if (countdownEl) countdownEl.textContent = `Retrying in ${remaining}...`

    const timer = setInterval(() => {
      remaining -= 1
      if (countdownEl) countdownEl.textContent = `Retrying in ${remaining}...`
      if (remaining <= 0) {
        clearInterval(timer)
        // Reload with cache-bust
        const url = new URL(window.location.href)
        url.searchParams.set('_rc', String(Date.now()))
        window.location.href = url.toString()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [isChunk])

  const handleReset = useCallback(() => {
    clearRetryCount()
    if (isChunk) {
      // Hard reload for chunk errors
      const url = new URL(window.location.href)
      url.searchParams.set('_rc', String(Date.now()))
      window.location.href = url.toString()
    } else {
      reset()
    }
  }, [isChunk, reset])

  const message = process.env.NODE_ENV === 'development'
    ? error.message
    : isChunk
      ? 'App resources failed to load. Retrying...'
      : error.digest || 'An unexpected error occurred'

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: '#f9fafb',
          color: '#111827',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem', maxWidth: '24rem' }}>
          <div id="ge-icon" style={{ fontSize: '3rem', marginBottom: '1rem' }}>
            ⚠️
          </div>
          <h1
            id="ge-title"
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              marginBottom: '0.5rem',
              color: '#111827',
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              color: '#6b7280',
              fontSize: '0.875rem',
              lineHeight: 1.6,
              marginBottom: '0.5rem',
            }}
          >
            {message}
          </p>
          <div
            id="ge-countdown"
            style={{ display: 'none', fontSize: '0.875rem', fontWeight: 600, color: '#059669', marginBottom: '1.5rem' }}
          />
          <button
            id="ge-btn"
            onClick={handleReset}
            style={{
              padding: '0.625rem 1.5rem',
              backgroundColor: '#059669',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseOver={(e) => {
              ;(e.target as HTMLButtonElement).style.backgroundColor = '#047857'
            }}
            onMouseOut={(e) => {
              ;(e.target as HTMLButtonElement).style.backgroundColor = '#059669'
            }}
          >
            {isChunk ? 'Reload App' : 'Try Again'}
          </button>
        </div>
      </body>
    </html>
  )
}