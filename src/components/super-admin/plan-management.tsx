'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  CreditCard, Plus, Pencil, Users, Phone, Upload, Loader2, CheckCircle, XCircle,
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
import { PageHeader } from '@/components/shared/page-header'

// ─── Types ───────────────────────────────────────────────────────────────────

type PlanType = 'FREE' | 'PAID' | 'CUSTOM'
type PlanStatus = 'ACTIVE' | 'ARCHIVED'

interface Plan {
  id: string
  name: string
  type: PlanType
  price: number
  maxUsers: number
  maxNumbers: number
  dailyUploadLimit: number
  status: PlanStatus
  description: string
}

interface PlanFormData {
  name: string
  type: PlanType
  price: number
  maxUsers: number
  maxNumbers: number
  dailyUploadLimit: number
  status: PlanStatus
  description: string
}

const emptyForm: PlanFormData = {
  name: '',
  type: 'PAID',
  price: 0,
  maxUsers: 0,
  maxNumbers: 0,
  dailyUploadLimit: 0,
  status: 'ACTIVE',
  description: '',
}

// ─── Default Plans ────────────────────────────────────────────────────────────

const defaultPlans: Plan[] = [
  {
    id: '1',
    name: 'Free',
    type: 'FREE',
    price: 0,
    maxUsers: 0,
    maxNumbers: 100,
    dailyUploadLimit: 50,
    status: 'ACTIVE',
    description: 'Get started with basic features. No credit card required.',
  },
  {
    id: '2',
    name: 'Starter',
    type: 'PAID',
    price: 999,
    maxUsers: 10,
    maxNumbers: 1000,
    dailyUploadLimit: 500,
    status: 'ACTIVE',
    description: 'Perfect for small teams starting their recruitment journey.',
  },
  {
    id: '3',
    name: 'Business',
    type: 'PAID',
    price: 4999,
    maxUsers: 50,
    maxNumbers: 10000,
    dailyUploadLimit: 5000,
    status: 'ACTIVE',
    description: 'For growing organizations with larger teams.',
  },
  {
    id: '4',
    name: 'Enterprise',
    type: 'PAID',
    price: 14999,
    maxUsers: -1,
    maxNumbers: 100000,
    dailyUploadLimit: 50000,
    status: 'ACTIVE',
    description: 'Unlimited users and premium support for large enterprises.',
  },
  {
    id: '5',
    name: 'Custom',
    type: 'CUSTOM',
    price: 0,
    maxUsers: -1,
    maxNumbers: 50000,
    dailyUploadLimit: 25000,
    status: 'ACTIVE',
    description: 'Custom pricing and features tailored to your needs.',
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price === 0) return 'Free'
  return `₹${price.toLocaleString('en-IN')}/mo`
}

function PlanTypeBadge({ type }: { type: PlanType }) {
  switch (type) {
    case 'FREE':
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800">
          Free
        </Badge>
      )
    case 'PAID':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
          Paid
        </Badge>
      )
    case 'CUSTOM':
      return (
        <Badge className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800">
          Custom
        </Badge>
      )
    default:
      return <Badge variant="outline">{type}</Badge>
  }
}

function PlanStatusBadge({ status }: { status: PlanStatus }) {
  return status === 'ACTIVE' ? (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
      <CheckCircle className="size-3 mr-1" /> Active
    </Badge>
  ) : (
    <Badge className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
      <XCircle className="size-3 mr-1" /> Archived
    </Badge>
  )
}

