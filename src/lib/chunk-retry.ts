/**
 * Chunk loading retry utility.
 * Detects chunk/script loading failures and auto-recovers.
 */

/** Maximum number of auto-retry attempts for chunk errors */
const MAX_CHUNK_RETRIES = 3

/** Key used to track retry count in sessionStorage */
const CHUNK_RETRY_KEY = '__chunk_retry_count'

/** Check if an error is a chunk loading failure */
export function isChunkLoadError(error: Error): boolean {
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
    error.name === 'ChunkLoadError' ||
    error.name === 'TypeError' && msg.includes('failed to fetch')
  )
}

/** Get current retry count from sessionStorage */
export function getChunkRetryCount(): number {
  try {
    return parseInt(sessionStorage.getItem(CHUNK_RETRY_KEY) || '0', 10)
  } catch {
    return 0
  }
}

/** Increment retry count */
export function incrementChunkRetryCount(): number {
  const count = getChunkRetryCount() + 1
  try {
    sessionStorage.setItem(CHUNK_RETRY_KEY, String(count))
  } catch { /* ignore */ }
  return count
}

/** Reset retry count */
export function resetChunkRetryCount(): void {
  try {
    sessionStorage.removeItem(CHUNK_RETRY_KEY)
  } catch { /* ignore */ }
}

/** Perform a full page reload with cache-busting for chunk errors */
export function reloadForChunkError(): void {
  const count = incrementChunkRetryCount()
  if (count <= MAX_CHUNK_RETRIES) {
    // Add cache-buster to force fresh chunk download
    const url = new URL(window.location.href)
    url.searchParams.set('_retry', String(Date.now()))
    console.warn(`[ChunkRetry] Attempt ${count}/${MAX_CHUNK_RETRIES} — reloading with cache bust`)
    window.location.href = url.toString()
  } else {
    // Max retries exceeded — do a hard reload (bypass cache entirely)
    console.error(`[ChunkRetry] Max retries (${MAX_CHUNK_RETRIES}) exceeded — hard reload`)
    resetChunkRetryCount()
    window.location.reload()
  }
}

/**
 * Wraps a dynamic import function with retry logic.
 * On chunk load failure, clears module cache and retries up to 3 times.
 */
export function retryImport<T>(
  importFn: () => Promise<T>,
  retries = MAX_CHUNK_RETRIES,
  delay = 500
): () => Promise<T> {
  return async () => {
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await importFn()
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (isChunkLoadError(lastError) && attempt < retries) {
          console.warn(`[retryImport] Chunk failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)))
          continue
        }
        throw lastError
      }
    }
    throw lastError
  }
}