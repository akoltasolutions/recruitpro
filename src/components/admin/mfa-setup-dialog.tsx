'use client'

import { useState, useRef, useEffect } from 'react'
import { Shield, Key, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { authFetch } from '@/stores/auth-store'
import { toast } from 'sonner'

interface MfaSetupDialogProps {
  onComplete: (backupCodes?: string[]) => void
  onClose: () => void
}

export function MfaSetupDialog({ onComplete, onClose }: MfaSetupDialogProps) {
  const [step, setStep] = useState<'generate' | 'verify'>('generate')
  const [secret, setSecret] = useState('')
  const [uri, setUri] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(true)
  const [error, setError] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    generateSecret()
  }, [])

  const generateSecret = async () => {
    try {
      const res = await authFetch('/api/auth/mfa/setup', {
        method: 'POST',
        body: JSON.stringify({ action: 'generate' }),
      })
      if (res.ok) {
        const data = await res.json()
        setSecret(data.secret)
        setUri(data.uri)
      } else {
        toast.error('Failed to generate MFA secret')
        onClose()
      }
    } catch {
      toast.error('Failed to generate MFA secret')
      onClose()
    } finally {
      setGenerating(false)
    }
  }

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('')
      const newCode = [...code]
      digits.forEach((d, i) => { if (index + i < 6) newCode[index + i] = d })
      setCode(newCode)
      const nextIndex = Math.min(index + digits.length, 5)
      inputRefs.current[nextIndex]?.focus()
      return
    }
    if (!/^\d*$/.test(value)) return
    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)
    if (value && index < 5) inputRefs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleVerify = async () => {
    const fullCode = code.join('')
    if (fullCode.length !== 6) return

    setLoading(true)
    setError('')

    try {
      const res = await authFetch('/api/auth/mfa/setup', {
        method: 'POST',
        body: JSON.stringify({ action: 'verify', code: fullCode }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Verification failed')
        setCode(['', '', '', '', '', ''])
        inputRefs.current[0]?.focus()
        return
      }

      toast.success('MFA enabled successfully!')
      onComplete(data.backupCodes)
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }

  // Build QR code URL using a public QR code API
  const qrCodeUrl = uri ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}` : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        {generating ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">Generating secret key...</p>
          </div>
        ) : step === 'generate' ? (
          <>
            <div className="text-center mb-6">
              <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center">
                <Shield className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold">Set Up Authenticator</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Scan this QR code with your authenticator app
              </p>
            </div>

            {qrCodeUrl && (
              <div className="flex justify-center mb-4">
                <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 rounded-lg border" />
              </div>
            )}

            <div className="p-3 rounded-lg bg-muted mb-4">
              <p className="text-xs text-muted-foreground mb-1">If you can&apos;t scan, enter this key manually:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono flex-1 break-all">{secret}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(secret)
                    toast.success('Copied to clipboard')
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button className="flex-1" onClick={() => {
                setStep('verify')
                setTimeout(() => inputRefs.current[0]?.focus(), 100)
              }}>
                Continue
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center justify-center">
                <Key className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold">Verify Setup</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>

            <div className="flex justify-center gap-2 mb-4">
              {code.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="h-12 w-12 text-center text-xl font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  autoFocus={index === 0}
                />
              ))}
            </div>

            {error && <p className="text-center text-sm text-destructive mb-3">{error}</p>}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep('generate')}>
                Back
              </Button>
              <Button className="flex-1" onClick={handleVerify} disabled={loading || code.some(d => !d)}>
                {loading ? 'Verifying...' : 'Enable MFA'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