function formatLimit(value: number, label: string): string {
  if (value <= 0) return `0 ${label}`
  if (value === -1) return `Unlimited ${label}`
  return `${value.toLocaleString('en-IN')} ${label}`
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PlanManagement() {
  const [plans] = useState<Plan[]>(defaultPlans)
  const [submitting, setSubmitting] = useState(false)

  // Dialog states
  const [formOpen, setFormOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [formData, setFormData] = useState<PlanFormData>(emptyForm)

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
      type: plan.type,
      price: plan.price,
      maxUsers: plan.maxUsers,
      maxNumbers: plan.maxNumbers,
      dailyUploadLimit: plan.dailyUploadLimit,
      status: plan.status,
      description: plan.description,
    })
    setFormOpen(true)
  }

  async function handleSubmit() {
    if (!formData.name.trim()) {
      toast.error('Plan name is required')
      return
    }

    setSubmitting(true)
    try {
      // Placeholder: simulate API call
      await new Promise((resolve) => setTimeout(resolve, 800))
      toast.success(
        editingPlan
          ? `Plan "${formData.name}" updated successfully`
          : `Plan "${formData.name}" created successfully`
      )
      setFormOpen(false)
    } catch {
      toast.error('Operation failed. Please try again.')
    } finally {
      setSubmitting(false)
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
        <Button onClick={openCreate} size="sm">
          <Plus className="size-4" />
          Create Plan
        </Button>
      </PageHeader>

      {/* Plan Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={plan.status === 'ARCHIVED' ? 'opacity-60' : ''}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold">{plan.name}</CardTitle>
                    <PlanTypeBadge type={plan.type} />
                  </div>
                  <p className="text-lg font-bold">
                    {plan.type === 'CUSTOM' ? 'Contact Sales' : formatPrice(plan.price)}
                  </p>
                </div>
                <PlanStatusBadge status={plan.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Description */}
              {plan.description && (
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              )}

              {/* Limits */}
              <div className="space-y-2.5 pt-2 border-t">
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
                    Max Numbers
                  </span>
                  <span className="font-medium">
                    {formatLimit(plan.maxNumbers, '')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Upload className="size-3.5" />
                    Daily Upload
                  </span>
                  <span className="font-medium">
                    {formatLimit(plan.dailyUploadLimit, '')}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => openEdit(plan)}
                >
                  <Pencil className="size-3.5 mr-1" />
                  Edit Plan
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ═══════════ Create / Edit Dialog ═══════════ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Edit Plan' : 'Create Plan'}</DialogTitle>
            <DialogDescription>
              {editingPlan
                ? 'Update plan details, pricing, and feature limits.'
                : 'Create a new subscription plan with pricing and limits.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Name */}
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

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="plan-description">Description</Label>
              <Input
                id="plan-description"
                placeholder="Brief description of the plan"
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Type & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="plan-type">Plan Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData((f) => ({ ...f, type: v as PlanType }))}>
                  <SelectTrigger id="plan-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FREE">Free</SelectItem>
                    <SelectItem value="PAID">Paid</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plan-status">Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData((f) => ({ ...f, status: v as PlanStatus }))}>
                  <SelectTrigger id="plan-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Price */}
            {formData.type !== 'FREE' && (
              <div className="grid gap-2">
                <Label htmlFor="plan-price">
                  Monthly Price (₹)
                  {formData.type === 'CUSTOM' && (
                    <span className="text-muted-foreground font-normal text-xs ml-1">(0 for "Contact Sales")</span>
                  )}
                </Label>
                <Input
                  id="plan-price"
                  type="number"
                  placeholder="0"
                  value={formData.price}
                  onChange={(e) => setFormData((f) => ({ ...f, price: parseInt(e.target.value) || 0 }))}
                />
              </div>
            )}

            {/* Limits */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="plan-max-users">Max Users</Label>
                <Input
                  id="plan-max-users"
                  type="number"
                  placeholder="0"
                  value={formData.maxUsers}
                  onChange={(e) => setFormData((f) => ({ ...f, maxUsers: parseInt(e.target.value) || 0 }))}
                />
                <p className="text-xs text-muted-foreground">-1 for unlimited</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plan-max-numbers">Max Numbers</Label>
                <Input
                  id="plan-max-numbers"
                  type="number"
                  placeholder="0"
                  value={formData.maxNumbers}
                  onChange={(e) => setFormData((f) => ({ ...f, maxNumbers: parseInt(e.target.value) || 0 }))}
                />
                <p className="text-xs text-muted-foreground">-1 for unlimited</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="plan-daily-limit">Daily Upload</Label>
                <Input
                  id="plan-daily-limit"
                  type="number"
                  placeholder="0"
                  value={formData.dailyUploadLimit}
                  onChange={(e) => setFormData((f) => ({ ...f, dailyUploadLimit: parseInt(e.target.value) || 0 }))}
                />
                <p className="text-xs text-muted-foreground">-1 for unlimited</p>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
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
    </div>
  )
}
