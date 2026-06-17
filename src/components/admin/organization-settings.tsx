'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import {
  Building2, CreditCard, Palette, Loader2, Check, Pencil,
  Mail, Phone, MapPin, Users, PhoneCall, Upload, Zap, Crown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/page-header'

// ─── UsageMeter (extracted as static component) ─────────────────────────────

function UsageMeter({
  icon: Icon,
  label,
  current,
  max,
  unit = '',
}: {
  icon: React.ElementType
  label: string
  current: number
  max: number
  unit?: string
}) {
  const percentage = Math.min(Math.round((current / max) * 100), 100)
  const isHigh = percentage >= 80
  const isCritical = percentage >= 95

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Icon className={`size-4 ${isCritical ? 'text-red-500' : isHigh ? 'text-amber-500' : 'text-muted-foreground'}`} />
          <span className="font-medium">{label}</span>
        </div>
        <span className={`text-sm font-semibold ${isCritical ? 'text-red-600' : isHigh ? 'text-amber-600' : 'text-muted-foreground'}`}>
          {current}{unit} / {max}{unit}
        </span>
      </div>
      <Progress
        value={percentage}
        className={`h-2 ${isCritical ? '[&>[data-slot=progress-indicator]]:bg-red-500' : isHigh ? '[&>[data-slot=progress-indicator]]:bg-amber-500' : ''}`}
      />
      <p className="text-xs text-muted-foreground">
        {isCritical
          ? '⚠ Critical — contact support to upgrade'
          : isHigh
            ? `${percentage}% used — consider upgrading`
            : `${percentage}% used`}
      </p>
    </div>
  )
}

// ─── EditableField (extracted as static component) ────────────────────────────

