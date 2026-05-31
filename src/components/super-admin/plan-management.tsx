'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  CreditCard, Plus, Pencil, Copy, Trash2, Users, Phone, Upload, HardDrive,
  Calendar, Infinity, Loader2, CheckCircle, XCircle, RefreshCw,
  ToggleLeft, ToggleRight, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { authFetch } from '@/stores/auth-store'

// ─── Types ───────────────────────────────────────────────────────────────────

type PlanType = 'FREE' | 'PAID' | 'CUSTOM' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE'
type PlanStatus = 'ACTIVE' | 'ARCHIVED'

interface FeatureAccess {
  whatsappIntegration?: boolean
  autoDialer?: boolean
  callRecording?: boolean
  googleSheetsSync?: boolean
  advancedAnalytics?: boolean
  customDispositions?: boolean
  customFields?: boolean
  apiAccess?: boolean
  teamManagement?: boolean
  pipelineView?: boolean
}

interface Plan {
  id: string
  name: string
  description: string | null
  type: string
  monthlyPrice: number
  yearlyPrice: number
  maxUsers: number
  maxNumbers: number
  dailyUploadLimit: number
  maxProjects: number
  maxDepartments: number
  isActive: boolean
  isDefault: boolean
  features: string
  trialDays: number
  monthlyCallLimit: number
  dailyCallLimit: number
  storageLimit: number
  isUnlimited: boolean
  featureAccess: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  _count: { organizations: number }
}

interface PlanFormData {
  name: string
  description: string
  type: PlanType
  isActive: boolean
  monthlyPrice: number
  yearlyPrice: number
  trialDays: number
  maxUsers: number
  maxNumbers: number
  dailyUploadLimit: number
  monthlyCallLimit: number
  dailyCallLimit: number
  storageLimit: number
  isUnlimited: boolean
  featureAccess: FeatureAccess
}

const featureLabels: { key: keyof FeatureAccess; label: string }[] = [
  { key: 'whatsappIntegration', label: 'WhatsApp Integration' },
  { key: 'autoDialer', label: 'Auto Dialer' },
  { key: 'callRecording', label: 'Call Recording' },
  { key: 'googleSheetsSync', label: 'Google Sheets Sync' },
  { key: 'advancedAnalytics', label: 'Advanced Analytics' },
  { key: 'customDispositions', label: 'Custom Dispositions' },
  { key: 'customFields', label: 'Custom Fields' },
  { key: 'apiAccess', label: 'API Access' },
  { key: 'teamManagement', label: 'Team Management' },
  { key: 'pipelineView', label: 'Pipeline View' },
]

const defaultFeatures: FeatureAccess = {
  whatsappIntegration: false,
  autoDialer: false,
  callRecording: false,
  googleSheetsSync: false,
  advancedAnalytics: false,
  customDispositions: false,
  customFields: false,
  apiAccess: false,
  teamManagement: false,
  pipelineView: false,
}

const emptyForm: PlanFormData = {
  name: '',
  description: '',
  type: 'PAID',
  isActive: true,
  monthlyPrice: 0,
  yearlyPrice: 0,
  trialDays: 0,
  maxUsers: 10,
  maxNumbers: 5000,
  dailyUploadLimit: 500,
  monthlyCallLimit: 0,
  dailyCallLimit: 0,
  storageLimit: 0,
  isUnlimited: false,
  featureAccess: { ...defaultFeatures },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price === 0) return 'Free'
  return `₹${price.toLocaleString('en-IN')}`
}

function formatLimit(value: number, label: string): string {
  if (value === -1) return `Unlimited ${label}`
  if (value === 0) return `0 ${label}`
  return `${value.toLocaleString('en-IN')} ${label}`
}

function parseFeatureAccess(json: string): FeatureAccess {
  try {
    return { ...defaultFeatures, ...JSON.parse(json) }
  } catch {
    return { ...defaultFeatures }
  }
}

function getEnabledFeatureCount(fa: FeatureAccess): number {
  return Object.values(fa).filter(Boolean).length
}

// ─── Badge Components ────────────────────────────────────────────────────────

