'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore, authFetch } from '@/stores/auth-store'
import { toast } from 'sonner'

// ─────────────────────────────────────────────
// IndexedDB constants & types
// ─────────────────────────────────────────────
const DB_NAME = 'recruitpro-offline'
const DB_VERSION = 1
const STORE_NAME = 'pending-notes'

export interface PendingNote {
  id: string
  candidateId: string
  note: string
  createdAt: string
  synced: boolean
}

// ─────────────────────────────────────────────
// Simple IndexedDB wrapper (no external library)
// ─────────────────────────────────────────────
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('candidateId', 'candidateId', { unique: false })
        store.createIndex('synced', 'synced', { unique: false })
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message ?? 'unknown error'}`))
    }
  })
}

function withTransaction<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode)
        const store = tx.objectStore(STORE_NAME)
        const request = callback(store)

        request.onsuccess = () => resolve(request.result)
        request.onerror = () =>
          reject(new Error(`IndexedDB operation failed: ${request.error?.message ?? 'unknown'}`))

        // Wait for the transaction to fully complete
        tx.oncomplete = () => {
          // Transaction committed — resolve was already called via onsuccess
        }
        tx.onerror = () => {
          reject(new Error(`IndexedDB transaction failed: ${tx.error?.message ?? 'unknown'}`))
        }
      }),
  )
}

/** Put (upsert) a single record */
function putNote(note: PendingNote): Promise<void> {
  return new Promise((resolve, reject) => {
    openDB().then((db) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.put(note)

      request.onsuccess = () => resolve()
      request.onerror = () =>
        reject(new Error(`Failed to put note: ${request.error?.message ?? 'unknown'}`))
    }).catch(reject)
  })
}

/** Get all unsynced notes */
function getUnsyncedNotes(): Promise<PendingNote[]> {
  return openDB().then(
    (db) =>
      new Promise<PendingNote[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const index = store.index('synced')
        const request = index.getAll(IDBKeyRange.only(false)) // synced === false

        request.onsuccess = () => resolve(request.result)
        request.onerror = () =>
          reject(new Error(`Failed to fetch pending notes: ${request.error?.message ?? 'unknown'}`))
      }),
  )
}

/** Delete a record by id */
function deleteNote(id: string): Promise<void> {
  return withTransaction('readwrite', (store) => store.delete(id)).then(() => undefined)
}

// ─────────────────────────────────────────────
// OfflineNotesManager hook
// ─────────────────────────────────────────────
interface OfflineNotesManagerReturn {
  /** Save a note for a candidate to IndexedDB */
  saveNote: (candidateId: string, note: string) => Promise<void>
  /** Get all unsynced pending notes from IndexedDB */
  getPendingNotes: () => Promise<PendingNote[]>
  /** Manually trigger sync of all pending notes */
  syncNotes: () => Promise<{ synced: number; failed: number }>
  /** Number of unsynced notes currently pending */
  pendingCount: number
  /** Whether a sync operation is in progress */
  isSyncing: boolean
  /** Whether the device is currently online */
  isOnline: boolean
}

export function useOfflineNotesManager(): OfflineNotesManagerReturn {
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const syncingRef = useRef(false)

  // Track online/offline status
  useEffect(() => {
    if (typeof window === 'undefined') return

    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)

    // Set initial state
    setIsOnline(navigator.onLine)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Refresh pending count from IndexedDB
  const refreshPendingCount = useCallback(async () => {
    try {
      const notes = await getUnsyncedNotes()
      setPendingCount(notes.length)
    } catch {
      // IndexedDB might not be available
      setPendingCount(0)
    }
  }, [])

  // Initial count & periodic refresh
  useEffect(() => {
    refreshPendingCount()
    // Poll every 15 seconds as a fallback for tab-focus sync
    const interval = setInterval(refreshPendingCount, 15_000)
    return () => clearInterval(interval)
  }, [refreshPendingCount])

  /**
   * saveNote — persists a note to IndexedDB for later sync.
   */
  const saveNote = useCallback(
    async (candidateId: string, note: string): Promise<void> => {
      const pendingNote: PendingNote = {
        id: crypto.randomUUID(),
        candidateId,
        note,
        createdAt: new Date().toISOString(),
        synced: false,
      }

      try {
        await putNote(pendingNote)
        await refreshPendingCount()
      } catch (err) {
        console.error('[OfflineNotes] Failed to save note:', err)
        // Fall back: try to sync immediately if online
        if (navigator.onLine) {
          toast.warning('Note saved temporarily. Syncing now...')
        } else {
          toast.error('Failed to save note offline. Storage may be full.')
        }
      }
    },
    [refreshPendingCount],
  )

  /**
   * syncNotes — sends all unsynced notes to the API and removes them on success.
   */
  const syncNotes = useCallback(async (): Promise<{ synced: number; failed: number }> => {
    // Prevent concurrent syncs
    if (syncingRef.current) {
      return { synced: 0, failed: 0 }
    }
    syncingRef.current = true
    setIsSyncing(true)

    let synced = 0
    let failed = 0

    try {
      const pending = await getUnsyncedNotes()

      if (pending.length === 0) {
        return { synced: 0, failed: 0 }
      }

      const token = useAuthStore.getState().token
      if (!token) {
        console.warn('[OfflineNotes] No auth token — skipping sync until logged in')
        return { synced: 0, failed: pending.length }
      }

      for (const note of pending) {
        try {
          // POST each note as a call record note to the call-records API
          const res = await authFetch('/api/call-records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              candidateId: note.candidateId,
              notes: `[Offline Note — ${new Date(note.createdAt).toLocaleString()}] ${note.note}`,
              callStatus: 'COMPLETED',
              callDuration: 0,
            }),
          })

          if (res.ok) {
            await deleteNote(note.id)
            synced++
          } else {
            failed++
          }
        } catch {
          failed++
        }
      }

      await refreshPendingCount()

      if (synced > 0) {
        toast.success(`Synced ${synced} offline note${synced > 1 ? 's' : ''}`)
      }
    } catch (err) {
      console.error('[OfflineNotes] Sync error:', err)
    } finally {
      setIsSyncing(false)
      syncingRef.current = false
    }

    return { synced, failed }
  }, [refreshPendingCount])

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) {
      // Small delay to let the network settle
      const timer = setTimeout(() => {
        const token = useAuthStore.getState().token
        if (token) {
          syncNotes()
        }
      }, 1_500)
      return () => clearTimeout(timer)
    }
  }, [isOnline, syncNotes])

  return {
    saveNote,
    getPendingNotes: getUnsyncedNotes,
    syncNotes,
    pendingCount,
    isSyncing,
    isOnline,
  }
}