function EditableField({
  fieldKey,
  label,
  value,
  onChange,
  icon: Icon,
  placeholder,
  isEditing,
  saving,
  onEditStart,
  onSave,
  onCancel,
}: {
  fieldKey: string
  label: string
  value: string
  onChange: (val: string) => void
  icon?: React.ElementType
  placeholder?: string
  isEditing: boolean
  saving: boolean
  onEditStart: () => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {isEditing ? (
          <div className="flex items-center gap-2 mt-1">
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-9"
              placeholder={placeholder}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave()
                if (e.key === 'Escape') onCancel()
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-9 p-0 text-emerald-600 shrink-0"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-9 p-0 shrink-0"
              onClick={onCancel}
            >
              ✕
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-1">
            {Icon && <Icon className="size-3.5 text-muted-foreground shrink-0" />}
            <p className="text-sm font-medium truncate">{value || 'Not set'}</p>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-9 p-0 shrink-0"
              onClick={onEditStart}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OrganizationSettings() {
  const { organization } = useAuthStore()

  // Edit states
  const [editField, setEditField] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // General form fields (initialized from org store, fallback to mock Akolta data)
  const [orgName, setOrgName] = useState(organization?.name || 'Akolta HR Solutions')
  const [orgEmail, setOrgEmail] = useState(organization?.email || 'admin@akolta.com')
  const [orgPhone, setOrgPhone] = useState(organization?.phone || '+91 98765 00001')
  const [orgAddress, setOrgAddress] = useState('123 Business Park, MG Road, Bangalore 560001')

  // TODO: Connect to real plan/usage API — currently showing placeholder data
  const planData = {
    name: 'Professional',
    status: 'active',
    price: '₹4,999/mo',
    billingCycle: 'Monthly',
    nextBilling: 'Feb 1, 2025',
    users: { current: 6, max: 25 },
    numbers: { current: 3, max: 10 },
    dailyUpload: { current: 2450, max: 5000 },
  }

  // Save handler (placeholder)
  async function handleSaveField(fieldKey: string, value: string) {
    setSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 800))
    toast.success(`${fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1)} updated successfully`)
    setEditField(null)
    setSaving(false)
  }

  function startEdit(fieldKey: string) {
    setEditField(fieldKey)
  }

  function cancelEdit() {
    setEditField(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization Settings"
        description="Manage your organization's general settings, plan, and branding"
        icon={Building2}
      />

      <Tabs defaultValue="general">
        <TabsList className="flex-wrap">
          <TabsTrigger value="general" className="gap-1.5">
            <Building2 className="size-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="plan" className="gap-1.5">
            <CreditCard className="size-3.5" />
            Plan & Usage
          </TabsTrigger>
          <TabsTrigger value="branding" className="gap-1.5">
            <Palette className="size-3.5" />
            Branding
          </TabsTrigger>
        </TabsList>

        {/* ═══════════ General Tab ═══════════ */}
        <TabsContent value="general">
          <div className="max-w-2xl">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Organization Details
                </CardTitle>
                <CardDescription>
                  Basic information about your organization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <EditableField
                  fieldKey="name"
                  label="Organization Name"
                  value={orgName}
                  onChange={setOrgName}
                  placeholder="Organization name"
                  isEditing={editField === 'name'}
                  saving={saving}
                  onEditStart={() => startEdit('name')}
                  onSave={() => handleSaveField('name', orgName)}
                  onCancel={cancelEdit}
                />

                <Separator />

                <EditableField
                  fieldKey="email"
                  label="Contact Email"
                  value={orgEmail}
                  onChange={setOrgEmail}
                  icon={Mail}
                  placeholder="contact@example.com"
                  isEditing={editField === 'email'}
                  saving={saving}
                  onEditStart={() => startEdit('email')}
                  onSave={() => handleSaveField('email', orgEmail)}
                  onCancel={cancelEdit}
                />

                <Separator />

                <EditableField
                  fieldKey="phone"
                  label="Phone Number"
                  value={orgPhone}
                  onChange={setOrgPhone}
                  icon={Phone}
                  placeholder="+91 98765 00000"
                  isEditing={editField === 'phone'}
                  saving={saving}
                  onEditStart={() => startEdit('phone')}
                  onSave={() => handleSaveField('phone', orgPhone)}
                  onCancel={cancelEdit}
                />

                <Separator />

                <EditableField
                  fieldKey="address"
                  label="Address"
                  value={orgAddress}
                  onChange={setOrgAddress}
                  icon={MapPin}
                  placeholder="Full address"
                  isEditing={editField === 'address'}
                  saving={saving}
                  onEditStart={() => startEdit('address')}
                  onSave={() => handleSaveField('address', orgAddress)}
                  onCancel={cancelEdit}
                />

                <Separator />

                {/* Read-only status */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div className="flex items-center gap-2">
                    {organization?.isActive ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                        Active
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:border-red-800">
                        Inactive
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Slug: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{organization?.slug || 'akolta-hr'}</code>
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════ Plan & Usage Tab ═══════════ */}
        <TabsContent value="plan">
          <div className="max-w-2xl space-y-6">
            {/* Current Plan Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Crown className="h-4 w-4 text-amber-500" />
                      Current Plan
                    </CardTitle>
                    <CardDescription>
                      Your active subscription details
                    </CardDescription>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                    Active
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Plan Name</p>
                    <p className="font-semibold">{planData.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Price</p>
                    <p className="font-semibold">{planData.price}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Billing Cycle</p>
                    <p className="font-semibold">{planData.billingCycle}</p>
                  </div>
                </div>
                <Separator className="my-4" />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Next billing date: <span className="font-medium text-foreground">{planData.nextBilling}</span>
                  </p>
                  <Button size="sm" variant="outline">
                    <Zap className="size-3.5 mr-1.5" />
                    Upgrade Plan
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Usage Meters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Resource Usage
                </CardTitle>
                <CardDescription>
                  Monitor your current resource utilization against plan limits
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <UsageMeter
                  icon={Users}
                  label="Team Members"
                  current={planData.users.current}
                  max={planData.users.max}
                />
                <Separator />
                <UsageMeter
                  icon={PhoneCall}
                  label="Phone Numbers"
                  current={planData.numbers.current}
                  max={planData.numbers.max}
                />
                <Separator />
                <UsageMeter
                  icon={Upload}
                  label="Daily Upload Limit"
                  current={planData.dailyUpload.current}
                  max={planData.dailyUpload.max}
                  unit=" records"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════ Branding Tab ═══════════ */}
        <TabsContent value="branding">
          <div className="max-w-2xl">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Organization Branding
                </CardTitle>
                <CardDescription>
                  Customize your organization's appearance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Logo Upload */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Organization Logo</Label>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center h-20 w-20 rounded-xl bg-muted border-2 border-dashed shrink-0">
                        <Building2 className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Upload your organization&apos;s logo for a personalized experience.
                        </p>
                        <Button size="sm" variant="outline" disabled>
                          <Upload className="size-3.5 mr-1.5" />
                          Upload Logo
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Recommended: 200×200px, PNG or SVG format. Max 2MB.
                    </p>
                  </div>

                  <Separator />

                  {/* Primary Color */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Primary Color</Label>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-emerald-600 border shrink-0" />
                      <Input
                        value="#059669"
                        readOnly
                        disabled
                        className="max-w-[160px] h-10"
                      />
                      <Button size="sm" variant="outline" disabled>
                        <Palette className="size-3.5 mr-1.5" />
                        Customize
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Changes will apply to buttons, links, and accent elements across the app.
                    </p>
                  </div>

                  <Separator />

                  {/* Coming Soon Notice */}
                  <div className="rounded-lg bg-muted/50 border border-dashed p-4 text-center space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Branding customization coming soon
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Full branding options including custom logo, primary color, login page customization, and email templates will be available in a future update.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
