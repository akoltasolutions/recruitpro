---
Task ID: 4
Agent: Main Agent
Task: Implement Biometric Login (WebAuthn) and Enhanced Offline Notes with Auto-Sync

Work Log:
- Created `src/components/auth/biometric-login.tsx` — WebAuthn biometric login hook + toggle button
- Created `src/components/shared/offline-notes.tsx` — Offline notes with IndexedDB and auto-sync
- Fixed TypeScript strict-mode issues: attestation type, transports type, IDBKeyRange.only(false), store.put return type
- ESLint passes clean, dev server compiles without errors

Stage Summary:
- **Biometric Login** (`biometric-login.tsx`):
  - `useBiometricAuth()` hook: checks `navigator.credentials` + `PublicKeyCredential`, manages `supportsBiometric` / `isEnrolled` / `isLoading` state
  - `enroll(userId)`: calls `navigator.credentials.create()` with dummy challenge, saves credential ID to `localStorage` under `biometric_${userId}`
  - `verify(userId)`: calls `navigator.credentials.get()` with saved credential ID
  - `BiometricToggleButton`: fingerprint icon button, emerald color scheme, mobile-only via `useIsMobile`, shows loading spinner, toast notifications for all outcomes
  - Proper error handling for NotAllowedError, SecurityError, InvalidStateError, etc.

- **Offline Notes** (`offline-notes.tsx`):
  - Simple IndexedDB wrapper using `idb-open-request` pattern (no external library)
  - DB: `recruitpro-offline`, Store: `pending-notes`, indexes on `candidateId` and `synced`
  - `useOfflineNotesManager()` hook: `saveNote(candidateId, note)`, `getPendingNotes()`, `syncNotes()`
  - `saveNote`: stores to IndexedDB with `crypto.randomUUID()` id, `synced: false`
  - `syncNotes`: iterates pending notes, POSTs each to `/api/call-records` via `authFetch`, deletes on success
  - Listens to `online`/`offline` events, auto-syncs 1.5s after coming back online (if auth token present)
  - Exposes `pendingCount`, `isSyncing`, `isOnline` state
  - Concurrent sync prevention via ref