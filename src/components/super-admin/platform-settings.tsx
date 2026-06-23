'use client'

import { useState, useEffect } from 'react'
import { useAuthStore, authFetch } from '@/stores/auth-store'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Settings, Shield, Loader2, Save, Timer, Smartphone } from 'lucide-react'

interface PlatformSettings {
  subscriptionEnforcement: boolean
  defaultMaxUsers: number
  defaultMaxNumbers: number
  defaultDailyUploadLimit: number
  includeDispositionTime: boolean
  apkVersion: string
  apkReleaseDate: string
}

const defaultSettings: PlatformSettings = {
  subscriptionEnforcement: false,
  defaultMaxUsers: 10,
  defaultMaxNumbers: 5000,
  defaultDailyUploadLimit: 500,
  includeDispositionTime: true,
  apkVersion: '1.0.0',
  apkReleaseDate: '',
}

export function PlatformSettingsPage() {
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
      } else if (res.status === 401) {
        toast.error('Session expired. Please log in again.')
      } else {
        toast.error('Failed to load platform settings. Using defaults.')
      }
    } catch {
      // Network error — use defaults so the page still loads
      toast.error('Network error. Using default settings.')
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

        {/* Mobile App Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-emerald-600" />
              <div>
                <CardTitle className="text-base">Mobile App</CardTitle>
                <CardDescription>
                  Configure Android APK version and release info. The download button on the login page always serves the latest APK from the server.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="apk-version">Current APK Version</Label>
                <Input
                  id="apk-version"
                  placeholder="e.g. 1.2.0"
                  value={settings.apkVersion}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, apkVersion: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Version displayed to users downloading the app
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="apk-release-date">Release Date</Label>
                <Input
                  id="apk-release-date"
                  type="date"
                  value={settings.apkReleaseDate}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, apkReleaseDate: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  When this APK version was released
                </p>
              </div>
            </div>
            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-xs text-muted-foreground">
                <strong>APK File Location:</strong> <code className="bg-muted px-1.5 py-0.5 rounded text-xs">upload/recruitpro.apk</code>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                To update the APK: place the new <code>recruitpro.apk</code> file in the <code>upload/</code> directory and update the version above. The download button will automatically serve the latest file.
              </p>
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
