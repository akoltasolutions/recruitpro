'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Phone, Mail, Lock, Eye, EyeOff, UserPlus, Loader2, CheckCircle2, AlertCircle, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { isValidEmail, isValidPhone, isSignupPassword } from '@/lib/utils'

interface SignupPageProps {
  onSwitch: () => void
}

export function SignupPage({ onSwitch }: SignupPageProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pendingApproval, setPendingApproval] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { login } = useAuthStore()

  const clearError = (field: string) => {
    setErrors(prev => { const next = { ...prev }; delete next[field]; return next })
  }

  const validateForm = (): boolean => {
    const e: Record<string, string> = {}

    if (!name.trim()) e.name = 'Full name is required.'
    if (!phone.trim()) e.phone = 'Phone number is required.'
    else if (!isValidPhone(phone)) e.phone = 'Please enter a valid phone number.'
    if (!email.trim()) e.email = 'Email is required.'
    else if (!isValidEmail(email)) e.email = 'Please enter a valid email address.'
    if (!password) e.password = 'Password is required.'
    else {
      const pwCheck = isSignupPassword(password)
      if (!pwCheck.valid) e.password = pwCheck.message
    }
    if (!confirmPassword) e.confirmPassword = 'Please confirm your password.'
    else if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match.'

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error?.includes('already exists')) {
          setErrors({ email: 'This email is already registered.' })
          toast.error('This email is already registered.')
        } else {
          toast.error(data.error || 'Signup failed.')
        }
        return
      }

      if (data.pendingApproval) {
        setPendingApproval(true)
        return
      }

      login(data.user, data.token)
      toast.success('Account created successfully!')
    } catch {
      toast.error('No internet connection. Please check your network.')
    } finally {
      setLoading(false)
    }
  }

  // Pending approval success screen
  if (pendingApproval) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
        <Card className="w-full max-w-md shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
          <CardHeader className="text-center space-y-3 pb-2">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <CardTitle className="text-xl font-bold">Registration Submitted!</CardTitle>
            <CardDescription className="text-sm">
              Your account has been created and is pending admin approval.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 space-y-2">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                What happens next?
              </p>
              <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1.5 list-disc list-inside pl-1">
                <li>An administrator will review your registration</li>
                <li>Once approved, you will be able to log in with your credentials</li>
                <li>You&apos;ll receive access to the auto-dialer and calling features</li>
              </ul>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
              <p className="font-medium text-muted-foreground">Your credentials:</p>
              <p className="text-muted-foreground">Email: <span className="font-mono">{email}</span></p>
              <p className="text-muted-foreground">Name: <span className="font-mono">{name}</span></p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button variant="outline" className="w-full" onClick={onSwitch}>
              Back to Sign In
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <Card className="w-full max-w-md shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <CardHeader className="text-center space-y-2 pb-4">
          <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-xl bg-emerald-600 text-white mb-2">
            <UserPlus className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold">Create Account</CardTitle>
          <CardDescription>Register as a recruiter — requires admin approval</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <div className="relative">
                <UserPlus className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="name" placeholder="John Doe" value={name} onChange={e => { setName(e.target.value); clearError('name') }} className={errors.name ? 'pl-10 border-red-300 dark:border-red-700' : 'pl-10'} autoComplete="name" />
              </div>
              {errors.name && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="phone" placeholder="+91-9876543210" value={phone} onChange={e => { setPhone(e.target.value); clearError('phone') }} className={errors.phone ? 'pl-10 border-red-300 dark:border-red-700' : 'pl-10'} autoComplete="tel" />
              </div>
              {errors.phone && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.phone}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="john@company.com" value={email} onChange={e => { setEmail(e.target.value); clearError('email') }} className={errors.email ? 'pl-10 border-red-300 dark:border-red-700' : 'pl-10'} autoComplete="email" />
              </div>
              {errors.email && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Min 8 characters with a letter and number" value={password} onChange={e => { setPassword(e.target.value); clearError('password') }} className={`pl-10 pr-10 ${errors.password ? 'border-red-300 dark:border-red-700' : ''}`} autoComplete="new-password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.password}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="confirmPassword" type={showConfirm ? 'text' : 'password'} placeholder="Re-enter password" value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); clearError('confirmPassword') }} className={`pl-10 pr-10 ${errors.confirmPassword ? 'border-red-300 dark:border-red-700' : ''}`} autoComplete="new-password" />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.confirmPassword}</p>}
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                After registration, an administrator must approve your account before you can log in.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Registration
            </Button>
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <button type="button" onClick={onSwitch} className="text-emerald-600 hover:underline font-medium">
                Sign in
              </button>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
