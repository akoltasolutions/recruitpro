'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Building2, Plus, Search, Pencil, Trash2, Mail, Phone, Loader2, Users,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Organization {
  id: string
  name: string
  slug: string
  email: string
  phone: string | null
  address: string | null
  plan: string
  maxUsers: number
  maxNumbers: number
  dailyUploadLimit: number
  status: string
  usersCount: number
  createdAt: string
}

interface OrgFormData {
  name: string
  slug: string
  email: string
  phone: string
  address: string
  plan: string
  maxUsers: number
  maxNumbers: number
  dailyUploadLimit: number
  status: string
}

const emptyForm: OrgFormData = {
  name: '',
  slug: '',
  email: '',
  phone: '',
  address: '',
  plan: 'Free',
  maxUsers: 0,
  maxNumbers: 0,
  dailyUploadLimit: 0,
  status: 'TRIAL',
}

// ─── Placeholder Data ────────────────────────────────────────────────────────

const placeholderOrgs: Organization[] = [
  {
    id: '1',
    name: 'TechCorp Solutions',
    slug: 'techcorp-solutions',
    email: 'admin@techcorp.com',
    phone: '+91 98765 43210',
    address: '123 Tech Park, Bangalore, KA 560001',
    plan: 'Business',
    maxUsers: 50,
    maxNumbers: 10000,
    dailyUploadLimit: 5000,
    status: 'ACTIVE',
    usersCount: 32,
    createdAt: '2025-01-15',
  },
  {
    id: '2',
    name: 'HireFast Inc.',
    slug: 'hirefast-inc',
    email: 'info@hirefast.io',
    phone: '+91 87654 32109',
    address: '456 Startup Lane, Mumbai, MH 400001',
    plan: 'Enterprise',
    maxUsers: -1,
    maxNumbers: 100000,
    dailyUploadLimit: 50000,
    status: 'ACTIVE',
    usersCount: 87,
    createdAt: '2024-11-20',
  },
  {
    id: '3',
    name: 'RecruitNow Services',
    slug: 'recruitnow-services',
    email: 'hello@recruitnow.com',
    phone: null,
    address: null,
    plan: 'Starter',
    maxUsers: 10,
    maxNumbers: 1000,
    dailyUploadLimit: 500,
    status: 'TRIAL',
    usersCount: 6,
    createdAt: '2025-03-02',
  },
  {
    id: '4',
    name: 'PeopleFirst HR',
    slug: 'peoplefirst-hr',
    email: 'contact@peoplefirst.co',
    phone: '+91 76543 21098',
    address: '789 HR Tower, Delhi, DL 110001',
    plan: 'Business',
    maxUsers: 50,
    maxNumbers: 10000,
    dailyUploadLimit: 5000,
    status: 'ACTIVE',
    usersCount: 45,
    createdAt: '2024-09-10',
  },
  {
    id: '5',
    name: 'StaffWise Agency',
    slug: 'staffwise-agency',
    email: 'ops@staffwise.com',
    phone: '+91 65432 10987',
    address: '101 Staff St, Chennai, TN 600001',
    plan: 'Free',
    maxUsers: 0,
    maxNumbers: 100,
    dailyUploadLimit: 50,
    status: 'CANCELLED',
    usersCount: 0,
    createdAt: '2025-02-28',
  },
  {
    id: '6',
    name: 'GlobalTalent Partners',
    slug: 'globaltalent-partners',
    email: 'admin@globaltalent.com',
    phone: '+91 54321 09876',
    address: '202 Global Hub, Hyderabad, TS 500001',
    plan: 'Enterprise',
    maxUsers: -1,
    maxNumbers: 100000,
    dailyUploadLimit: 50000,
    status: 'SUSPENDED',
    usersCount: 120,
    createdAt: '2024-06-15',
  },
  {
    id: '7',
    name: 'QuickHire Labs',
    slug: 'quickhire-labs',
    email: 'team@quickhire.dev',
    phone: '+91 43210 98765',
    address: '303 Dev Block, Pune, MH 411001',
    plan: 'Starter',
    maxUsers: 10,
    maxNumbers: 1000,
    dailyUploadLimit: 500,
    status: 'ACTIVE',
    usersCount: 8,
    createdAt: '2025-01-10',
  },
]

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

