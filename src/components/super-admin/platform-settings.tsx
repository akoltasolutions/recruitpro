'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Settings, Shield, Loader2, Save, Timer } from 'lucide-react'

interface PlatformSettings {
  subscriptionEnforcement: boolean
  defaultMaxUsers: number
  defaultMaxNumbers: number
  defaultDailyUploadLimit: number
  includeDispositionTime: boolean
}

const defaultSettings: PlatformSettings = {
  subscriptionEnforcement: false,
  defaultMaxUsers: 10,
  defaultMaxNumbers: 5000,
  defaultDailyUploadLimit: 500,
  includeDispositionTime: true,
}

export function PlatformSettingsPage() {
  const { authFetch } = useAuthStore()
  const [settings, setSettings] = useState<PlatformSettings>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const res = await authFetch('/api/super-admin/platform-settings')
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
      } else {
        toast.error('Failed to load platform settings')
      }
    } catch {
      toast.error('Failed to load platform settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await authFetch('/api/super-admin/platform-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        toast.success('Platform settings saved successfully')
      } else {
        toast.error('Failed to save platform settings')
      }
    } catch {
      toast.error('Failed to save platform settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Platform Settings"
        description="Configure global platform-wide settings and defaults"
        icon={Settings}
      >
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </PageHeader>

      <div className="space-y-6">
        {/* Subscription Enforcement */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-violet-600" />
              <div>
                <CardTitle className="text-base">Subscription Enforcement</CardTitle>
                <CardDescription>
                  Control whether organizations are limited by their subscription plan
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="subscription-enforcement" className="text-sm font-medium">
                  Enable subscription enforcement
                </Label>
                <p className="text-xs text-muted-foreground">
                  {settings.subscriptionEnforcement
                    ? 'Organizations will be limited by their subscription plan limits'
                    : 'All organizations get unlimited access regardless of their plan'}
                </p>
              </div>
              <Switch
                id="subscription-enforcement"
                checked={settings.subscriptionEnforcement}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, subscriptionEnforcement: checked }))
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Call Timer Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-emerald-600" />
              <div>
                <CardTitle className="text-base">Call Timer Settings</CardTitle>
                <CardDescription>
                  Configure how call duration is measured across the platform
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="include-disposition-time" className="text-sm font-medium">
                  Include Disposition Time in Call Timer
                </Label>
                <p className="text-xs text-muted-foreground">
                  {settings.includeDispositionTime
                    ? 'Call timer runs from Call button click until disposition is submitted (includes talk time + disposition fill time)'
                    : 'Call timer stops when recruiter returns from call (only actual call duration counted)'}
                </p>
              </div>
              <Switch
                id="include-disposition-time"
                checked={settings.includeDispositionTime}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, includeDispositionTime: checked }))
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Default Limits */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Default Organization Limits</CardTitle>
            <CardDescription>
              Default limits applied when a new organization is created
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="max-users">Default Max Users</Label>
                <Input
                  id="max-users"
                  type="number"
                  min={1}
                  value={settings.defaultMaxUsers}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      defaultMaxUsers: parseInt(e.target.value) || 0,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Maximum team members per organization
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-numbers">Default Max Numbers</Label>
                <Input
                  id="max-numbers"
                  type="number"
                  min={1}
                  value={settings.defaultMaxNumbers}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      defaultMaxNumbers: parseInt(e.target.value) || 0,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Maximum phone numbers per organization
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="upload-limit">Default Daily Upload Limit</Label>
                <Input
                  id="upload-limit"
                  type="number"
                  min={1}
                  value={settings.defaultDailyUploadLimit}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      defaultDailyUploadLimit: parseInt(e.target.value) || 0,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Maximum daily number uploads
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
