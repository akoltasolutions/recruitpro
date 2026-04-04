'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Mail, Phone, ArrowLeft, Loader2, Headphones,
  KeyRound, ShieldCheck, CheckCircle2, Copy, RefreshCw, Eye, EyeOff, AlertCircle, WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { isValidEmail, isValidPhone } from '@/lib/utils'

interface ForgotPasswordPageProps {
  onBack: () => void
}

type Step = 'request' | 'verify' | 'success'

export function ForgotPasswordPage({ onBack }: ForgotPasswordPageProps) {
  const [method, setMethod] = useState<'email' | 'phone'>('email')
  const [step, setStep] = useState<Step>('request')
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)

  // Request step
  const [identifier, setIdentifier] = useState('')

  // Verify step
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [generatedCode, setGeneratedCode] = useState('')

  // Countdown for resend
  const [resendCooldown, setResendCooldown] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const requestCode = async () => {
    if (!identifier.trim()) {
      toast.error(method === 'email' ? 'Please enter your email' : 'Please enter your phone number')
      return
    }
    if (method === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim())) {
      toast.error('Please enter a valid email address')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, identifier: identifier.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to send reset code')
        return
      }

      // Store the generated code for display
      if (method === 'email') {
        setGeneratedCode(data.resetCode || '')
      } else {
        setGeneratedCode(data.otp || '')
      }

      setStep('verify')
      setCode('')
      setNewPassword('')
      setConfirmPassword('')

      // Start resend cooldown
      setResendCooldown(30)
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch {
      toast.error('No internet connection. Please check your network.')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!code.trim()) {
      toast.error('Please enter the verification code')
      return
    }
    if (!newPassword || newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      toast.error('Password must contain at least one letter and one number')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setResetting(true)
    try {
      const body: Record<string, string> = {
        method,
        code: code.trim(),
        newPassword,
      }
      if (method === 'email') {
        body.email = identifier.trim().toLowerCase()
      } else {
        body.phone = identifier.trim()
      }

      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to reset password')
        return
      }

      setStep('success')
      toast.success('Password reset successfully!')
    } catch {
      toast.error('No internet connection. Please check your network.')
    } finally {
      setResetting(false)
    }
  }

  const handleResend = () => requestCode()

  const handleCopyCode = () => {
    try {
      navigator.clipboard.writeText(generatedCode)
      toast.success('Code copied to clipboard')
    } catch {
      // Fallback for older Android WebViews
      const textArea = document.createElement('textarea')
      textArea.value = generatedCode
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        toast.success('Code copied to clipboard')
      } catch {
        toast.error('Failed to copy code')
      }
      document.body.removeChild(textArea)
    }
  }

  const handleBackToRequest = () => {
    setStep('request')
    setCode('')
    setNewPassword('')
    setConfirmPassword('')
    setGeneratedCode('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <Card className="w-full max-w-md shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <CardHeader className="text-center space-y-2 pb-4 pt-6 sm:pt-8 px-4 sm:px-8">
          <div className="mx-auto flex items-center justify-center h-14 w-14 sm:h-16 sm:w-16 rounded-xl bg-emerald-600 text-white mb-2">
            <Headphones className="h-7 w-7 sm:h-8 sm:w-8" />
          </div>
          <CardTitle className="text-2xl sm:text-3xl font-bold">RecruitPro</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {step === 'request' && 'Reset your password'}
            {step === 'verify' && 'Verify & set new password'}
            {step === 'success' && 'Password reset complete'}
          </CardDescription>
        </CardHeader>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 px-4 sm:px-8 pb-2">
          {['request', 'verify', 'success'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold transition-colors ${
                  step === s
                    ? 'bg-emerald-600 text-white'
                    : ['request', 'verify', 'success'].indexOf(step) > i
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {['request', 'verify', 'success'].indexOf(step) > i ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 2 && <div className={`h-0.5 w-8 rounded ${['request', 'verify', 'success'].indexOf(step) > i ? 'bg-emerald-300' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        {step === 'request' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              requestCode()
            }}
          >
            <CardContent className="space-y-5 px-4 sm:px-8">
              <Tabs value={method} onValueChange={(v) => setMethod(v as 'email' | 'phone')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="email" className="gap-1.5 text-xs sm:text-sm">
                    <Mail className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Via </span>Email
                  </TabsTrigger>
                  <TabsTrigger value="phone" className="gap-1.5 text-xs sm:text-sm">
                    <Phone className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Via </span>Phone
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-sm sm:text-base">
                  {method === 'email' ? 'Email Address' : 'Phone Number'}
                </Label>
                <div className="relative">
                  {method === 'email' ? (
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  )}
                  <Input
                    id="identifier"
                    type={method === 'email' ? 'email' : 'tel'}
                    placeholder={method === 'email' ? 'you@company.com' : '+91 98765 43210'}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="pl-10 h-11 sm:h-12 text-sm sm:text-base"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {method === 'email'
                    ? "We'll send a 6-character reset code to your email"
                    : "We'll send a 6-digit OTP to your phone number"}
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 pt-2 sm:pt-4 pb-6 sm:pb-8 px-4 sm:px-8">
              <Button
                type="submit"
                className="w-full h-11 sm:h-12 text-sm sm:text-base bg-emerald-600 hover:bg-emerald-700"
                disabled={loading || !identifier.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Send Reset Code
                  </>
                )}
              </Button>
              <button
                type="button"
                onClick={onBack}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Sign In
              </button>
            </CardFooter>
          </form>
        )}

        {step === 'verify' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleResetPassword()
            }}
          >
            <CardContent className="space-y-4 px-4 sm:px-8">
              {/* Generated code display (demo mode - in production this would be sent via email/SMS) */}
              {generatedCode && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                        Demo Mode — Verification Code
                      </p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                        In production, this code would be sent via {method === 'email' ? 'email' : 'SMS'}.
                        For testing, the code is shown below:
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <code className="flex-1 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded px-3 py-1.5 font-mono text-lg font-bold tracking-widest text-center text-emerald-700 dark:text-emerald-300">
                          {generatedCode}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={handleCopyCode}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="code" className="text-sm sm:text-base">
                  {method === 'email' ? 'Reset Code' : 'OTP Code'}
                </Label>
                <Input
                  id="code"
                  placeholder={method === 'email' ? 'Enter 6-char code' : 'Enter 6-digit OTP'}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="h-11 sm:h-12 text-sm sm:text-base tracking-widest text-center font-mono text-lg"
                  maxLength={6}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-sm sm:text-base">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Min 8 chars, letter + number"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pr-10 h-11 sm:h-12 text-sm sm:text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-sm sm:text-base">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pr-10 h-11 sm:h-12 text-sm sm:text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 pt-2 sm:pt-4 pb-6 sm:pb-8 px-4 sm:px-8">
              <Button
                type="submit"
                className="w-full h-11 sm:h-12 text-sm sm:text-base bg-emerald-600 hover:bg-emerald-700"
                disabled={resetting || !code.trim() || !newPassword || !confirmPassword}
              >
                {resetting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Reset Password
                  </>
                )}
              </Button>

              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || loading}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : "Didn't receive? Resend code"}
              </button>

              <button
                type="button"
                onClick={handleBackToRequest}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Try different method
              </button>
            </CardFooter>
          </form>
        )}

        {step === 'success' && (
          <CardContent className="flex flex-col items-center gap-4 px-4 sm:px-8 pb-8">
            <div className="flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Password Reset Successfully!</h3>
              <p className="text-sm text-muted-foreground">
                Your password has been updated. You can now sign in with your new password.
              </p>
            </div>
            <Button
              className="w-full h-11 sm:h-12 bg-emerald-600 hover:bg-emerald-700"
              onClick={onBack}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sign In
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