// ─── Component ───────────────────────────────────────────────────────────────

export function OrganizationManagement() {
  const [orgs] = useState<Organization[]>(placeholderOrgs)
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Dialog states
  const [formOpen, setFormOpen] = useState(false)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [formData, setFormData] = useState<OrgFormData>(emptyForm)

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<Organization | null>(null)

  // ─── Filtered Organizations ────────────────────────────────────────────────

  const filteredOrgs = orgs.filter((org) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return (
      org.name.toLowerCase().includes(q) ||
      org.email.toLowerCase().includes(q) ||
      org.slug.toLowerCase().includes(q)
    )
  })

  // ─── Form Handlers ───────────────────────────────────────────────────────

  function openCreate() {
    setEditingOrg(null)
    setFormData(emptyForm)
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
      plan: org.plan,
      maxUsers: org.maxUsers,
      maxNumbers: org.maxNumbers,
      dailyUploadLimit: org.dailyUploadLimit,
      status: org.status,
    })
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
      // Placeholder: simulate API call
      await new Promise((resolve) => setTimeout(resolve, 800))
      toast.success(
        editingOrg
          ? `Organization "${formData.name}" updated successfully`
          : `Organization "${formData.name}" created successfully`
      )
      setFormOpen(false)
    } catch {
      toast.error('Operation failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(org: Organization) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 500))
      toast.success(`Organization "${org.name}" deleted successfully`)
    } catch {
      toast.error('Failed to delete organization')
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
      {filteredOrgs.length === 0 ? (
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
                  <TableRow key={org.id} className={org.status === 'SUSPENDED' || org.status === 'CANCELLED' ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">{org.name}</TableCell>
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
                      <Badge variant="outline">{org.plan}</Badge>
                    </TableCell>
                    <TableCell>
                      <OrgStatusBadge status={org.status} />
                    </TableCell>
                    <TableCell className="text-right font-medium">{org.usersCount}</TableCell>
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
                className={`rounded-lg border p-4 space-y-3 ${org.status === 'SUSPENDED' || org.status === 'CANCELLED' ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">{org.name}</p>
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
                  <OrgStatusBadge status={org.status} />
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t">
                  <Badge variant="outline">{org.plan}</Badge>
                  <span className="flex items-center gap-1">
                    <Users className="size-3" />
                    {org.usersCount} users
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
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrg ? 'Edit Organization' : 'Add Organization'}</DialogTitle>
            <DialogDescription>
              {editingOrg
                ? 'Update organization details and configuration.'
                : 'Create a new organization on the platform.'}
            </DialogDescription>
          </DialogHeader>

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
              />
            </div>

            {/* Email & Phone in a row */}
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

            {/* Plan Selection */}
            <div className="grid gap-2">
              <Label htmlFor="org-plan">Subscription Plan</Label>
              <Select value={formData.plan} onValueChange={(v) => setFormData((f) => ({ ...f, plan: v }))}>
                <SelectTrigger id="org-plan">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Free">Free</SelectItem>
                  <SelectItem value="Starter">Starter</SelectItem>
                  <SelectItem value="Business">Business</SelectItem>
                  <SelectItem value="Enterprise">Enterprise</SelectItem>
                  <SelectItem value="Custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Limits in a row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="org-max-users">Max Users</Label>
                <Input
                  id="org-max-users"
                  type="number"
                  placeholder="0"
                  value={formData.maxUsers}
                  onChange={(e) => setFormData((f) => ({ ...f, maxUsers: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="org-max-numbers">Max Numbers</Label>
                <Input
                  id="org-max-numbers"
                  type="number"
                  placeholder="0"
                  value={formData.maxNumbers}
                  onChange={(e) => setFormData((f) => ({ ...f, maxNumbers: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="org-daily-limit">Daily Upload Limit</Label>
                <Input
                  id="org-daily-limit"
                  type="number"
                  placeholder="0"
                  value={formData.dailyUploadLimit}
                  onChange={(e) => setFormData((f) => ({ ...f, dailyUploadLimit: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {/* Status */}
            <div className="grid gap-2">
              <Label htmlFor="org-status">Subscription Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData((f) => ({ ...f, status: v }))}>
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
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
              {editingOrg ? 'Save Changes' : 'Create Organization'}
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
