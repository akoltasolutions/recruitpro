'use client'

import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, Smartphone, Monitor, LogOut, Copy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { authFetch } from '@/stores/auth-store'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { MfaSetupDialog } from './mfa-setup-dialog'

interface Session {
  id: string
  ipAddress: string
  userAgent: string
  lastActivityAt: string
  createdAt: string
  expiresAt: string
}

interface SecuritySettingsProps {
  showMfa?: boolean
}

function formatBrowser(ua: string) {
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari'
  if (ua.includes('Edg')) return 'Edge'
  return 'Unknown Browser'
}

function formatDevice(ua: string) {
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('iPhone')) return 'iPhone'
  if (ua.includes('iPad')) return 'iPad'
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('Mac') && !ua.includes('iPhone')) return 'Mac'
  if (ua.includes('Linux')) return 'Linux'
  return 'Unknown Device'
}

export function SecuritySettings({ showMfa = true }: SecuritySettingsProps) {
  const { user } = useAuthStore()
  const [mfaStatus, setMfaStatus] = useState<{ mfaEnabled: boolean; mfaVerified: boolean } | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [showMfaSetup, setShowMfaSetup] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[]>([])

  const fetchMfaStatus = useCallback(async () => {
    if (!showMfa) return
    try {
      const res = await authFetch('/api/auth/mfa/setup')
      if (res.ok) {
        const data = await res.json()
        setMfaStatus({ mfaEnabled: data.mfaEnabled, mfaVerified: data.mfaVerified })
      }
    } catch { /* ignore */ }
  }, [showMfa])

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const res = await authFetch('/api/auth/sessions')
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions || [])
      }
    } catch { /* ignore */ }
    finally { setLoadingSessions(false) }
  }, [])

  useEffect(() => {
    fetchMfaStatus()
    fetchSessions()
  }, [fetchMfaStatus, fetchSessions])

  const handleMfaComplete = (codes?: string[]) => {
    setShowMfaSetup(false)
    fetchMfaStatus()
    if (codes) {
      setBackupCodes(codes)
    }
  }

  const handleDisableMfa = async () => {
    if (!confirm('Are you sure you want to disable Multi-Factor Authentication? This will reduce your account security.')) return
    try {
      const res = await authFetch('/api/auth/mfa/setup', { method: 'DELETE' })
      if (res.ok) {
        toast.success('MFA disabled')
        fetchMfaStatus()
      } else {
        toast.error('Failed to disable MFA')
      }
    } catch {
      toast.error('Failed to disable MFA')
    }
  }

  const handleRevokeSession = async (sessionId: string) => {
    setRevoking(sessionId)
    try {
      const res = await authFetch('/api/auth/sessions', {
        method: 'DELETE',
        body: JSON.stringify({ sessionId }),
      })
      if (res.ok) {
        toast.success('Session revoked')
        fetchSessions()
      } else {
        toast.error('Failed to revoke session')
      }
    } catch {
      toast.error('Failed to revoke session')
    }
    setRevoking(null)
  }

  const handleRevokeAll = async () => {
    if (!confirm('Are you sure you want to log out from ALL devices? You will need to log in again.')) return
    try {
      const res = await authFetch('/api/auth/sessions', {
        method: 'DELETE',
        body: JSON.stringify({ revokeAll: true }),
      })
      if (res.ok) {
        toast.success('All sessions revoked. Please log in again.')
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    } catch {
      toast.error('Failed to revoke sessions')
    }
  }

  const requireMfa = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN'

  return (
    <div className="space-y-6">
      {/* MFA Section */}
      {showMfa && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Multi-Factor Authentication</CardTitle>
                <CardDescription>
                  {requireMfa ? 'MFA is required for your role' : 'Add an extra layer of security'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">Authenticator App</p>
                  <p className="text-sm text-muted-foreground">
                    {mfaStatus?.mfaEnabled
                      ? 'Enabled and verified'
                      : 'Not enabled'}
                  </p>
                </div>
              </div>
              <Badge variant={mfaStatus?.mfaEnabled ? 'default' : 'secondary'}>
                {mfaStatus?.mfaEnabled ? 'Active' : 'Inactive'}
              </Badge>
            </div>

            {/* Backup Codes Display */}
            {backupCodes.length > 0 && (
              <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                <div className="flex items-start gap-2 mb-3">
                  <Copy className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">Save Your Backup Codes</p>
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Store these codes in a safe place. Each code can only be used once.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {backupCodes.map((code, i) => (
                    <div key={i} className="px-3 py-2 bg-white dark:bg-gray-900 rounded border font-mono text-sm">
                      {code}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(backupCodes.join('\n'))
                      toast.success('Codes copied to clipboard')
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setBackupCodes([])}>
                    I&apos;ve saved them
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              {!mfaStatus?.mfaEnabled ? (
                <Button onClick={() => setShowMfaSetup(true)}>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Enable MFA
                </Button>
              ) : (
                <Button variant="outline" onClick={handleDisableMfa}>
                  Disable MFA
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Monitor className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <CardTitle>Active Sessions</CardTitle>
              <CardDescription>Manage your logged-in devices</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleRevokeAll}>
              <LogOut className="h-4 w-4 mr-1" />
              Logout All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSessions ? (
            <div className="text-center py-8 text-muted-foreground">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No active sessions</div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3 min-w-0">
                    <Monitor className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {formatBrowser(session.userAgent)} on {formatDevice(session.userAgent)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        IP: {session.ipAddress} · Last active: {new Date(session.lastActivityAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevokeSession(session.id)}
                    disabled={revoking === session.id}
                    className="shrink-0"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* MFA Setup Dialog */}
      {showMfaSetup && (
        <MfaSetupDialog
          onComplete={handleMfaComplete}
          onClose={() => setShowMfaSetup(false)}
        />
      )}
    </div>
  )
}
