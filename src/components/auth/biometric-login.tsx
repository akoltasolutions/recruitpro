'use client'

import { useState, useEffect, useCallback } from 'react'
import { Fingerprint, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

// ─────────────────────────────────────────────
// WebAuthn helper — use native DOM types with type assertions
// to avoid strict-type conflicts with lib.dom.d.ts.
// ─────────────────────────────────────────────
type AuthenticatorTransport = 'ble' | 'internal' | 'nfc' | 'usb'

// ─────────────────────────────────────────────
// Helper: generate a random challenge (dummy for demo)
// ─────────────────────────────────────────────
function generateChallenge(): ArrayBuffer {
  return crypto.getRandomValues(new Uint8Array(32))
}

// ─────────────────────────────────────────────
// Helper: ArrayBuffer ↔ Base64URL conversion
// ─────────────────────────────────────────────
function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) base64 += '='
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// ─────────────────────────────────────────────
// useBiometricAuth hook
// ─────────────────────────────────────────────
interface UseBiometricAuthReturn {
  /** True if the browser supports WebAuthn / PublicKeyCredential */
  supportsBiometric: boolean
  /** True if the current user has enrolled a biometric credential */
  isEnrolled: boolean
  /** Enroll a new biometric credential for the given userId */
  enroll: (userId: string) => Promise<boolean>
  /** Verify using an existing biometric credential for the given userId */
  verify: (userId: string) => Promise<boolean>
  /** Whether an operation is in progress */
  isLoading: boolean
}

export function useBiometricAuth(): UseBiometricAuthReturn {
  const [supportsBiometric, setSupportsBiometric] = useState(false)
  const [isEnrolled, setIsEnrolled] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Detect WebAuthn support on mount
  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      'credentials' in navigator &&
      typeof (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential === 'function'
    setSupportsBiometric(!!supported)
  }, [])

  /**
   * Check if a credential ID is stored for the given userId.
   * Storage key: `biometric_${userId}`
   */
  const getCredentialData = useCallback((userId: string): string | null => {
    if (typeof window === 'undefined') return null
    try {
      return localStorage.getItem(`biometric_${userId}`)
    } catch {
      return null
    }
  }, [])

  const enroll = useCallback(async (userId: string): Promise<boolean> => {
    if (!supportsBiometric) {
      toast.error('Biometric authentication is not supported on this device')
      return false
    }

    setIsLoading(true)
    try {
      const createOptions = {
        publicKey: {
          challenge: generateChallenge(),
          rp: {
            name: 'RecruitPro',
            id: typeof window !== 'undefined' ? window.location.hostname : undefined,
          },
          user: {
            id: new TextEncoder().encode(userId).buffer as ArrayBuffer,
            name: userId,
            displayName: `RecruitPro User ${userId.slice(0, 8)}`,
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },   // ES256 (P-256)
            { type: 'public-key', alg: -257 },  // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform' as const,
            userVerification: 'required' as const,
          },
          timeout: 60_000,
          attestation: 'none' as const,
        },
      }

      const credential = (await navigator.credentials.create(
        createOptions as CredentialCreationOptions,
      )) as PublicKeyCredential | null

      if (!credential || !credential.rawId) {
        toast.error('Biometric enrollment was cancelled')
        return false
      }

      // Save credential ID to localStorage keyed by userId
      const credentialId = bufferToBase64url(credential.rawId)
      localStorage.setItem(`biometric_${userId}`, credentialId)

      setIsEnrolled(true)
      toast.success('Biometric login enabled!')
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      if (message.includes('NotAllowedError') || message.includes('abort')) {
        toast.error('Biometric enrollment was cancelled')
      } else if (message.includes('InvalidStateError') || message.includes('already registered')) {
        // Already enrolled — just mark it
        setIsEnrolled(true)
        toast.info('Biometric is already set up for this account')
      } else if (message.includes('SecurityError') || message.includes('BadOrigin')) {
        toast.error('Biometric not available in this context (try HTTPS)')
      } else {
        toast.error('Biometric enrollment failed. Please try again.')
      }
      console.error('[BiometricAuth] Enrollment error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [supportsBiometric])

  const verify = useCallback(async (userId: string): Promise<boolean> => {
    if (!supportsBiometric) {
      toast.error('Biometric authentication is not supported on this device')
      return false
    }

    const storedCredId = getCredentialData(userId)
    if (!storedCredId) {
      toast.error('No biometric credential found. Please enroll first.')
      return false
    }

    setIsLoading(true)
    try {
      const requestOptions = {
        publicKey: {
          challenge: generateChallenge(),
          allowCredentials: [
            {
              type: 'public-key',
              id: base64urlToBuffer(storedCredId),
              transports: ['internal'] as AuthenticatorTransport[],
            },
          ],
          userVerification: 'required' as const,
          timeout: 60_000,
        },
      }

      const assertion = (await navigator.credentials.get(
        requestOptions as CredentialRequestOptions,
      )) as PublicKeyCredential | null

      if (!assertion) {
        toast.error('Biometric verification was cancelled')
        return false
      }

      toast.success('Biometric verified successfully!')
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      if (message.includes('NotAllowedError') || message.includes('abort')) {
        toast.error('Biometric verification was cancelled')
      } else if (message.includes('SecurityError') || message.includes('BadOrigin')) {
        toast.error('Biometric not available in this context (try HTTPS)')
      } else {
        toast.error('Biometric verification failed. Please try again.')
      }
      console.error('[BiometricAuth] Verification error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [supportsBiometric, getCredentialData])

  return { supportsBiometric, isEnrolled, enroll, verify, isLoading }
}

// ─────────────────────────────────────────────
// BiometricToggleButton component
// ─────────────────────────────────────────────
interface BiometricToggleButtonProps {
  /** The user ID to use for enrollment / verification */
  userId?: string
  /** Called after a successful biometric verification (e.g. to trigger login) */
  onVerified?: () => void
}

export function BiometricToggleButton({ userId, onVerified }: BiometricToggleButtonProps) {
  const isMobile = useIsMobile()
  const { supportsBiometric, isEnrolled, enroll, verify, isLoading } = useBiometricAuth()
  const token = useAuthStore((s: { token: string | null }) => s.token)

  // Don't render on desktop or if WebAuthn isn't supported
  if (!isMobile || !supportsBiometric) {
    return null
  }

  const handleClick = async () => {
    // If no userId but user is authenticated, we can't do biometric
    if (!userId && !token) {
      toast.error('Please sign in first to use biometric login')
      return
    }

    // Use the userId prop, or derive from auth store (user must be logged in for verification)
    const effectiveUserId = userId || ''

    if (!isEnrolled) {
      // Enroll flow
      if (!effectiveUserId) {
        toast.error('User ID is required to enroll biometric')
        return
      }
      const success = await enroll(effectiveUserId)
      if (success) {
        onVerified?.()
      }
    } else {
      // Verify flow
      if (!effectiveUserId) {
        toast.error('User ID is required for biometric verification')
        return
      }
      const success = await verify(effectiveUserId)
      if (success) {
        onVerified?.()
      }
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-11 w-11 rounded-lg border-emerald-300 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300"
      onClick={handleClick}
      disabled={isLoading}
      aria-label={isEnrolled ? 'Verify with fingerprint' : 'Set up fingerprint login'}
      title={isEnrolled ? 'Verify with fingerprint' : 'Set up fingerprint login'}
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Fingerprint className="h-5 w-5" />
      )}
    </Button>
  )
}