function PlanTypeBadge({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    FREE: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:border-sky-800',
    PAID: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800',
    CUSTOM: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800',
    STARTER: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800',
    BUSINESS: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-400 dark:border-teal-800',
    ENTERPRISE: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-800',
  }
  return (
    <Badge className={`${colorMap[type] || ''} hover:${colorMap[type] || ''}`}>
      {type}
    </Badge>
  )
}

function PlanStatusBadge({ status }: { status: boolean }) {
  return status ? (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
      <CheckCircle className="size-3 mr-1" /> Active
    </Badge>
  ) : (
    <Badge className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
      <XCircle className="size-3 mr-1" /> Archived
    </Badge>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PlanManagement() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  // Dialog states
  const [formOpen, setFormOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [formData, setFormData] = useState<PlanFormData>(emptyForm)

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<Plan | null>(null)

  // ─── Fetch Plans ──────────────────────────────────────────────────────────

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true)
      const res = await authFetch('/api/super-admin/plans')
      if (!res.ok) throw new Error('Failed to fetch plans')
      const data = await res.json()
      setPlans(data)
    } catch (error) {
      console.error('Failed to fetch plans:', error)
      toast.error('Failed to load plans')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  // ─── Form Handlers ───────────────────────────────────────────────────────

  function openCreate() {
    setEditingPlan(null)
    setFormData(emptyForm)
    setFormOpen(true)
  }

  function openEdit(plan: Plan) {
    setEditingPlan(plan)
    setFormData({
      name: plan.name,
      description: plan.description || '',
      type: plan.type as PlanType,
      isActive: plan.isActive,
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      trialDays: plan.trialDays,
      maxUsers: plan.maxUsers,
      maxNumbers: plan.maxNumbers,
      dailyUploadLimit: plan.dailyUploadLimit,
      monthlyCallLimit: plan.monthlyCallLimit,
      dailyCallLimit: plan.dailyCallLimit,
      storageLimit: plan.storageLimit,
      isUnlimited: plan.isUnlimited,
      featureAccess: parseFeatureAccess(plan.featureAccess),
    })
    setFormOpen(true)
  }

  function handleUnlimitedToggle(checked: boolean) {
    if (checked) {
      setFormData((f) => ({
        ...f,
        isUnlimited: true,
        maxUsers: -1,
        maxNumbers: -1,
        dailyUploadLimit: -1,
        monthlyCallLimit: -1,
        dailyCallLimit: -1,
        storageLimit: -1,
      }))
    } else {
      setFormData((f) => ({
        ...f,
        isUnlimited: false,
        maxUsers: f.type === 'FREE' ? 1 : 10,
        maxNumbers: 5000,
        dailyUploadLimit: 500,
        monthlyCallLimit: 0,
        dailyCallLimit: 0,
        storageLimit: 0,
      }))
    }
  }

  function handlePlanTypeChange(newType: PlanType) {
    setFormData((f) => {
      if (newType === 'FREE') {
        return {
          ...f,
          type: newType,
          monthlyPrice: 0,
          yearlyPrice: 0,
          maxUsers: f.isUnlimited ? -1 : 1,
          dailyCallLimit: f.isUnlimited ? -1 : 25,
        }
      }
      return {
        ...f,
        type: newType,
        maxUsers: f.isUnlimited ? -1 : 10,
        dailyCallLimit: f.isUnlimited ? -1 : 0,
      }
    })
  }

  function handleFeatureToggle(key: keyof FeatureAccess) {
    setFormData((f) => ({
      ...f,
      featureAccess: {
        ...f.featureAccess,
        [key]: !f.featureAccess[key],
      },
    }))
  }

  async function handleSubmit() {
    if (!formData.name.trim()) {
      toast.error('Plan name is required')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description || null,
        type: formData.type,
        isActive: formData.isActive,
        monthlyPrice: formData.monthlyPrice,
        yearlyPrice: formData.yearlyPrice,
        trialDays: formData.trialDays,
        maxUsers: formData.maxUsers,
        maxNumbers: formData.maxNumbers,
        dailyUploadLimit: formData.dailyUploadLimit,
        monthlyCallLimit: formData.monthlyCallLimit,
        dailyCallLimit: formData.dailyCallLimit,
        storageLimit: formData.storageLimit,
        isUnlimited: formData.isUnlimited,
        featureAccess: JSON.stringify(formData.featureAccess),
      }

      let res: Response
      if (editingPlan) {
        res = await authFetch(`/api/super-admin/plans/${editingPlan.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      } else {
        res = await authFetch('/api/super-admin/plans', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Operation failed')
      }

      toast.success(
        editingPlan
          ? `Plan "${formData.name}" updated successfully`
          : `Plan "${formData.name}" created successfully`
      )
      setFormOpen(false)
      fetchPlans()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operation failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDuplicate(plan: Plan) {
    try {
      const res = await authFetch(`/api/super-admin/plans/${plan.id}/duplicate`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to duplicate')
      }
      toast.success(`Plan "${plan.name}" duplicated successfully`)
      fetchPlans()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate plan')
    }
  }

  async function handleToggleActive(plan: Plan) {
    try {
      setToggling(plan.id)
      const res = await authFetch(`/api/super-admin/plans/${plan.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !plan.isActive }),
      })
      if (!res.ok) throw new Error('Failed to toggle status')
      toast.success(`Plan "${plan.name}" ${plan.isActive ? 'archived' : 'activated'}`)
      fetchPlans()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to toggle status')
    } finally {
      setToggling(null)
    }
  }

  async function handleDelete(plan: Plan) {
    try {
      const res = await authFetch(`/api/super-admin/plans/${plan.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete')
      }
      toast.success(`Plan "${plan.name}" deleted successfully`)
      fetchPlans()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete plan')
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription Plans"
        description="Manage pricing plans and feature limits"
        icon={CreditCard}
      >
        <Button onClick={fetchPlans} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button onClick={openCreate} size="sm">
          <Plus className="size-4" />
          Create Plan
        </Button>
      </PageHeader>

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No plans yet"
          description="Create your first subscription plan to get started"
          actionLabel="Create Plan"
          onAction={openCreate}
        />
      ) : (
        /* Plan Cards Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const features = parseFeatureAccess(plan.featureAccess)
            const enabledFeatures = getEnabledFeatureCount(features)

            return (
              <Card
                key={plan.id}
                className={!plan.isActive ? 'opacity-60' : ''}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base font-semibold truncate">{plan.name}</CardTitle>
                        <PlanTypeBadge type={plan.type} />
                        {plan.isUnlimited && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800">
                            <Infinity className="size-3 mr-0.5" /> Unlimited
                          </Badge>
                        )}
                      </div>
                      <p className="text-lg font-bold">
                        {formatPrice(plan.monthlyPrice)}
                        <span className="text-xs font-normal text-muted-foreground">/mo</span>
                      </p>
                      {plan.yearlyPrice > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {formatPrice(plan.yearlyPrice)}/yr
                        </p>
                      )}
                    </div>
                    <PlanStatusBadge status={plan.isActive} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Description */}
                  {plan.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{plan.description}</p>
                  )}

                  {/* Limits */}
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="size-3.5" />
                        Max Users
                      </span>
                      <span className="font-medium">
                        {plan.maxUsers === -1 ? 'Unlimited' : plan.maxUsers === 0 ? '0' : plan.maxUsers.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="size-3.5" />
                        Calling Numbers
                      </span>
                      <span className="font-medium">
                        {plan.maxNumbers === -1 ? 'Unlimited' : plan.maxNumbers.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Upload className="size-3.5" />
                        Daily Upload
                      </span>
                      <span className="font-medium">
                        {plan.dailyUploadLimit === -1 ? 'Unlimited' : plan.dailyUploadLimit.toLocaleString('en-IN')}
                      </span>
                    </div>
                    {(plan.dailyCallLimit !== 0 || plan.monthlyCallLimit !== 0) && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="size-3.5" />
                          Daily Calls
                        </span>
                        <span className="font-medium">
                          {plan.dailyCallLimit === -1 ? 'Unlimited' : plan.dailyCallLimit === 0 ? 'No Limit' : plan.dailyCallLimit.toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                    {plan.monthlyCallLimit !== 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="size-3.5" />
                          Monthly Calls
                        </span>
                        <span className="font-medium">
                          {plan.monthlyCallLimit === -1 ? 'Unlimited' : plan.monthlyCallLimit.toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                    {plan.storageLimit !== 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <HardDrive className="size-3.5" />
                          Storage
                        </span>
                        <span className="font-medium">
                          {plan.storageLimit === -1 ? 'Unlimited' : `${plan.storageLimit.toLocaleString('en-IN')} MB`}
                        </span>
                      </div>
                    )}
                    {plan.trialDays > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="size-3.5" />
                          Trial
                        </span>
                        <span className="font-medium">{plan.trialDays} days</span>
                      </div>
                    )}
                  </div>

                  {/* Feature summary */}
                  {enabledFeatures > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                      <Sparkles className="size-3" />
                      <span>{enabledFeatures} feature{enabledFeatures > 1 ? 's' : ''} enabled</span>
                    </div>
                  )}

                  {/* Orgs count */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    <span>{plan._count.organizations} organization{plan._count.organizations !== 1 ? 's' : ''}</span>
                  </div>

                  <Separator />

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEdit(plan)}
                    >
                      <Pencil className="size-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => handleDuplicate(plan)}
                      title="Duplicate plan"
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => handleToggleActive(plan)}
                      disabled={toggling === plan.id}
                      title={plan.isActive ? 'Archive plan' : 'Activate plan'}
                    >
                      {toggling === plan.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : plan.isActive ? (
                        <ToggleRight className="size-3.5 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="size-3.5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                      onClick={() => setDeleteConfirm(plan)}
                      title="Delete plan"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ═══════════ Create / Edit Dialog ═══════════ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Edit Plan' : 'Create Plan'}</DialogTitle>
            <DialogDescription>
              {editingPlan
                ? 'Update plan details, pricing, and feature limits.'
                : 'Create a new subscription plan with pricing and limits.'}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="grid gap-5 py-2">
              {/* Name & Type */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="plan-name">Plan Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="plan-name"
                    placeholder="e.g., Business"
                    value={formData.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="plan-type">Plan Type</Label>
                  <Select value={formData.type} onValueChange={(v) => handlePlanTypeChange(v as PlanType)} modal={false}>
                    <SelectTrigger id="plan-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FREE">Free</SelectItem>
                      <SelectItem value="STARTER">Starter</SelectItem>
                      <SelectItem value="PAID">Paid</SelectItem>
                      <SelectItem value="BUSINESS">Business</SelectItem>
                      <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                      <SelectItem value="CUSTOM">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.type === 'FREE' && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Free plan is limited to 1 user. Daily call limit is set to 25 by default — you can adjust it below.
                    </p>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="grid gap-2">
                <Label htmlFor="plan-description">Description</Label>
                <Textarea
                  id="plan-description"
                  placeholder="Brief description of the plan"
                  value={formData.description}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
              </div>

              {/* Status */}
              <div className="grid gap-2">
                <Label>Status</Label>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData((f) => ({ ...f, isActive: checked }))}
                  />
                  <span className="text-sm">{formData.isActive ? 'Active' : 'Archived'}</span>
                </div>
              </div>

              <Separator />

              {/* Pricing */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Pricing</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="plan-monthly">Monthly Price (₹)</Label>
                    <Input
                      id="plan-monthly"
                      type="number"
                      placeholder="0"
                      value={formData.monthlyPrice}
                      onChange={(e) => setFormData((f) => ({ ...f, monthlyPrice: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="plan-yearly">Yearly Price (₹)</Label>
                    <Input
                      id="plan-yearly"
                      type="number"
                      placeholder="0"
                      value={formData.yearlyPrice}
                      onChange={(e) => setFormData((f) => ({ ...f, yearlyPrice: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
              </div>

              {/* Trial Days */}
              <div className="grid gap-2">
                <Label htmlFor="plan-trial">Trial Days</Label>
                <Input
                  id="plan-trial"
                  type="number"
                  placeholder="0"
                  value={formData.trialDays}
                  onChange={(e) => setFormData((f) => ({ ...f, trialDays: parseInt(e.target.value) || 0 }))}
                />
                <p className="text-xs text-muted-foreground">Number of free trial days. 0 for no trial.</p>
              </div>

              <Separator />

              {/* Unlimited Toggle */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold">Unlimited Usage</Label>
                  <p className="text-xs text-muted-foreground">When enabled, all limits are set to unlimited.</p>
                </div>
                <Switch
                  checked={formData.isUnlimited}
                  onCheckedChange={handleUnlimitedToggle}
                />
              </div>

              {/* Limits */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Usage Limits</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="plan-max-users">Max Users</Label>
                    <Input
                      id="plan-max-users"
                      type="number"
                      placeholder="10"
                      value={formData.maxUsers}
                      onChange={(e) => setFormData((f) => ({ ...f, maxUsers: parseInt(e.target.value) || 0 }))}
                      disabled={formData.isUnlimited}
                    />
                    <p className="text-xs text-muted-foreground">-1 = unlimited</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="plan-max-numbers">Calling Number Limit</Label>
                    <Input
                      id="plan-max-numbers"
                      type="number"
                      placeholder="5000"
                      value={formData.maxNumbers}
                      onChange={(e) => setFormData((f) => ({ ...f, maxNumbers: parseInt(e.target.value) || 0 }))}
                      disabled={formData.isUnlimited}
                    />
                    <p className="text-xs text-muted-foreground">-1 = unlimited</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="plan-daily-limit">Daily Upload Limit</Label>
                    <Input
                      id="plan-daily-limit"
                      type="number"
                      placeholder="500"
                      value={formData.dailyUploadLimit}
                      onChange={(e) => setFormData((f) => ({ ...f, dailyUploadLimit: parseInt(e.target.value) || 0 }))}
                      disabled={formData.isUnlimited}
                    />
                    <p className="text-xs text-muted-foreground">-1 = unlimited</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="plan-daily-calls">Daily Call Limit</Label>
                    <Input
                      id="plan-daily-calls"
                      type="number"
                      placeholder={formData.type === 'FREE' ? '25' : '0'}
                      value={formData.dailyCallLimit}
                      onChange={(e) => setFormData((f) => ({ ...f, dailyCallLimit: parseInt(e.target.value) || 0 }))}
                      disabled={formData.isUnlimited}
                    />
                    <p className="text-xs text-muted-foreground">
                      {formData.type === 'FREE'
                        ? 'Default 25 calls/day for free plan. Set your own limit.'
                        : '0 = no limit, -1 = unlimited'}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="plan-monthly-calls">Monthly Call Limit</Label>
                    <Input
                      id="plan-monthly-calls"
                      type="number"
                      placeholder="0"
                      value={formData.monthlyCallLimit}
                      onChange={(e) => setFormData((f) => ({ ...f, monthlyCallLimit: parseInt(e.target.value) || 0 }))}
                      disabled={formData.isUnlimited}
                    />
                    <p className="text-xs text-muted-foreground">0 = no limit, -1 = unlimited</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="plan-storage">Storage Limit (MB)</Label>
                    <Input
                      id="plan-storage"
                      type="number"
                      placeholder="0"
                      value={formData.storageLimit}
                      onChange={(e) => setFormData((f) => ({ ...f, storageLimit: parseInt(e.target.value) || 0 }))}
                      disabled={formData.isUnlimited}
                    />
                    <p className="text-xs text-muted-foreground">0 = no limit, -1 = unlimited</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Feature Access */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Feature Access</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {featureLabels.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                      <Label htmlFor={`feature-${key}`} className="text-sm cursor-pointer">
                        {label}
                      </Label>
                      <Switch
                        id={`feature-${key}`}
                        checked={formData.featureAccess[key]}
                        onCheckedChange={() => handleFeatureToggle(key)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
              {editingPlan ? 'Save Changes' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete Plan"
        description={`Are you sure you want to delete "${deleteConfirm?.name}"? This can only be done if no organizations are using this plan.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteConfirm) {
            handleDelete(deleteConfirm)
            setDeleteConfirm(null)
          }
        }}
      />
    </div>
  )
}
