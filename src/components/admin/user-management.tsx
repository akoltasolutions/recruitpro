'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import { 
  Users, Plus, Search, Pencil, Trash2, Power, KeyRound, 
  Phone, Mail, Loader2, UserCheck, UserX, MessageSquare, Upload, 
  ListPlus, Eye, EyeOff
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
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

interface User {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
  isActive: boolean
  avatarUrl: string | null
  callModeOn: boolean
  whatsappAccess: boolean
  uploadPermission: boolean
  createListPermission: boolean
  createdAt: string
  updatedAt: string
}

interface UserFormData {
  name: string
  email: string
  phone: string
  password: string
  callModeOn: boolean
  whatsappAccess: boolean
  uploadPermission: boolean
  createListPermission: boolean
}

const emptyForm: UserFormData = {
  name: '',
  email: '',
  phone: '',
  password: '',
  callModeOn: true,
  whatsappAccess: true,
  uploadPermission: false,
  createListPermission: false,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return generateRandomPassword()
  }
  return password
}

// ─── Component ───────────────────────────────────────────────────────────────

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Dialog states
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [formData, setFormData] = useState<UserFormData>(emptyForm)

  // Password visibility
  const [showPassword, setShowPassword] = useState(false)

  // Confirm dialog states
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null)
  const [toggleConfirm, setToggleConfirm] = useState<User | null>(null)
  const [resetConfirm, setResetConfirm] = useState<User | null>(null)

  // ─── Fetch Users ─────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      const res = await authFetch('/api/users')
      if (!res.ok) throw new Error('Failed to fetch users')
      const data = await res.json()
      setUsers(data.users || [])
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // ─── Filtered Users ──────────────────────────────────────────────────────

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })

  // ─── Form Handlers ───────────────────────────────────────────────────────

  function openCreate() {
    setEditingUser(null)
    setFormData(emptyForm)
    setShowPassword(false)
    setFormOpen(true)
  }

  function openEdit(user: User) {
    setEditingUser(user)
    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      password: '',
      callModeOn: user.callModeOn,
      whatsappAccess: user.whatsappAccess,
      uploadPermission: user.uploadPermission,
      createListPermission: user.createListPermission,
    })
    setShowPassword(false)
    setFormOpen(true)
  }

  async function handleSubmit() {
    // Validation
    if (!formData.name.trim()) {
      toast.error('Name is required')
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
    if (!editingUser && !formData.password) {
      toast.error('Password is required for new users')
      return
    }
    if (!editingUser && formData.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (editingUser && formData.password && formData.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setSubmitting(true)
    try {
      if (editingUser) {
        // ─── Update existing user ───
        const payload: Record<string, unknown> = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim() || null,
          callModeOn: formData.callModeOn,
          whatsappAccess: formData.whatsappAccess,
          uploadPermission: formData.uploadPermission,
          createListPermission: formData.createListPermission,
        }
        if (formData.password) {
          payload.password = formData.password
        }
        const res = await authFetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Update failed' }))
          throw new Error(err.message || err.error || 'Update failed')
        }
        toast.success(`User "${formData.name}" updated successfully`)
      } else {
        // ─── Create new user ───
        const payload = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim() || null,
          password: formData.password,
          callModeOn: formData.callModeOn,
          whatsappAccess: formData.whatsappAccess,
          uploadPermission: formData.uploadPermission,
          createListPermission: formData.createListPermission,
        }

        const res = await authFetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          let errorMsg = 'Failed to create user'
          try {
            const errData = await res.json()
            errorMsg = errData.error || errData.message || errorMsg
          } catch {
            // use default error message
          }
          throw new Error(errorMsg)
        }

        toast.success(`User "${formData.name}" created successfully`)
      }
      setFormOpen(false)
      fetchUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operation failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Action Handlers ─────────────────────────────────────────────────────

  async function handleDelete(user: User) {
    try {
      const res = await authFetch(`/api/users/${user.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Delete failed' }))
        throw new Error(err.message || 'Delete failed')
      }
      toast.success(`User "${user.name}" deleted successfully`)
      fetchUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete user')
    }
  }

  async function handleToggleActive(user: User) {
    try {
      const res = await authFetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user.isActive }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Toggle failed' }))
        throw new Error(err.message || 'Toggle failed')
      }
      toast.success(`User "${user.name}" ${user.isActive ? 'deactivated' : 'activated'}`)
      fetchUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to toggle user status')
    }
  }

  async function handleResetPassword(user: User) {
    const newPassword = generateRandomPassword()
    try {
      const res = await authFetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Reset failed' }))
        throw new Error(err.message || 'Reset failed')
      }
      toast.success(`Password reset for "${user.name}" to "${newPassword}"`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reset password')
    }
  }

  // ─── Badge Helpers ───────────────────────────────────────────────────────

  function StatusBadge({ active }: { active: boolean }) {
    return active ? (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
        <UserCheck className="size-3 mr-1" /> Active
      </Badge>
    ) : (
      <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:border-red-800">
        <UserX className="size-3 mr-1" /> Inactive
      </Badge>
    )
  }

  function ToggleBadge({ on, label }: { on: boolean; label: string }) {
    return on ? (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
        ON
      </Badge>
    ) : (
      <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:border-red-800">
        OFF
      </Badge>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Manage recruiters and their permissions"
        icon={Users}
      >
        <Button onClick={openCreate} size="sm">
          <Plus className="size-4" />
          Add Recruiter
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading users...</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? 'No users found' : 'No recruiters yet'}
          description={
            search
              ? 'Try adjusting your search terms'
              : 'Add your first recruiter to get started'
          }
          actionLabel={!search ? 'Add Recruiter' : undefined}
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
                  <TableHead>Status</TableHead>
                  <TableHead>Calling Mode</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Upload</TableHead>
                  <TableHead>Create List</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} className={!user.isActive ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="size-3" />
                        {user.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.phone ? (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="size-3" />
                          {user.phone}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge active={user.isActive} />
                    </TableCell>
                    <TableCell>
                      <ToggleBadge on={user.callModeOn} label="Calling" />
                    </TableCell>
                    <TableCell>
                      <ToggleBadge on={user.whatsappAccess} label="WhatsApp" />
                    </TableCell>
                    <TableCell>
                      <ToggleBadge on={user.uploadPermission} label="Upload" />
                    </TableCell>
                    <TableCell>
                      <ToggleBadge on={user.createListPermission} label="Create List" />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openEdit(user)}
                          title="Edit user"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setToggleConfirm(user)}
                          title={user.isActive ? 'Deactivate user' : 'Activate user'}
                        >
                          <Power className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setResetConfirm(user)}
                          title="Reset password"
                        >
                          <KeyRound className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                          onClick={() => setDeleteConfirm(user)}
                          title="Delete user"
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
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className={`rounded-lg border p-4 space-y-3 ${!user.isActive ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">{user.name}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="size-3" />
                      {user.email}
                    </div>
                    {user.phone && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="size-3" />
                        {user.phone}
                      </div>
                    )}
                  </div>
                  <StatusBadge active={user.isActive} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <ToggleBadge on={user.callModeOn} label="Calling" />
                  <ToggleBadge on={user.whatsappAccess} label="WhatsApp" />
                  <ToggleBadge on={user.uploadPermission} label="Upload" />
                  <ToggleBadge on={user.createListPermission} label="Create List" />
                </div>

                <div className="flex items-center gap-1 pt-2 border-t">
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-9" onClick={() => openEdit(user)}>
                    <Pencil className="size-3" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-9" onClick={() => setToggleConfirm(user)}>
                    <Power className="size-3" /> {user.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs h-9" onClick={() => setResetConfirm(user)} title="Reset password">
                    <KeyRound className="size-3" />
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs h-9 text-red-500 hover:text-red-600" onClick={() => setDeleteConfirm(user)}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═══════════ Create / Edit Dialog ═══════════ */}
      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) setShowPassword(false) }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit Recruiter' : 'Add Recruiter'}</DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Update recruiter information and permissions.'
                : 'Create a new recruiter account with the appropriate permissions.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="user-name">Name <span className="text-red-500">*</span></Label>
              <Input
                id="user-name"
                placeholder="Full name"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>

            {/* Email */}
            <div className="grid gap-2">
              <Label htmlFor="user-email">Email <span className="text-red-500">*</span></Label>
              <Input
                id="user-email"
                type="email"
                placeholder="recruiter@example.com"
                value={formData.email}
                onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            {/* Phone */}
            <div className="grid gap-2">
              <Label htmlFor="user-phone">Phone</Label>
              <Input
                id="user-phone"
                type="tel"
                placeholder="+91 98765 43210"
                value={formData.phone}
                onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>

            {/* Password with visibility toggle */}
            <div className="grid gap-2">
              <Label htmlFor="user-password">
                Password <span className="text-red-500">*</span>
                {editingUser && <span className="text-muted-foreground font-normal text-xs ml-1">(leave blank to keep current)</span>}
              </Label>
              <div className="relative">
                <Input
                  id="user-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={editingUser ? '••••••••' : 'Enter password (min 6 chars)'}
                  value={formData.password}
                  onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword
                    ? <EyeOff className="size-4" />
                    : <Eye className="size-4" />
                  }
                </button>
              </div>
              {!editingUser && formData.password && formData.password.length < 6 && (
                <p className="text-xs text-amber-600">Password must be at least 6 characters</p>
              )}
            </div>

            {/* Permission Switches */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Calling Mode</Label>
                  <p className="text-xs text-muted-foreground">Allow auto-dialer access</p>
                </div>
                <Switch
                  checked={formData.callModeOn}
                  onCheckedChange={(checked) => setFormData((f) => ({ ...f, callModeOn: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm flex items-center gap-1.5">
                    <MessageSquare className="size-3.5" /> WhatsApp Access
                  </Label>
                  <p className="text-xs text-muted-foreground">Allow WhatsApp messaging</p>
                </div>
                <Switch
                  checked={formData.whatsappAccess}
                  onCheckedChange={(checked) => setFormData((f) => ({ ...f, whatsappAccess: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm flex items-center gap-1.5">
                    <Upload className="size-3.5" /> Upload Permission
                  </Label>
                  <p className="text-xs text-muted-foreground">Allow CSV/Sheet upload</p>
                </div>
                <Switch
                  checked={formData.uploadPermission}
                  onCheckedChange={(checked) => setFormData((f) => ({ ...f, uploadPermission: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm flex items-center gap-1.5">
                    <ListPlus className="size-3.5" /> Create List Permission
                  </Label>
                  <p className="text-xs text-muted-foreground">Allow creating calling lists</p>
                </div>
                <Switch
                  checked={formData.createListPermission}
                  onCheckedChange={(checked) => setFormData((f) => ({ ...f, createListPermission: checked }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
              {editingUser ? 'Save Changes' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete Recruiter"
        description={`Are you sure you want to permanently delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteConfirm) {
            handleDelete(deleteConfirm)
            setDeleteConfirm(null)
          }
        }}
      />

      {/* Toggle Active Confirmation */}
      <ConfirmDialog
        open={!!toggleConfirm}
        onOpenChange={(open) => !open && setToggleConfirm(null)}
        title={toggleConfirm?.isActive ? 'Deactivate Recruiter' : 'Activate Recruiter'}
        description={`Are you sure you want to ${toggleConfirm?.isActive ? 'deactivate' : 'activate'} "${toggleConfirm?.name}"?`}
        confirmLabel={toggleConfirm?.isActive ? 'Deactivate' : 'Activate'}
        variant={toggleConfirm?.isActive ? 'destructive' : 'default'}
        onConfirm={() => {
          if (toggleConfirm) {
            handleToggleActive(toggleConfirm)
            setToggleConfirm(null)
          }
        }}
      />

      {/* Reset Password Confirmation */}
      <ConfirmDialog
        open={!!resetConfirm}
        onOpenChange={(open) => !open && setResetConfirm(null)}
        title="Reset Password"
        description={`Are you sure you want to reset the password for "${resetConfirm?.name}"? A random 8-character password will be generated and they will need to change it after logging in.`}
        confirmLabel="Reset Password"
        onConfirm={() => {
          if (resetConfirm) {
            handleResetPassword(resetConfirm)
            setResetConfirm(null)
          }
        }}
      />
    </div>
  )
}
