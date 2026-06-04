'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Show error.digest in production, full message in dev
  const message = process.env.NODE_ENV === 'development'
    ? error.message
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
          <div
            style={{
              fontSize: '3rem',
              marginBottom: '1rem',
            }}
          >
            ⚠️
          </div>
          <h1
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
              marginBottom: '1.5rem',
            }}
          >
            {message}
          </p>
          <button
            onClick={reset}
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
            Try Again
          </button>
        </div>
      </body>
    </html>
  )
}
