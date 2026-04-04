'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Settings as SettingsIcon,
  User,
  Lock,
  Timer,
  ToggleLeft,
  Trash2,
  LogOut,
  Pencil,
  Check,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { toast } from 'sonner'
import { useAuthStore, authFetch } from '@/stores/auth-store'
import { cn } from '@/lib/utils'

interface SettingsProps {
  userId: string
  onLogout: () => void
}

export function Settings({ userId, onLogout }: SettingsProps) {
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

  // Call delay
  const [callDelay, setCallDelay] = useState(3)

  // Toggles
  const [callingMode, setCallingMode] = useState(true)
  const [whatsappAccess, setWhatsappAccess] = useState(true)

  // Load user data once on mount (skip deps on updateUser/user to avoid infinite loop)
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
          setCallingMode(u.callModeOn ?? true)
          setWhatsappAccess(u.whatsappAccess ?? true)
          updateUser(u)
        } else {
          // If fetch fails (e.g. 401), use store data as fallback
          const currentUser = useAuthStore.getState().user
          setNameValue(currentUser?.name || '')
          setEmailValue(currentUser?.email || '')
          setPhoneValue(currentUser?.phone || '')
          setCallingMode(currentUser?.callModeOn ?? true)
          setWhatsappAccess(currentUser?.whatsappAccess ?? true)
        }
      } catch {
        const currentUser = useAuthStore.getState().user
        setNameValue(currentUser?.name || '')
        setEmailValue(currentUser?.email || '')
        setPhoneValue(currentUser?.phone || '')
      }

      const savedDelay = localStorage.getItem('recruiter-call-delay')
      if (savedDelay) {
        setCallDelay(parseInt(savedDelay, 10) || 3)
      }

      setLoading(false)
    }
    loadData()
  }, [userId])

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
      // Revert
      if (field === 'name') setNameValue(user?.name || '')
      if (field === 'email') setEmailValue(user?.email || '')
      if (field === 'phone') setPhoneValue(user?.phone || '')
    }
    setSavingProfile(false)
    if (field === 'name') setEditName(false)
    else if (field === 'email') setEditEmail(false)
    else if (field === 'phone') setEditPhone(false)
  }

  // Change password
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

  // Save call delay
  const handleSaveCallDelay = (value: number) => {
    setCallDelay(value)
    localStorage.setItem('recruiter-call-delay', String(value))
  }

  // Toggle calling mode
  const handleToggleCallingMode = async (checked: boolean) => {
    setCallingMode(checked)
    try {
      const res = await authFetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callModeOn: checked }),
      })
      if (res.ok) {
        const data = await res.json()
        updateUser(data.user)
        toast.success(`Calling mode ${checked ? 'enabled' : 'disabled'}`)
      }
    } catch {
      toast.error('Failed to update calling mode')
      setCallingMode(!checked)
    }
  }

  // Toggle WhatsApp
  const handleToggleWhatsApp = async (checked: boolean) => {
    setWhatsappAccess(checked)
    try {
      const res = await authFetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsappAccess: checked }),
      })
      if (res.ok) {
        const data = await res.json()
        updateUser(data.user)
        toast.success(`WhatsApp access ${checked ? 'enabled' : 'disabled'}`)
      }
    } catch {
      toast.error('Failed to update WhatsApp access')
      setWhatsappAccess(!checked)
    }
  }

  // Clear cache
  const handleClearCache = () => {
    localStorage.removeItem('recruiter-call-delay')
    localStorage.removeItem('auth-storage')
    toast.success('Cache cleared. Please log in again.')
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl">
      <PageHeader
        title="Settings"
        description="Manage your account and preferences"
        icon={SettingsIcon}
      />

      {/* Profile Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Name */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Label className="text-xs text-muted-foreground">Name</Label>
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
                    className="h-11 w-11 p-0 shrink-0"
                    onClick={() => {
                      setEditName(false)
                      setNameValue(user?.name || '')
                    }}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm font-medium truncate">{nameValue}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 shrink-0"
                    onClick={() => setEditName(true)}
                  >
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
                    className="h-11 w-11 p-0 shrink-0"
                    onClick={() => {
                      setEditEmail(false)
                      setEmailValue(user?.email || '')
                    }}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm font-medium truncate">{emailValue}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 shrink-0"
                    onClick={() => setEditEmail(true)}
                  >
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
                    className="h-11 w-11 p-0 shrink-0"
                    onClick={() => {
                      setEditPhone(false)
                      setPhoneValue(user?.phone || '')
                    }}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm font-medium truncate">{phoneValue || 'Not set'}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 shrink-0"
                    onClick={() => setEditPhone(true)}
                  >
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
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <PasswordInput
              id="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <PasswordInput
              id="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="h-11"
            />
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleChangePassword}
            disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
          >
            {savingPassword ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Changing...
              </>
            ) : (
              'Change Password'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Call Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Call Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Call Delay */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Call Delay</Label>
                <p className="text-xs text-muted-foreground">Seconds between auto-dialed calls</p>
              </div>
              <span className="text-sm font-bold text-emerald-600 tabular-nums">{callDelay}s</span>
            </div>
            <Slider
              value={[callDelay]}
              onValueChange={([v]) => handleSaveCallDelay(v)}
              onValueCommit={([v]) => toast.success(`Call delay set to ${v} seconds`)}
              min={2}
              max={10}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>2s</span>
              <span>6s</span>
              <span>10s</span>
            </div>
          </div>

          <Separator />

          {/* Calling Mode Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="flex items-center gap-2">
                <ToggleLeft className="h-4 w-4" />
                Calling Mode
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">Enable outbound calling features</p>
            </div>
            <Switch checked={callingMode} onCheckedChange={handleToggleCallingMode} />
          </div>

          {/* WhatsApp Access Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>WhatsApp Access</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Allow WhatsApp integration</p>
            </div>
            <Switch checked={whatsappAccess} onCheckedChange={handleToggleWhatsApp} />
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-red-600">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Clear Cache</p>
              <p className="text-xs text-muted-foreground">Clear local storage and cached data</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 shrink-0"
              onClick={handleClearCache}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Clear
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Logout</p>
              <p className="text-xs text-muted-foreground">Sign out of your account</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 shrink-0"
              onClick={onLogout}
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              Logout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
