'use client'

import { useState, useRef, useEffect } from 'react'
import { ShieldCheck, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { authFetch } from '@/stores/auth-store'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'

interface MfaVerificationProps {
  mfaToken: string
  onSuccess: (token: string, user: any) => void
  onCancel: () => void
}

export function MfaVerification({ mfaToken, onSuccess, onCancel }: MfaVerificationProps) {
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const attemptsRef = useRef(0)

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, '').slice(0, 6).split('')
      const newCode = [...code]
      digits.forEach((d, i) => {
        if (index + i < 6) newCode[index + i] = d
      })
      setCode(newCode)
      const nextIndex = Math.min(index + digits.length, 5)
      inputRefs.current[nextIndex]?.focus()
      return
    }

    if (!/^\d*$/.test(value)) return
    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    const newCode = [...code]
    pasted.split('').forEach((d, i) => { if (i < 6) newCode[i] = d })
    setCode(newCode)
    const nextIndex = Math.min(pasted.length, 5)
    inputRefs.current[nextIndex]?.focus()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const fullCode = code.join('')
    if (fullCode.length !== 6) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken, code: fullCode }),
      })

      const data = await res.json()

      if (!res.ok) {
        attemptsRef.current++
        setError(data.error || 'Verification failed')
        setCode(['', '', '', '', '', ''])
        inputRefs.current[0]?.focus()

        if (attemptsRef.current >= 5) {
          toast.error('Too many failed attempts. Please login again.')
          onCancel()
        }
        return
      }

      toast.success('Verification successful')
      onSuccess(data.token, data.user)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <Card className="w-full max-w-md shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold">Two-Factor Authentication</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex justify-center gap-2 sm:gap-3">
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
                  onPaste={index === 0 ? handlePaste : undefined}
                  className="h-14 w-12 sm:w-14 text-center text-2xl font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  autoComplete="one-time-code"
                  disabled={loading}
                />
              ))}
            </div>

            {error && (
              <p className="text-center text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full h-12" size="lg" disabled={loading || code.some(d => !d)}>
              {loading ? 'Verifying...' : 'Verify Code'}
            </Button>

            <Button type="button" variant="ghost" className="w-full" onClick={onCancel} disabled={loading}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
