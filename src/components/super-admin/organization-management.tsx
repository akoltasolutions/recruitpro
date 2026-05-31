'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Building2, Plus, Search, Pencil, Trash2, Mail, Phone, Loader2, Users, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { authFetch } from '@/stores/auth-store'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlanOption {
  id: string
  name: string
  type: string
  monthlyPrice: number
  yearlyPrice: number
  maxUsers: number
  isActive: boolean
}

interface Organization {
  id: string
  name: string
  slug: string
  email: string
  phone: string | null
  address: string | null
  logo: string | null
  isActive: boolean
  maxUsers: number
  maxNumbers: number
  dailyUploadLimit: number
  subscriptionPlanId: string | null
  subscriptionStatus: string
  trialEndsAt: string | null
  subscriptionStartsAt: string | null
  subscriptionEndsAt: string | null
  customMonthlyPrice: number | null
  customYearlyPrice: number | null
  customNotes: string | null
  createdAt: string
  updatedAt: string
  plan: PlanOption | null
  usersCount: number
}

interface OrgFormData {
  name: string
  slug: string
  email: string
  phone: string
  address: string
  subscriptionStatus: string
  // Plan assignment fields
  selectedPlanId: string
  customMonthlyPrice: string
  customYearlyPrice: string
  customNotes: string
}

const emptyForm: OrgFormData = {
  name: '',
  slug: '',
  email: '',
  phone: '',
  address: '',
  subscriptionStatus: 'TRIAL',
  selectedPlanId: '',
  customMonthlyPrice: '',
  customYearlyPrice: '',
  customNotes: '',
}

// ─── Badge Helpers ───────────────────────────────────────────────────────────

function OrgStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'ACTIVE':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
          Active
        </Badge>
      )
    case 'TRIAL':
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800">
          Trial
        </Badge>
      )
    case 'SUSPENDED':
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:border-red-800">
          Suspended
        </Badge>
      )
    case 'CANCELLED':
      return (
        <Badge className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
          Cancelled
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function PlanBadge({ plan }: { plan: PlanOption | null }) {
  if (!plan) {
    return <Badge variant="outline">No Plan</Badge>
  }

  const colorMap: Record<string, string> = {
    FREE: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:border-sky-800',
    PAID: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800',
    CUSTOM: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-800',
    STARTER: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800',
    BUSINESS: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-400 dark:border-teal-800',
    ENTERPRISE: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-800',
  }

  return (
    <Badge className={colorMap[plan.type] || ''}>
      {plan.name}
    </Badge>
  )
}

function formatPrice(price: number): string {
  if (price === 0) return 'Free'
  return `₹${price.toLocaleString('en-IN')}`
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OrganizationManagement() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [assigningPlan, setAssigningPlan] = useState(false)

  // Dialog states
  const [formOpen, setFormOpen] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [formData, setFormData] = useState<OrgFormData>(emptyForm)

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<Organization | null>(null)

  // Selected plan info for display
  const [selectedPlanInfo, setSelectedPlanInfo] = useState<PlanOption | null>(null)

  // ─── Fetch Data ──────────────────────────────────────────────────────────

  const fetchOrgs = useCallback(async () => {
    try {
      setLoading(true)
      const res = await authFetch('/api/super-admin/organizations')
      if (!res.ok) throw new Error('Failed to fetch organizations')
      const data = await res.json()
      setOrgs(data)
    } catch (error) {
      console.error('Failed to fetch organizations:', error)
      toast.error('Failed to load organizations')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPlans = useCallback(async () => {
    try {
      const res = await authFetch('/api/super-admin/plans')
      if (!res.ok) throw new Error('Failed to fetch plans')
      const data = await res.json()
      // Only include active plans for assignment
      setPlans(data.filter((p: PlanOption) => p.isActive))
    } catch (error) {
      console.error('Failed to fetch plans:', error)
    }
  }, [])

  useEffect(() => {
    fetchOrgs()
    fetchPlans()
  }, [fetchOrgs, fetchPlans])

  // ─── Filtered Organizations ──────────────────────────────────────────────

  const filteredOrgs = orgs.filter((org) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return (
      org.name.toLowerCase().includes(q) ||
      org.email.toLowerCase().includes(q) ||
      org.slug.toLowerCase().includes(q) ||
      (org.plan?.name || '').toLowerCase().includes(q)
    )
  })

  // ─── Form Handlers ───────────────────────────────────────────────────────

  function openCreate() {
    setEditingOrg(null)
    setFormData(emptyForm)
    setSelectedPlanInfo(null)
    setFormOpen(true)
  }

  function openEdit(org: Organization) {
    setEditingOrg(org)
    setFormData({
      name: org.name,
      slug: org.slug,
      email: org.email,
      phone: org.phone || '',
      address: org.address || '',
      subscriptionStatus: org.subscriptionStatus,
      selectedPlanId: org.subscriptionPlanId || '',
      customMonthlyPrice: org.customMonthlyPrice !== null ? String(org.customMonthlyPrice) : '',
      customYearlyPrice: org.customYearlyPrice !== null ? String(org.customYearlyPrice) : '',
      customNotes: org.customNotes || '',
    })
    setSelectedPlanInfo(org.plan)
    setFormOpen(true)
  }

  function handleNameChange(value: string) {
    const name = value
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    setFormData((f) => ({ ...f, name, slug }))
  }

  function handlePlanSelect(planId: string) {
    setFormData((f) => ({ ...f, selectedPlanId: planId }))
    const plan = plans.find((p) => p.id === planId) || null
    setSelectedPlanInfo(plan)
  }

  async function handleSubmit() {
    if (!formData.name.trim()) {
      toast.error('Organization name is required')
      return
    }
    if (!formData.email.trim()) {
      toast.error('Email is required')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error('Please enter a valid email address')
      return
    }

    setSubmitting(true)
    try {
      if (editingOrg) {
        // First update basic org info if needed (status, etc.)
        // Then assign plan if changed
        if (formData.selectedPlanId) {
          const assignPayload: Record<string, unknown> = {
            planId: formData.selectedPlanId,
          }
          if (formData.customMonthlyPrice) {
            assignPayload.customMonthlyPrice = parseFloat(formData.customMonthlyPrice)
          }
          if (formData.customYearlyPrice) {
            assignPayload.customYearlyPrice = parseFloat(formData.customYearlyPrice)
          }
          if (formData.customNotes) {
            assignPayload.customNotes = formData.customNotes
          }

          setAssigningPlan(true)
          const assignRes = await authFetch(`/api/super-admin/organizations/${editingOrg.id}/assign-plan`, {
            method: 'POST',
            body: JSON.stringify(assignPayload),
          })
          if (!assignRes.ok) {
            const err = await assignRes.json()
            throw new Error(err.error || 'Failed to assign plan')
          }
          setAssigningPlan(false)
        }

        toast.success(`Organization "${formData.name}" updated successfully`)
      } else {
        toast.success(`Organization "${formData.name}" created successfully`)
      }

      setFormOpen(false)
      fetchOrgs()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operation failed. Please try again.')
    } finally {
      setSubmitting(false)
      setAssigningPlan(false)
    }
  }

  async function handleDelete(org: Organization) {
    try {
      const res = await authFetch(`/api/super-admin/organizations/${org.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete')
      }
      toast.success(`Organization "${org.name}" deleted successfully`)
      fetchOrgs()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete organization')
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations"
        description="Manage organizations on the platform"
        icon={Building2}
      >
        <Button onClick={fetchOrgs} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button onClick={openCreate} size="sm">
          <Plus className="size-4" />
          Add Organization
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search organizations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredOrgs.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={search ? 'No organizations found' : 'No organizations yet'}
          description={
            search
              ? 'Try adjusting your search terms'
              : 'Add your first organization to get started'
          }
          actionLabel={!search ? 'Add Organization' : undefined}
          onAction={!search ? openCreate : undefined}
        />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrgs.map((org) => (
                  <TableRow key={org.id} className={org.subscriptionStatus === 'SUSPENDED' || org.subscriptionStatus === 'CANCELLED' ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {org.name}
                        {org.customMonthlyPrice !== null && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800 text-[10px] px-1.5 py-0">
                            Custom Deal
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="size-3" />
                        {org.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      {org.phone ? (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="size-3" />
                          {org.phone}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <PlanBadge plan={org.plan} />
                    </TableCell>
                    <TableCell>
                      <OrgStatusBadge status={org.subscriptionStatus} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="font-medium">{org.usersCount}</span>
                        <span className="text-xs text-muted-foreground">
                          {org.maxUsers === -1 ? '' : `/ ${org.maxUsers}`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell">
                      {new Date(org.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openEdit(org)}
                          title="Edit organization"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                          onClick={() => setDeleteConfirm(org)}
                          title="Delete organization"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {filteredOrgs.map((org) => (
              <div
                key={org.id}
                className={`rounded-lg border p-4 space-y-3 ${org.subscriptionStatus === 'SUSPENDED' || org.subscriptionStatus === 'CANCELLED' ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-sm">{org.name}</p>
                      {org.customMonthlyPrice !== null && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800 text-[10px] px-1.5 py-0">
                          Custom Deal
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="size-3" />
                      {org.email}
                    </div>
                    {org.phone && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="size-3" />
                        {org.phone}
                      </div>
                    )}
                  </div>
                  <OrgStatusBadge status={org.subscriptionStatus} />
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t">
                  <PlanBadge plan={org.plan} />
                  <span className="flex items-center gap-1">
                    <Users className="size-3" />
                    {org.usersCount}{org.maxUsers !== -1 ? ` / ${org.maxUsers}` : ''} users
                  </span>
                  <span>
                    {new Date(org.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-9" onClick={() => openEdit(org)}>
                    <Pencil className="size-3 mr-1" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-9 text-red-500 hover:text-red-600"
                    onClick={() => setDeleteConfirm(org)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═══════════ Create / Edit Dialog ═══════════ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingOrg ? 'Edit Organization' : 'Add Organization'}</DialogTitle>
            <DialogDescription>
              {editingOrg
                ? 'Update organization details and assign a subscription plan.'
                : 'Create a new organization on the platform.'}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="grid gap-4 py-2">
              {/* Name */}
              <div className="grid gap-2">
                <Label htmlFor="org-name">Organization Name <span className="text-red-500">*</span></Label>
                <Input
                  id="org-name"
                  placeholder="e.g., TechCorp Solutions"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  autoFocus
                  disabled={!!editingOrg}
                />
              </div>

              {/* Slug */}
              <div className="grid gap-2">
                <Label htmlFor="org-slug">Slug</Label>
                <Input
                  id="org-slug"
                  placeholder="techcorp-solutions"
                  value={formData.slug}
                  onChange={(e) => setFormData((f) => ({ ...f, slug: e.target.value }))}
                  className="font-mono text-sm"
                  disabled={!!editingOrg}
                />
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="org-email">Email <span className="text-red-500">*</span></Label>
                  <Input
                    id="org-email"
                    type="email"
                    placeholder="admin@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="org-phone">Phone</Label>
                  <Input
                    id="org-phone"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={formData.phone}
                    onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
              </div>

              {/* Address */}
              <div className="grid gap-2">
                <Label htmlFor="org-address">Address</Label>
                <Input
                  id="org-address"
                  placeholder="Full office address"
                  value={formData.address}
                  onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))}
                />
              </div>

              {/* Subscription Status */}
              <div className="grid gap-2">
                <Label htmlFor="org-status">Subscription Status</Label>
                <Select value={formData.subscriptionStatus} onValueChange={(v) => setFormData((f) => ({ ...f, subscriptionStatus: v }))} modal={false}>
                  <SelectTrigger id="org-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="TRIAL">Trial</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Plan Assignment (only when editing) */}
              {editingOrg && (
                <>
                  <Separator />

                  <div>
                    <h3 className="text-sm font-semibold mb-3">Plan Assignment</h3>

                    {/* Plan Selection */}
                    <div className="grid gap-2 mb-4">
                      <Label htmlFor="org-plan">Subscription Plan</Label>
                      <Select value={formData.selectedPlanId} onValueChange={handlePlanSelect} modal={false}>
                        <SelectTrigger id="org-plan">
                          <SelectValue placeholder="Select a plan" />
                        </SelectTrigger>
                        <SelectContent>
                          {plans.map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} — {formatPrice(plan.monthlyPrice)}/mo
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Plan Info Preview */}
                    {selectedPlanInfo && (
                      <div className="rounded-lg border p-3 mb-4 bg-muted/30 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Plan Type</span>
                          <span className="font-medium">{selectedPlanInfo.type}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Monthly Price</span>
                          <span className="font-medium">{formatPrice(selectedPlanInfo.monthlyPrice)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Yearly Price</span>
                          <span className="font-medium">{formatPrice(selectedPlanInfo.yearlyPrice)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Max Users</span>
                          <span className="font-medium">
                            {selectedPlanInfo.maxUsers === -1 ? 'Unlimited' : selectedPlanInfo.maxUsers}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Custom Pricing */}
                    <div className="space-y-4 rounded-lg border p-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-semibold">Custom Pricing</Label>
                        <Badge variant="outline" className="text-xs">Optional Override</Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="custom-monthly">Custom Monthly Price (₹)</Label>
                          <Input
                            id="custom-monthly"
                            type="number"
                            placeholder="Leave empty for default"
                            value={formData.customMonthlyPrice}
                            onChange={(e) => setFormData((f) => ({ ...f, customMonthlyPrice: e.target.value }))}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="custom-yearly">Custom Yearly Price (₹)</Label>
                          <Input
                            id="custom-yearly"
                            type="number"
                            placeholder="Leave empty for default"
                            value={formData.customYearlyPrice}
                            onChange={(e) => setFormData((f) => ({ ...f, customYearlyPrice: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="custom-notes">Internal Notes</Label>
                        <Textarea
                          id="custom-notes"
                          placeholder="Notes about the deal, negotiation details, etc."
                          value={formData.customNotes}
                          onChange={(e) => setFormData((f) => ({ ...f, customNotes: e.target.value }))}
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || assigningPlan}>
              {(submitting || assigningPlan) && <Loader2 className="size-4 animate-spin mr-2" />}
              {assigningPlan ? 'Assigning Plan...' : submitting ? 'Saving...' : editingOrg ? 'Save Changes' : 'Create Organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete Organization"
        description={`Are you sure you want to permanently delete "${deleteConfirm?.name}"? This will also remove all associated users and data. This action cannot be undone.`}
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
