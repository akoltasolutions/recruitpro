'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Lock, Eye, EyeOff, Building2, Phone, User, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { isValidEmail, isSignupPassword } from '@/lib/utils'

interface RegisterPageProps {
  onBack: () => void
}

export function RegisterPage({ onBack }: RegisterPageProps) {
  // Company fields
  const [companyName, setCompanyName] = useState('')
  const [companySlug, setCompanySlug] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')

  // Admin account fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // UI state
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { login } = useAuthStore()

  // Auto-generate slug from company name
  const handleCompanyNameChange = (value: string) => {
    setCompanyName(value)
    // Auto-suggest slug only if user hasn't manually edited the slug
    const slug = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    setCompanySlug(slug)
  }

  const clearError = (field: string) => {
    setErrors(prev => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const validateForm = (): boolean => {
    const e: Record<string, string> = {}

    // Company validation
    if (!companyName.trim()) e.companyName = 'Company name is required.'
    if (!companySlug.trim()) e.companySlug = 'Company URL slug is required.'
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(companySlug)) {
      e.companySlug = 'Slug must be lowercase alphanumeric with hyphens only.'
    }
    if (!companyEmail.trim()) e.companyEmail = 'Company email is required.'
    else if (!isValidEmail(companyEmail)) e.companyEmail = 'Please enter a valid company email.'

    // Admin account validation
    if (!name.trim()) e.name = 'Full name is required.'
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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          password,
          companyName: companyName.trim(),
          companySlug: companySlug.trim(),
          companyEmail: companyEmail.trim().toLowerCase(),
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        const code = data.code || ''
        if (code === 'EMAIL_EXISTS') {
          setErrors({ email: 'This email is already registered.' })
          toast.error('This email is already registered.')
        } else if (code === 'SLUG_EXISTS') {
          setErrors({ companySlug: 'This company URL slug is already taken.' })
          toast.error('This company URL slug is already taken.')
        } else {
          toast.error(data.error || 'Registration failed.')
        }
        return
      }

      // Success — log in
      login(data.user, data.token, data.organization)
      toast.success(`Welcome to RecruitPro, ${data.user.name}! Your company "${data.organization?.name}" is ready.`)
    } catch {
      toast.error('No internet connection. Please check your network.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-lg"
      >
        <Card className="w-full shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
          <CardHeader className="text-center space-y-2 pb-4 pt-6 sm:pt-8 px-4 sm:px-8">
            <div className="mx-auto flex items-center justify-center h-14 w-14 sm:h-16 sm:w-16 rounded-xl bg-emerald-600 text-white mb-2">
              <Building2 className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <CardTitle className="text-2xl sm:text-3xl font-bold">Register Your Company</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Create your organization and admin account to get started
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5 px-4 sm:px-8">
              {/* ── Company Details Section ── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1">
                  <Building2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-foreground">Company Details</span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyName" className="text-sm">Company Name *</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="companyName"
                      placeholder="Acme Recruiting"
                      value={companyName}
                      onChange={e => { handleCompanyNameChange(e.target.value); clearError('companyName') }}
                      className={`pl-10 h-11 ${errors.companyName ? 'border-red-300 dark:border-red-700' : ''}`}
                      autoComplete="organization"
                    />
                  </div>
                  {errors.companyName && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.companyName}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companySlug" className="text-sm">Company URL Slug *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">recruitpro.app/</span>
                    <Input
                      id="companySlug"
                      placeholder="my-company"
                      value={companySlug}
                      onChange={e => { setCompanySlug(e.target.value); clearError('companySlug') }}
                      className={`pl-[7.5rem] h-11 font-mono text-sm ${errors.companySlug ? 'border-red-300 dark:border-red-700' : ''}`}
                    />
                  </div>
                  {errors.companySlug && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.companySlug}</p>}
                  <p className="text-xs text-muted-foreground">Lowercase, alphanumeric with hyphens only. This is your unique URL.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyEmail" className="text-sm">Company Email *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="companyEmail"
                        type="email"
                        placeholder="info@acme.com"
                        value={companyEmail}
                        onChange={e => { setCompanyEmail(e.target.value); clearError('companyEmail') }}
                        className={`pl-10 h-11 ${errors.companyEmail ? 'border-red-300 dark:border-red-700' : ''}`}
                        autoComplete="organization email"
                      />
                    </div>
                    {errors.companyEmail && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.companyEmail}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyPhone" className="text-sm">Company Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="companyPhone"
                        placeholder="+1-555-0100"
                        value={companyPhone}
                        onChange={e => setCompanyPhone(e.target.value)}
                        className="pl-10 h-11"
                        autoComplete="organization tel"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t" />

              {/* ── Admin Account Section ── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1">
                  <User className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-foreground">Admin Account</span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminName" className="text-sm">Full Name *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="adminName"
                      placeholder="John Doe"
                      value={name}
                      onChange={e => { setName(e.target.value); clearError('name') }}
                      className={`pl-10 h-11 ${errors.name ? 'border-red-300 dark:border-red-700' : ''}`}
                      autoComplete="name"
                    />
                  </div>
                  {errors.name && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.name}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="adminEmail" className="text-sm">Email *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="adminEmail"
                        type="email"
                        placeholder="john@acme.com"
                        value={email}
                        onChange={e => { setEmail(e.target.value); clearError('email') }}
                        className={`pl-10 h-11 ${errors.email ? 'border-red-300 dark:border-red-700' : ''}`}
                        autoComplete="email"
                      />
                    </div>
                    {errors.email && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.email}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminPhone" className="text-sm">Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="adminPhone"
                        placeholder="+1-555-0199"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        className="pl-10 h-11"
                        autoComplete="tel"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminPassword" className="text-sm">Password *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="adminPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min 8 characters with a letter and number"
                      value={password}
                      onChange={e => { setPassword(e.target.value); clearError('password') }}
                      className={`pl-10 pr-10 h-11 ${errors.password ? 'border-red-300 dark:border-red-700' : ''}`}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.password}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm">Confirm Password *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={e => { setConfirmPassword(e.target.value); clearError('confirmPassword') }}
                      className={`pl-10 pr-10 h-11 ${errors.confirmPassword ? 'border-red-300 dark:border-red-700' : ''}`}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.confirmPassword && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.confirmPassword}</p>}
                </div>
              </div>

              {/* Info banner */}
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3">
                <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  You will be registered as the Organization Admin with full management access on the free plan.
                </p>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4 pt-4 sm:pt-6 pb-6 sm:pb-8 px-4 sm:px-8">
              <Button
                type="submit"
                className="w-full h-11 sm:h-12 text-sm sm:text-base bg-emerald-600 hover:bg-emerald-700"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Building2 className="mr-2 h-4 w-4" />
                Create Company & Account
              </Button>
              <button
                type="button"
                onClick={onBack}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Already have an account? Sign In
              </button>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  )
}
