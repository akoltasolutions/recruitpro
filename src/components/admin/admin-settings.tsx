'use client'

import React, { useEffect, useState } from 'react'
import {
  Settings as SettingsIcon,
  User,
  Lock,
  Eye,
  EyeOff,
  Pencil,
  Check,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from 'sonner'
import { useAuthStore, authFetch } from '@/stores/auth-store'

interface AdminSettingsProps {
  userId: string
}

export function AdminSettings({ userId }: AdminSettingsProps) {
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)

  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  // Profile
  const [editName, setEditName] = useState(false)
  const [editEmail, setEditEmail] = useState(false)
  const [editPhone, setEditPhone] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [emailValue, setEmailValue] = useState('')
  const [phoneValue, setPhoneValue] = useState('')

  // Password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Password strength
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'fair' | 'good' | 'strong' | null>(null)

  // Load user data on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const res = await authFetch(`/api/users/${userId}`)
        if (res.ok) {
          const data = await res.json()
          const u = data.user
          setNameValue(u.name || '')
          setEmailValue(u.email || '')
          setPhoneValue(u.phone || '')
          useAuthStore.getState().updateUser(u)
        }
      } catch {
        const currentUser = useAuthStore.getState().user
        setNameValue(currentUser?.name || '')
        setEmailValue(currentUser?.email || '')
        setPhoneValue(currentUser?.phone || '')
      }
      setLoading(false)
    }
    loadData()
  }, [userId])

  // Password strength calculation
  useEffect(() => {
    if (!newPassword) {
      setPasswordStrength(null)
      return
    }
    let score = 0
    if (newPassword.length >= 8) score++
    if (newPassword.length >= 12) score++
    if (/[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword)) score++
    if (/[0-9]/.test(newPassword)) score++
    if (/[^a-zA-Z0-9]/.test(newPassword)) score++

    if (score <= 1) setPasswordStrength('weak')
    else if (score === 2) setPasswordStrength('fair')
    else if (score === 3) setPasswordStrength('good')
    else setPasswordStrength('strong')
  }, [newPassword])

  // Save profile field
  const handleSaveProfile = async (field: string, value: string) => {
    setSavingProfile(true)
    try {
      const res = await authFetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      updateUser(data.user)
      toast.success(`${field.charAt(0).toUpperCase() + field.slice(1)} updated`)
    } catch {
      toast.error(`Failed to update ${field}`)
      if (field === 'name') setNameValue(user?.name || '')
      if (field === 'email') setEmailValue(user?.email || '')
      if (field === 'phone') setPhoneValue(user?.phone || '')
    }
    setSavingProfile(false)
    if (field === 'name') setEditName(false)
    else if (field === 'email') setEditEmail(false)
    else if (field === 'phone') setEditPhone(false)
  }

  // Change password using dedicated API
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('All password fields are required')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      toast.error('Password must contain at least one letter and one number')
      return
    }

    setSavingPassword(true)
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to change password')
        setSavingPassword(false)
        return
      }
      toast.success('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      toast.error('Failed to change password')
    }
    setSavingPassword(false)
  }

  const strengthColors: Record<string, string> = {
    weak: 'bg-red-500',
    fair: 'bg-amber-500',
    good: 'bg-emerald-500',
    strong: 'bg-emerald-600',
  }

  const strengthLabels: Record<string, string> = {
    weak: 'Weak',
    fair: 'Fair',
    good: 'Good',
    strong: 'Strong',
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl">
      <PageHeader
        title="Admin Settings"
        description="Manage your admin account and security"
        icon={SettingsIcon}
      />

      {/* Profile Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile Information
          </CardTitle>
          <CardDescription>Your admin account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Role Badge */}
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              Administrator
            </span>
          </div>
          <Separator />

          {/* Name */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Label className="text-xs text-muted-foreground">Full Name</Label>
              {editName ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    className="h-9"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 text-emerald-600 shrink-0"
                    onClick={() => handleSaveProfile('name', nameValue)}
                    disabled={savingProfile}
                  >
                    {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 shrink-0"
                    onClick={() => { setEditName(false); setNameValue(user?.name || '') }}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm font-medium truncate">{nameValue}</p>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0 shrink-0" onClick={() => setEditName(true)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Email */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Label className="text-xs text-muted-foreground">Email</Label>
              {editEmail ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    value={emailValue}
                    onChange={(e) => setEmailValue(e.target.value)}
                    className="h-9"
                    type="email"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 text-emerald-600 shrink-0"
                    onClick={() => handleSaveProfile('email', emailValue)}
                    disabled={savingProfile}
                  >
                    {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 shrink-0"
                    onClick={() => { setEditEmail(false); setEmailValue(user?.email || '') }}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm font-medium truncate">{emailValue}</p>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0 shrink-0" onClick={() => setEditEmail(true)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Phone */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Label className="text-xs text-muted-foreground">Phone</Label>
              {editPhone ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    value={phoneValue}
                    onChange={(e) => setPhoneValue(e.target.value)}
                    className="h-9"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 text-emerald-600 shrink-0"
                    onClick={() => handleSaveProfile('phone', phoneValue)}
                    disabled={savingProfile}
                  >
                    {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 shrink-0"
                    onClick={() => { setEditPhone(false); setPhoneValue(user?.phone || '') }}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm font-medium truncate">{phoneValue || 'Not set'}</p>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0 shrink-0" onClick={() => setEditPhone(true)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Change Password
          </CardTitle>
          <CardDescription>Update your admin account password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Password */}
          <div className="space-y-2">
            <Label htmlFor="admin-current-password">Current Password</Label>
            <div className="relative">
              <Input
                id="admin-current-password"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="pr-10 h-11"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Separator />

          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="admin-new-password">New Password</Label>
            <div className="relative">
              <Input
                id="admin-new-password"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 chars, letter + number"
                className="pr-10 h-11"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {/* Password strength indicator */}
            {newPassword && passwordStrength && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        ['weak', 'fair', 'good', 'strong'].indexOf(passwordStrength) >= i
                          ? strengthColors[passwordStrength]
                          : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Strength: <span className="font-medium">{strengthLabels[passwordStrength]}</span>
                </p>
              </div>
            )}
            <ul className="text-[11px] text-muted-foreground space-y-0.5">
              <li className={newPassword.length >= 8 ? 'text-emerald-600' : ''}>
                {newPassword.length >= 8 ? '✓' : '○'} At least 8 characters
              </li>
              <li className={/[a-zA-Z]/.test(newPassword) ? 'text-emerald-600' : ''}>
                {/[a-zA-Z]/.test(newPassword) ? '✓' : '○'} At least one letter
              </li>
              <li className={/[0-9]/.test(newPassword) ? 'text-emerald-600' : ''}>
                {/[0-9]/.test(newPassword) ? '✓' : '○'} At least one number
              </li>
            </ul>
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="admin-confirm-password">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="admin-confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className={`pr-10 h-11 ${
                  confirmPassword && confirmPassword !== newPassword
                    ? 'border-red-300 dark:border-red-700'
                    : confirmPassword && confirmPassword === newPassword
                    ? 'border-emerald-300 dark:border-emerald-700'
                    : ''
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword && confirmPassword !== newPassword && (
              <p className="text-xs text-red-500">Passwords do not match</p>
            )}
            {confirmPassword && confirmPassword === newPassword && (
              <p className="text-xs text-emerald-600">Passwords match</p>
            )}
          </div>

          <Button
            variant="outline"
            className="w-full h-11"
            onClick={handleChangePassword}
            disabled={
              savingPassword ||
              !currentPassword ||
              !newPassword ||
              !confirmPassword ||
              newPassword !== confirmPassword ||
              newPassword.length < 8
            }
          >
            {savingPassword ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Changing Password...
              </>
            ) : (
              <>
                <Lock className="h-4 w-4 mr-2" />
                Update Password
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
