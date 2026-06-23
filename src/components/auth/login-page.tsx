'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Lock, Eye, EyeOff, LogIn, Loader2, Headphones, AlertCircle, UserPlus, ShieldOff, WifiOff, Smartphone, Building2, ShieldAlert, KeyRound, Download } from 'lucide-react'
import { toast } from 'sonner'
import { MfaVerification } from './mfa-verification'

interface LoginPageProps {
  onSwitch: () => void
  onForgotPassword?: () => void
  onRegister?: () => void
}

/* ── APK Download Button (shown on login page) ── */
function InstallAppButton() {
  return (
    <a
      href="/RecruitPro.apk"
      download="RecruitPro.apk"
      className="flex items-center justify-center gap-2.5 w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors cursor-pointer no-underline"
    >
      <Smartphone className="h-4 w-4" />
      Download Android App
      <Download className="h-4 w-4 ml-0.5" />
    </a>
  )
}

export function LoginPage({ onSwitch, onForgotPassword, onRegister }: LoginPageProps) {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const { login } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError('')
    setErrorCode('')

    // Client-side validation first
    if (!loginId.trim() || !password.trim()) {
      setErrorCode('EMPTY_FIELDS')
      setServerError('Please fill in all required fields.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: loginId.trim(), password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorCode(data.code || '')
        setServerError(data.error || 'Login failed. Please try again.')

        // Toast notifications for different error types
        if (data.code === 'USER_NOT_FOUND') {
          toast.error('Account not found', { description: 'Please sign up or check your credentials.' })
        } else if (data.code === 'WRONG_PASSWORD') {
          if (data.remainingAttempts !== undefined && data.remainingAttempts <= 5) {
            toast.error('Incorrect password', { description: `${data.remainingAttempts} attempts remaining.` })
          }
        } else if (data.code === 'ACCOUNT_LOCKED' || data.code === 'RATE_LIMITED') {
          toast.error(data.error || 'Account temporarily locked')
        } else if (data.code === 'ACCOUNT_INACTIVE') {
          toast.error('Your account is inactive. Please contact the administrator.')
        } else if (data.code === 'SERVER_ERROR') {
          toast.error('Something went wrong. Please try again later.')
        }
        return
      }

      // Check if MFA is required
      if (data.mfaRequired) {
        setMfaToken(data.mfaToken)
        toast.info('Please enter your authentication code')
        return
      }

      login(data.user, data.token, data.organization)
      toast.success(`Welcome back, ${data.user.name}!`)
    } catch {
      setErrorCode('NO_CONNECTION')
      setServerError('No internet connection. Please check your network.')
      toast.error('No internet connection. Please check your network.')
    } finally {
      setLoading(false)
    }
  }

  // Field highlighting classes based on error type
  const emailFieldHighlight = errorCode === 'USER_NOT_FOUND' || errorCode === 'INVALID_IDENTIFIER'
    ? 'border-red-400 ring-2 ring-red-200 dark:ring-red-800/50 dark:border-red-500'
    : errorCode === 'EMPTY_FIELDS' && !loginId.trim()
      ? 'border-red-400 ring-2 ring-red-200 dark:ring-red-800/50 dark:border-red-500'
      : ''

  const passwordFieldHighlight = errorCode === 'WRONG_PASSWORD'
    ? 'border-amber-400 ring-2 ring-amber-200 dark:ring-amber-800/50 dark:border-amber-500'
    : errorCode === 'EMPTY_FIELDS' && !password.trim()
      ? 'border-red-400 ring-2 ring-red-200 dark:ring-red-800/50 dark:border-red-500'
      : ''

  // Error banner styling per code
  const getErrorStyle = () => {
    switch (errorCode) {
      case 'USER_NOT_FOUND':
        return {
          bg: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30',
          textColor: 'text-red-800 dark:text-red-300',
          icon: <UserPlus className="h-4 w-4 text-red-500 shrink-0" />,
        }
      case 'WRONG_PASSWORD':
        return {
          bg: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30',
          textColor: 'text-amber-800 dark:text-amber-300',
          icon: <KeyRound className="h-4 w-4 text-amber-500 shrink-0" />,
        }
      case 'ACCOUNT_INACTIVE':
        return {
          bg: 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30',
          textColor: 'text-orange-800 dark:text-orange-300',
          icon: <ShieldOff className="h-4 w-4 text-orange-500 shrink-0" />,
        }
      case 'RATE_LIMITED':
        return {
          bg: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30',
          textColor: 'text-red-800 dark:text-red-300',
          icon: <ShieldAlert className="h-4 w-4 text-red-500 shrink-0" />,
        }
      case 'NO_CONNECTION':
        return {
          bg: 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30',
          textColor: 'text-slate-700 dark:text-slate-300',
          icon: <WifiOff className="h-4 w-4 text-slate-500 shrink-0" />,
        }
      default:
        return {
          bg: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30',
          textColor: 'text-red-800 dark:text-red-300',
          icon: <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />,
        }
    }
  }

  // MFA verification step
  if (mfaToken) {
    return (
      <MfaVerification
        mfaToken={mfaToken}
        onSuccess={(token, userData) => {
          login(userData, token, userData.organization)
          toast.success(`Welcome back, ${userData.name}!`)
        }}
        onCancel={() => setMfaToken(null)}
      />
    )
  }

  const errorStyle = serverError ? getErrorStyle() : null

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
            {errorStyle && (
              <div className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${errorStyle.bg} ${errorStyle.textColor}`}>
                {errorStyle.icon}
                <p className="flex-1">{serverError}</p>
                <button type="button" onClick={() => { setServerError(''); setErrorCode('') }} className="text-current opacity-60 hover:opacity-100 shrink-0">
                  ✕
                </button>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="loginId" className="text-sm sm:text-base">Email or Phone Number</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="loginId" type="text" placeholder="Enter your registered Email or Phone Number" value={loginId} onChange={e => { setLoginId(e.target.value); setServerError(''); setErrorCode('') }} className={`pl-10 h-11 sm:h-12 text-sm sm:text-base transition-colors ${emailFieldHighlight}`} autoComplete="email" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm sm:text-base">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={e => { setPassword(e.target.value); setServerError(''); setErrorCode('') }} className={`pl-10 pr-10 h-11 sm:h-12 text-sm sm:text-base transition-colors ${passwordFieldHighlight}`} autoComplete="current-password" />
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

            {/* Show Sign Up prompt when user not found */}
            {errorCode === 'USER_NOT_FOUND' && (
              <div className="w-full border-t pt-3 mt-0">
                <button
                  type="button"
                  onClick={onSwitch}
                  className="flex items-center justify-center gap-2 w-full text-sm font-medium py-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50 transition-colors"
                >
                  <UserPlus className="h-4 w-4" />
                  Sign Up to Create an Account
                </button>
              </div>
            )}

            {/* Show Forgot Password link when wrong password */}
            {errorCode === 'WRONG_PASSWORD' && onForgotPassword && (
              <div className="w-full border-t pt-3 mt-0">
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="flex items-center justify-center gap-2 w-full text-sm font-medium py-2 rounded-lg text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30 transition-colors"
                >
                  <KeyRound className="h-4 w-4" />
                  Forgot Password? Reset it here
                </button>
              </div>
            )}

            {/* Register your company link */}
            {onRegister && errorCode !== 'USER_NOT_FOUND' && (
              <div className="w-full border-t pt-4 mt-0">
                <button
                  type="button"
                  onClick={onRegister}
                  className="flex items-center justify-center gap-2 w-full text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors py-1"
                >
                  <Building2 className="h-4 w-4" />
                  Register your company
                </button>
              </div>
            )}

            {/* Android App Install — PWA */}
            <div className="w-full border-t pt-4 mt-2">
              <InstallAppButton />
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
