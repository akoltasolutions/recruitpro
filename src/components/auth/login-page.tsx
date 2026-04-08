'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Lock, Eye, EyeOff, LogIn, Loader2, Headphones, AlertCircle, UserX, ShieldOff, WifiOff, Download, Smartphone } from 'lucide-react'
import { toast } from 'sonner'

interface LoginPageProps {
  onSwitch: () => void
  onForgotPassword?: () => void
}

export function LoginPage({ onSwitch, onForgotPassword }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const { login } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError('')
    setErrorCode('')

    // Client-side validation first
    if (!email.trim() || !password.trim()) {
      setErrorCode('EMPTY_FIELDS')
      setServerError('Please fill in all required fields.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorCode('INVALID_EMAIL')
      setServerError('Please enter a valid email address.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorCode(data.code || '')
        setServerError(data.error || 'Login failed. Please try again.')

        // Also show a toast for visibility
        if (data.code === 'USER_NOT_FOUND') {
          toast.error('User is not registered. Please sign up or contact admin.')
        } else if (data.code === 'WRONG_PASSWORD') {
          toast.error('Incorrect password. Please try again.')
        } else if (data.code === 'ACCOUNT_INACTIVE') {
          toast.error('Your account is inactive. Please contact the administrator.')
        } else if (data.code === 'SERVER_ERROR') {
          toast.error('Something went wrong. Please try again later.')
        } else {
          toast.error(data.error || 'Login failed.')
        }
        return
      }

      login(data.user, data.token)
      toast.success(`Welcome back, ${data.user.name}!`)
    } catch {
      setErrorCode('NO_CONNECTION')
      setServerError('No internet connection. Please check your network.')
      toast.error('No internet connection. Please check your network.')
    } finally {
      setLoading(false)
    }
  }

  const getErrorIcon = () => {
    switch (errorCode) {
      case 'USER_NOT_FOUND': return <UserX className="h-4 w-4 text-red-500 shrink-0" />
      case 'WRONG_PASSWORD': return <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
      case 'ACCOUNT_INACTIVE': return <ShieldOff className="h-4 w-4 text-orange-500 shrink-0" />
      case 'NO_CONNECTION': return <WifiOff className="h-4 w-4 text-red-500 shrink-0" />
      default: return <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
    }
  }

  const getErrorColor = () => {
    switch (errorCode) {
      case 'WRONG_PASSWORD': return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
      case 'ACCOUNT_INACTIVE': return 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300'
      case 'NO_CONNECTION': return 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
      default: return 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <Card className="w-full max-w-md shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <CardHeader className="text-center space-y-2 pb-4 pt-6 sm:pt-8 px-4 sm:px-8">
          <div className="mx-auto flex items-center justify-center h-14 w-14 sm:h-16 sm:w-16 rounded-xl bg-emerald-600 text-white mb-2">
            <Headphones className="h-7 w-7 sm:h-8 sm:w-8" />
          </div>
          <CardTitle className="text-2xl sm:text-3xl font-bold">RecruitPro</CardTitle>
          <CardDescription className="text-sm sm:text-base">Recruitment Manager & Auto Dialer System</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 sm:space-y-5 px-4 sm:px-8">
            {/* Server error banner */}
            {serverError && (
              <div className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${getErrorColor()}`}>
                {getErrorIcon()}
                <p className="flex-1">{serverError}</p>
                <button type="button" onClick={() => { setServerError(''); setErrorCode('') }} className="text-current opacity-60 hover:opacity-100 shrink-0">
                  ✕
                </button>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm sm:text-base">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={e => { setEmail(e.target.value); setServerError(''); }} className="pl-10 h-11 sm:h-12 text-sm sm:text-base" autoComplete="email" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm sm:text-base">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={e => { setPassword(e.target.value); setServerError(''); }} className="pl-10 pr-10 h-11 sm:h-12 text-sm sm:text-base" autoComplete="current-password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-4 sm:pt-6 pb-6 sm:pb-8 px-4 sm:px-8">
            <Button type="submit" className="w-full h-11 sm:h-12 text-sm sm:text-base bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <LogIn className="mr-2 h-4 w-4" />
              Sign In
            </Button>
            <div className="flex items-center justify-between w-full">
              {onForgotPassword ? (
                <button type="button" onClick={onForgotPassword} className="text-sm text-emerald-600 hover:underline font-medium">
                  Forgot Password?
                </button>
              ) : (
                <span />
              )}
              <p className="text-sm text-muted-foreground">
                <button type="button" onClick={onSwitch} className="text-emerald-600 hover:underline font-medium">
                  Create account
                </button>
              </p>
            </div>

            {/* Android App Download */}
            <div className="w-full border-t pt-4 mt-2">
              <a
                href="/api/download-apk"
                className="flex items-center justify-center gap-2.5 w-full h-11 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 transition-all text-sm font-medium"
              >
                <Smartphone className="h-4 w-4" />
                Download Android App
                <Download className="h-3.5 w-3.5" />
              </a>
              <p className="text-xs text-center text-muted-foreground mt-2">
                Install the RecruitPro app on your Android phone for the best calling experience
              </p>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
