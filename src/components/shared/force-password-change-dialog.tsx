'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { authFetch, useAuthStore } from '@/stores/auth-store'
import { Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

export function ForcePasswordChangeDialog() {
  const requirePasswordChange = useAuthStore((s) => s.requirePasswordChange)
  const clearRequirePasswordChange = useAuthStore((s) => s.clearRequirePasswordChange)
  const logout = useAuthStore((s) => s.logout)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!requirePasswordChange) return null

  const isValid = newPassword.length >= 8 && /[a-zA-Z]/.test(newPassword) && /\d/.test(newPassword)
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0

  async function handleSubmit() {
    setError('')
    if (!newPassword) {
      setError('Password is required')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError('Password must contain at least one letter and one number')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: '', newPassword, skipCurrentPassword: true }),
      })
      const data = await res.json()

      if (!res.ok) {
        // The change-password API requires currentPassword, but temp password
        // users don't know it. We need a different approach.
        // Use the special temp-password-change endpoint behavior
        setError(data.error || 'Failed to change password')
        return
      }

      clearRequirePasswordChange()
      toast.success('Password changed successfully! You can now continue using the application.')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    clearRequirePasswordChange()
    logout()
  }

  return (
    <Dialog open={true} onOpenChange={() => { /* prevent closing */ }}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center size-10 rounded-full bg-amber-100 dark:bg-amber-950">
              <ShieldCheck className="size-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <DialogTitle>Change Your Password</DialogTitle>
              <DialogDescription className="mt-1">
                You logged in with a temporary password. Please set a new password to continue.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/50 p-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="force-new-password">New Password</Label>
            <div className="relative">
              <Input
                id="force-new-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min 8 chars with a letter and number"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError('') }}
                className="pr-10"
                autoFocus
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {newPassword && !isValid && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Must be 8+ chars with a letter and a number</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="force-confirm-password">Confirm New Password</Label>
            <Input
              id="force-confirm-password"
              type="password"
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
            />
            {confirmPassword && !passwordsMatch && (
              <p className="text-xs text-red-500">Passwords do not match</p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={handleLogout} disabled={loading} className="w-full sm:w-auto">
            Logout
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !isValid || !passwordsMatch}
            className="w-full sm:w-auto"
          >
            {loading && <Loader2 className="size-4 animate-spin mr-2" />}
            Set New Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}