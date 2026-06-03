'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Users, UserPlus, Search, Pencil, Trash2, Mail, Phone, MailCheck,
  Loader2, UserCheck, UserX, Briefcase, Building, MoreHorizontal,
  Send, XCircle, Clock, BadgeCheck, Plus, Power, Shield, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'

// ─── Mock Types ──────────────────────────────────────────────────────────────

interface TeamMember {
  id: string
  name: string
  email: string
  phone: string | null
  designation: string
  department: string
  role: string
  status: 'active' | 'inactive'
  joinedDate: string
}

interface PendingInvitation {
  id: string
  email: string
  role: string
  designation: string
  department: string
  invitedDate: string
  status: 'pending' | 'expired'
}

interface Designation {
  id: string
  name: string
  isActive: boolean
  memberCount: number
}

interface Department {
  id: string
  name: string
  description: string
  headName: string
  memberCount: number
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const mockMembers: TeamMember[] = [
  { id: 'm1', name: 'Arjun Mehta', email: 'arjun@akolta.com', phone: '+91 98765 43210', designation: 'Senior Recruiter', department: 'Talent Acquisition', role: 'USER', status: 'active', joinedDate: '2024-08-15' },
  { id: 'm2', name: 'Priya Sharma', email: 'priya@akolta.com', phone: '+91 98765 43211', designation: 'Team Lead', department: 'Talent Acquisition', role: 'ORG_ADMIN', status: 'active', joinedDate: '2024-06-01' },
  { id: 'm3', name: 'Rahul Verma', email: 'rahul@akolta.com', phone: '+91 98765 43212', designation: 'Junior Recruiter', department: 'Sourcing', role: 'USER', status: 'active', joinedDate: '2024-10-20' },
  { id: 'm4', name: 'Sneha Gupta', email: 'sneha@akolta.com', phone: '+91 98765 43213', designation: 'Recruiter', department: 'Campus Hiring', role: 'USER', status: 'inactive', joinedDate: '2024-07-10' },
  { id: 'm5', name: 'Vikram Singh', email: 'vikram@akolta.com', phone: '+91 98765 43214', designation: 'Senior Recruiter', department: 'Sourcing', role: 'USER', status: 'active', joinedDate: '2024-09-05' },
  { id: 'm6', name: 'Anita Desai', email: 'anita@akolta.com', phone: '+91 98765 43215', designation: 'Team Lead', department: 'Campus Hiring', role: 'USER', status: 'active', joinedDate: '2024-05-22' },
]

const mockInvitations: PendingInvitation[] = [
  { id: 'inv1', email: 'new.recruiter@example.com', role: 'USER', designation: 'Junior Recruiter', department: 'Sourcing', invitedDate: '2025-01-10', status: 'pending' },
  { id: 'inv2', email: 'lead.hiring@example.com', role: 'ORG_ADMIN', designation: 'Team Lead', department: 'Talent Acquisition', invitedDate: '2025-01-08', status: 'pending' },
  { id: 'inv3', email: 'old.invite@example.com', role: 'USER', designation: 'Recruiter', department: 'Campus Hiring', invitedDate: '2024-12-01', status: 'expired' },
]

const mockDesignations: Designation[] = [
  { id: 'd1', name: 'Senior Recruiter', isActive: true, memberCount: 2 },
  { id: 'd2', name: 'Team Lead', isActive: true, memberCount: 2 },
  { id: 'd3', name: 'Junior Recruiter', isActive: true, memberCount: 1 },
  { id: 'd4', name: 'Recruiter', isActive: true, memberCount: 1 },
  { id: 'd5', name: 'Intern', isActive: false, memberCount: 0 },
]

const mockDepartments: Department[] = [
  { id: 'dep1', name: 'Talent Acquisition', description: 'Core recruitment team for experienced hires', headName: 'Priya Sharma', memberCount: 2 },
  { id: 'dep2', name: 'Sourcing', description: 'Candidate sourcing and pipeline building', headName: 'Vikram Singh', memberCount: 2 },
  { id: 'dep3', name: 'Campus Hiring', description: 'University and campus recruitment programs', headName: 'Anita Desai', memberCount: 2 },
]

// ─── Component ─────────────────────────────────────────────────────────────

export function TeamManagementEnhanced() {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('members')

  // Invite dialog state
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteSubmitting, setInviteSubmitting] = useState(false)
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'USER',
    designation: '',
    department: '',
  })

  // Designation dialog state
  const [desigDialogOpen, setDesigDialogOpen] = useState(false)
  const [editingDesig, setEditingDesig] = useState<Designation | null>(null)
  const [desigName, setDesigName] = useState('')
  const [desigActive, setDesigActive] = useState(true)
  const [desigSubmitting, setDesigSubmitting] = useState(false)
  const [desigDeleteConfirm, setDesigDeleteConfirm] = useState<Designation | null>(null)

  // Department dialog state
  const [deptDialogOpen, setDeptDialogOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [deptForm, setDeptForm] = useState({ name: '', description: '', headName: '' })
  const [deptSubmitting, setDeptSubmitting] = useState(false)
  const [deptDeleteConfirm, setDeptDeleteConfirm] = useState<Department | null>(null)

  // Revoke invitation state
  const [revokeConfirm, setRevokeConfirm] = useState<PendingInvitation | null>(null)

  // Ref element for department dialog content (used to contain Select portal within dialog)
  const [deptDialogEl, setDeptDialogEl] = useState<HTMLDivElement | null>(null)

  // ─── Members (placeholder state) ──────────────────────────────────────────
  const [invitations, setInvitations] = useState<PendingInvitation[]>(mockInvitations)
  const [designations, setDesignations] = useState<Designation[]>(mockDesignations)
  const [departments, setDepartments] = useState<Department[]>(mockDepartments)

  // ─── Member state (declared before filteredMembers to avoid TDZ) ──────────
  const [members, setMembers] = useState<TeamMember[]>(mockMembers)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [memberDialogOpen, setMemberDialogOpen] = useState(false)
  const [memberForm, setMemberForm] = useState({ name: '', email: '', phone: '', designation: '', department: '', role: 'USER' })

  // ─── Filtered Members ────────────────────────────────────────────────────

  const filteredMembers = members.filter((m) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return (
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.designation.toLowerCase().includes(q) ||
      m.department.toLowerCase().includes(q)
    )
  })

  // ─── Invite Handlers ─────────────────────────────────────────────────────

  function openInviteDialog() {
    setInviteForm({ email: '', role: 'USER', designation: '', department: '' })
    setInviteOpen(true)
  }

  async function handleInvite() {
    if (!inviteForm.email.trim()) {
      toast.error('Email is required')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteForm.email)) {
      toast.error('Please enter a valid email address')
      return
    }
    if (!inviteForm.designation) {
      toast.error('Please select a designation')
      return
    }
    if (!inviteForm.department) {
      toast.error('Please select a department')
      return
    }

    setInviteSubmitting(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const newInvitation: PendingInvitation = {
      id: `inv-${Date.now()}`,
      email: inviteForm.email,
      role: inviteForm.role,
      designation: inviteForm.designation,
      department: inviteForm.department,
      invitedDate: new Date().toISOString().split('T')[0],
      status: 'pending',
    }
    setInvitations((prev) => [newInvitation, ...prev])
    setInviteOpen(false)
    toast.success(`Invitation sent to ${inviteForm.email}`)
    setInviteSubmitting(false)
  }

  function handleRevoke(invitation: PendingInvitation) {
    setInvitations((prev) => prev.filter((inv) => inv.id !== invitation.id))
    toast.success(`Invitation to ${invitation.email} revoked`)
    setRevokeConfirm(null)
  }

  // ─── Designation Handlers ───────────────────────────────────────────────

  function openAddDesigDialog() {
    setEditingDesig(null)
    setDesigName('')
    setDesigActive(true)
    setDesigDialogOpen(true)
  }

  function openEditDesigDialog(desig: Designation) {
    setEditingDesig(desig)
    setDesigName(desig.name)
    setDesigActive(desig.isActive)
    setDesigDialogOpen(true)
  }

  async function handleSaveDesig() {
    if (!desigName.trim()) {
      toast.error('Designation name is required')
      return
    }
    setDesigSubmitting(true)
    await new Promise((resolve) => setTimeout(resolve, 500))

    if (editingDesig) {
      setDesignations((prev) =>
        prev.map((d) => (d.id === editingDesig.id ? { ...d, name: desigName.trim(), isActive: desigActive } : d))
      )
      toast.success(`Designation "${desigName.trim()}" updated`)
    } else {
      const newDesig: Designation = {
        id: `d-${Date.now()}`,
        name: desigName.trim(),
        isActive: desigActive,
        memberCount: 0,
      }
      setDesignations((prev) => [...prev, newDesig])
      toast.success(`Designation "${desigName.trim()}" added`)
    }
    setDesigDialogOpen(false)
    setDesigSubmitting(false)
  }

  function handleDeleteDesig(desig: Designation) {
    setDesignations((prev) => prev.filter((d) => d.id !== desig.id))
    toast.success(`Designation "${desig.name}" deleted`)
    setDesigDeleteConfirm(null)
  }

  // ─── Department Handlers ─────────────────────────────────────────────────

  function openAddDeptDialog() {
    setEditingDept(null)
    setDeptForm({ name: '', description: '', headName: '' })
    setDeptDialogOpen(true)
  }

  function openEditDeptDialog(dept: Department) {
    setEditingDept(dept)
    setDeptForm({ name: dept.name, description: dept.description, headName: dept.headName })
    setDeptDialogOpen(true)
  }

  async function handleSaveDept() {
    if (!deptForm.name.trim()) {
      toast.error('Department name is required')
      return
    }
    setDeptSubmitting(true)
    await new Promise((resolve) => setTimeout(resolve, 500))

    if (editingDept) {
      setDepartments((prev) =>
        prev.map((d) => (d.id === editingDept.id ? { ...d, ...deptForm } : d))
      )
      toast.success(`Department "${deptForm.name.trim()}" updated`)
    } else {
      const newDept: Department = {
        id: `dep-${Date.now()}`,
        name: deptForm.name.trim(),
        description: deptForm.description.trim(),
        headName: deptForm.headName.trim(),
        memberCount: 0,
      }
      setDepartments((prev) => [...prev, newDept])
      toast.success(`Department "${deptForm.name.trim()}" added`)
    }
    setDeptDialogOpen(false)
    setDeptSubmitting(false)
  }

  function handleDeleteDept(dept: Department) {
    toast.success(`Department "${dept.name}" deleted`)
    setDeptDeleteConfirm(null)
  }

  // ─── Member Actions ────────────────────────────────────────────────────────

  function openEditMemberDialog(member: TeamMember) {
    setEditingMember(member)
    setMemberForm({
      name: member.name,
      email: member.email,
      phone: member.phone || '',
      designation: member.designation,
      department: member.department,
      role: member.role,
    })
    setMemberDialogOpen(true)
  }

  async function handleSaveMember() {
    if (!memberForm.name.trim() || !memberForm.email.trim()) {
      toast.error('Name and email are required')
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
    setMembers((prev) =>
      prev.map((m) =>
        m.id === editingMember?.id
          ? { ...m, ...memberForm, phone: memberForm.phone || null }
          : m,
      ),
    )
    toast.success(`Member "${memberForm.name.trim()}" updated`)
    setMemberDialogOpen(false)
    setEditingMember(null)
  }

  function handleToggleMemberStatus(member: TeamMember) {
    const newStatus = member.status === 'active' ? 'inactive' : 'active'
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, status: newStatus } : m)),
    )
    toast.success(`${member.name} is now ${newStatus}`)
  }

  function handleRemoveMember(member: TeamMember) {
    setMembers((prev) => prev.filter((m) => m.id !== member.id))
    toast.success(`${member.name} has been removed`)
  }

  function handleToggleMemberRole(member: TeamMember) {
    const newRole = member.role === 'ORG_ADMIN' ? 'USER' : 'ORG_ADMIN'
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m)),
    )
    toast.success(`${member.name} is now ${newRole === 'ORG_ADMIN' ? 'Admin' : 'Member'}`)
  }

  // ─── Badge Helpers ────────────────────────────────────────────────────────

  function StatusBadge({ status }: { status: 'active' | 'inactive' }) {
    return status === 'active' ? (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
        <UserCheck className="size-3 mr-1" /> Active
      </Badge>
    ) : (
      <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:border-red-800">
        <UserX className="size-3 mr-1" /> Inactive
      </Badge>
    )
  }

  function RoleBadge({ role }: { role: string }) {
    return role === 'ORG_ADMIN' ? (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800">
        Admin
      </Badge>
    ) : (
      <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
        Member
      </Badge>
    )
  }

  function InvitationStatusBadge({ status }: { status: 'pending' | 'expired' }) {
    return status === 'pending' ? (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800">
        <Clock className="size-3 mr-1" /> Pending
      </Badge>
    ) : (
      <Badge className="bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
        <XCircle className="size-3 mr-1" /> Expired
      </Badge>
    )
  }

  // ─── Member Actions Dropdown ──────────────────────────────────────────────

  function MemberActionsDropdown({ member }: { member: TeamMember }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
          >
            <MoreHorizontal className="size-3.5" />
            <span className="sr-only">Actions for {member.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-xs font-medium">
            {member.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openEditMemberDialog(member)}>
            <Eye className="size-3.5 mr-2" />
            View / Edit Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleToggleMemberRole(member)}>
            <Shield className="size-3.5 mr-2" />
            {member.role === 'ORG_ADMIN' ? 'Remove Admin Role' : 'Make Admin'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleToggleMemberStatus(member)}>
            <Power className="size-3.5 mr-2" />
            {member.status === 'active' ? 'Deactivate Member' : 'Activate Member'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-600 focus:text-red-600"
            onClick={() => handleRemoveMember(member)}
          >
            <Trash2 className="size-3.5 mr-2" />
            Remove Member
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Management"
        description="Manage your organization's team members, designations, and departments"
        icon={Users}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="members" className="gap-1.5">
            <Users className="size-3.5" />
            Members
          </TabsTrigger>
          <TabsTrigger value="invites" className="gap-1.5">
            <MailCheck className="size-3.5" />
            Invites
            {invitations.filter((i) => i.status === 'pending').length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                {invitations.filter((i) => i.status === 'pending').length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="designations" className="gap-1.5">
            <Briefcase className="size-3.5" />
            Designations
          </TabsTrigger>
          <TabsTrigger value="departments" className="gap-1.5">
            <Building className="size-3.5" />
            Departments
          </TabsTrigger>
        </TabsList>

        {/* ═══════════ Members Tab ═══════════ */}
        <TabsContent value="members">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search members..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button onClick={openInviteDialog} size="sm">
                <UserPlus className="size-4" />
                Invite Member
              </Button>
            </div>

            {filteredMembers.length === 0 ? (
              <EmptyState
                icon={Users}
                title={search ? 'No members found' : 'No team members yet'}
                description={
                  search
                    ? 'Try adjusting your search terms'
                    : 'Invite your first team member to get started'
                }
                actionLabel={!search ? 'Invite Member' : undefined}
                onAction={!search ? openInviteDialog : undefined}
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
                        <TableHead>Designation</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMembers.map((member) => (
                        <TableRow key={member.id} className={member.status === 'inactive' ? 'opacity-60' : ''}>
                          <TableCell className="font-medium">{member.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Mail className="size-3" />
                              {member.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            {member.phone ? (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Phone className="size-3" />
                                {member.phone}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>{member.designation}</TableCell>
                          <TableCell>{member.department}</TableCell>
                          <TableCell><RoleBadge role={member.role} /></TableCell>
                          <TableCell><StatusBadge status={member.status} /></TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {new Date(member.joinedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </TableCell>
                          <TableCell className="text-right">
                            <MemberActionsDropdown member={member} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                  {filteredMembers.map((member) => (
                    <div
                      key={member.id}
                      className={`rounded-lg border p-4 space-y-3 ${member.status === 'inactive' ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <p className="font-medium text-sm">{member.name}</p>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Mail className="size-3" />
                            {member.email}
                          </div>
                          {member.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Phone className="size-3" />
                              {member.phone}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <RoleBadge role={member.role} />
                          <StatusBadge status={member.status} />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">{member.designation}</Badge>
                        <Badge variant="outline" className="text-xs">{member.department}</Badge>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
                        <span>Joined {new Date(member.joinedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        <MemberActionsDropdown member={member} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* ═══════════ Invites Tab ═══════════ */}
        <TabsContent value="invites">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {invitations.filter((i) => i.status === 'pending').length} pending invitation(s)
              </p>
              <Button onClick={openInviteDialog} size="sm">
                <UserPlus className="size-4" />
                Invite Member
              </Button>
            </div>

            {invitations.length === 0 ? (
              <EmptyState
                icon={MailCheck}
                title="No invitations"
                description="Invite new members to join your organization"
                actionLabel="Invite Member"
                onAction={openInviteDialog}
              />
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Designation</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Invited Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitations.map((inv) => (
                        <TableRow key={inv.id} className={inv.status === 'expired' ? 'opacity-60' : ''}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Mail className="size-3 text-muted-foreground" />
                              {inv.email}
                            </div>
                          </TableCell>
                          <TableCell><RoleBadge role={inv.role} /></TableCell>
                          <TableCell>{inv.designation}</TableCell>
                          <TableCell>{inv.department}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {new Date(inv.invitedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </TableCell>
                          <TableCell><InvitationStatusBadge status={inv.status} /></TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 text-xs"
                              onClick={() => inv.status === 'pending' && setRevokeConfirm(inv)}
                              disabled={inv.status === 'expired'}
                            >
                              <XCircle className="size-3.5 mr-1" />
                              Revoke
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                  {invitations.map((inv) => (
                    <div
                      key={inv.id}
                      className={`rounded-lg border p-4 space-y-3 ${inv.status === 'expired' ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <p className="font-medium text-sm">{inv.email}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>Invited {new Date(inv.invitedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                        </div>
                        <InvitationStatusBadge status={inv.status} />
                      </div>
                      <div className="flex items-center gap-2">
                        <RoleBadge role={inv.role} />
                        <Badge variant="outline" className="text-xs">{inv.designation}</Badge>
                        <Badge variant="outline" className="text-xs">{inv.department}</Badge>
                      </div>
                      {inv.status === 'pending' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 text-xs"
                          onClick={() => setRevokeConfirm(inv)}
                        >
                          <XCircle className="size-3 mr-1" />
                          Revoke Invitation
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* ═══════════ Designations Tab ═══════════ */}
        <TabsContent value="designations">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {designations.length} designation(s) configured
              </p>
              <Button onClick={openAddDesigDialog} size="sm">
                <Plus className="size-4" />
                Add Designation
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {designations.map((desig) => (
                <Card key={desig.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{desig.name}</p>
                        <p className="text-xs text-muted-foreground">{desig.memberCount} member(s)</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Switch
                          checked={desig.isActive}
                          onCheckedChange={(checked) => {
                            setDesignations((prev) =>
                              prev.map((d) => (d.id === desig.id ? { ...d, isActive: checked } : d))
                            )
                            toast.success(`Designation "${desig.name}" ${checked ? 'activated' : 'deactivated'}`)
                          }}
                          className="scale-90"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-3 pt-3 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 text-xs h-8"
                        onClick={() => openEditDesigDialog(desig)}
                      >
                        <Pencil className="size-3 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                        onClick={() => setDesigDeleteConfirm(desig)}
                        disabled={desig.memberCount > 0}
                      >
                        <Trash2 className="size-3 mr-1" /> Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ═══════════ Departments Tab ═══════════ */}
        <TabsContent value="departments">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {departments.length} department(s)
              </p>
              <Button onClick={openAddDeptDialog} size="sm">
                <Plus className="size-4" />
                Add Department
              </Button>
            </div>

            {departments.length === 0 ? (
              <EmptyState
                icon={Building}
                title="No departments"
                description="Create your first department to organize your team"
                actionLabel="Add Department"
                onAction={openAddDeptDialog}
              />
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Department</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Head</TableHead>
                        <TableHead>Members</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {departments.map((dept) => (
                        <TableRow key={dept.id}>
                          <TableCell className="font-medium">{dept.name}</TableCell>
                          <TableCell className="text-muted-foreground max-w-xs truncate">{dept.description}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <BadgeCheck className="size-3 text-emerald-600" />
                              {dept.headName}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{dept.memberCount}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() => openEditDeptDialog(dept)}
                                title="Edit department"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                                onClick={() => setDeptDeleteConfirm(dept)}
                                title="Delete department"
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
                  {departments.map((dept) => (
                    <div key={dept.id} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <p className="font-medium text-sm">{dept.name}</p>
                          <p className="text-xs text-muted-foreground">{dept.description}</p>
                        </div>
                        <Badge variant="outline">{dept.memberCount} members</Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <BadgeCheck className="size-3 text-emerald-600" />
                        Head: {dept.headName}
                      </div>
                      <div className="flex items-center gap-1 pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs h-9"
                          onClick={() => openEditDeptDialog(dept)}
                        >
                          <Pencil className="size-3 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-9 text-red-500 hover:text-red-600"
                          onClick={() => setDeptDeleteConfirm(dept)}
                        >
                          <Trash2 className="size-3 mr-1" /> Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ═══════════ Invite Member Dialog ═══════════ */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation to add a new member to your organization.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="invite-email">
                Email Address <span className="text-red-500">*</span>
              </Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="member@example.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteForm.role}
                onValueChange={(value) => setInviteForm((f) => ({ ...f, role: value }))}
                modal={false}
              >
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="USER">Team Member</SelectItem>
                  <SelectItem value="ORG_ADMIN">Organization Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="invite-designation">Designation</Label>
              <Select
                value={inviteForm.designation}
                onValueChange={(value) => setInviteForm((f) => ({ ...f, designation: value }))}
                modal={false}
              >
                <SelectTrigger id="invite-designation" className="w-full">
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {designations.filter((d) => d.isActive).map((d) => (
                    <SelectItem key={d.id} value={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="invite-department">Department</Label>
              <Select
                value={inviteForm.department}
                onValueChange={(value) => setInviteForm((f) => ({ ...f, department: value }))}
                modal={false}
              >
                <SelectTrigger id="invite-department" className="w-full">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviteSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={inviteSubmitting}>
              {inviteSubmitting ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Send className="size-4 mr-2" />
              )}
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Edit Member Dialog ═══════════ */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
            <DialogDescription>
              Update member details. Changes will take effect immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="member-name">Name <span className="text-red-500">*</span></Label>
              <Input
                id="member-name"
                value={memberForm.name}
                onChange={(e) => setMemberForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="member-email">Email <span className="text-red-500">*</span></Label>
              <Input
                id="member-email"
                type="email"
                value={memberForm.email}
                onChange={(e) => setMemberForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="member-phone">Phone</Label>
              <Input
                id="member-phone"
                value={memberForm.phone}
                onChange={(e) => setMemberForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+91 98765 43210"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="member-role">Role</Label>
              <Select
                value={memberForm.role}
                onValueChange={(value) => setMemberForm((f) => ({ ...f, role: value }))}
                modal={false}
              >
                <SelectTrigger id="member-role" className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="USER">Team Member</SelectItem>
                  <SelectItem value="ORG_ADMIN">Organization Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="member-designation">Designation</Label>
              <Select
                value={memberForm.designation}
                onValueChange={(value) => setMemberForm((f) => ({ ...f, designation: value }))}
                modal={false}
              >
                <SelectTrigger id="member-designation" className="w-full">
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {designations.filter((d) => d.isActive).map((d) => (
                    <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="member-department">Department</Label>
              <Select
                value={memberForm.department}
                onValueChange={(value) => setMemberForm((f) => ({ ...f, department: value }))}
                modal={false}
              >
                <SelectTrigger id="member-department" className="w-full">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setMemberDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveMember}>
              <Pencil className="size-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Designation Dialog ═══════════ */}
      <Dialog open={desigDialogOpen} onOpenChange={setDesigDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingDesig ? 'Edit Designation' : 'Add Designation'}</DialogTitle>
            <DialogDescription>
              {editingDesig ? 'Update the designation details.' : 'Create a new designation for your team.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="desig-name">
                Designation Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="desig-name"
                placeholder="e.g., Senior Recruiter"
                value={desigName}
                onChange={(e) => setDesigName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">Active</Label>
                <p className="text-xs text-muted-foreground">Available for new members</p>
              </div>
              <Switch
                checked={desigActive}
                onCheckedChange={setDesigActive}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDesigDialogOpen(false)} disabled={desigSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSaveDesig} disabled={desigSubmitting}>
              {desigSubmitting && <Loader2 className="size-4 animate-spin mr-2" />}
              {editingDesig ? 'Save Changes' : 'Add Designation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Department Dialog ═══════════ */}
      <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
        <DialogContent className="sm:max-w-md" ref={setDeptDialogEl}>
          <DialogHeader>
            <DialogTitle>{editingDept ? 'Edit Department' : 'Add Department'}</DialogTitle>
            <DialogDescription>
              {editingDept ? 'Update the department details.' : 'Create a new department for your organization.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 min-w-0">
            <div className="grid gap-2">
              <Label htmlFor="dept-name">
                Department Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="dept-name"
                placeholder="e.g., Talent Acquisition"
                value={deptForm.name}
                onChange={(e) => setDeptForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="dept-description">Description</Label>
              <Input
                id="dept-description"
                placeholder="Brief description of the department"
                value={deptForm.description}
                onChange={(e) => setDeptForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="dept-head">Department Head</Label>
              <Select
                value={deptForm.headName}
                onValueChange={(value) => setDeptForm((f) => ({ ...f, headName: value }))}
                modal={false}
              >
                <SelectTrigger id="dept-head" className="w-full min-w-0">
                  <SelectValue placeholder="Select department head" />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-60" container={deptDialogEl}>
                  {members.filter((m) => m.status === 'active').map((m) => (
                    <SelectItem key={m.id} value={m.name}>
                      {m.name} — {m.designation}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDeptDialogOpen(false)} disabled={deptSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSaveDept} disabled={deptSubmitting}>
              {deptSubmitting && <Loader2 className="size-4 animate-spin mr-2" />}
              {editingDept ? 'Save Changes' : 'Add Department'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Confirmation Dialogs ═══════════ */}
      <ConfirmDialog
        open={!!revokeConfirm}
        onOpenChange={(open) => !open && setRevokeConfirm(null)}
        title="Revoke Invitation"
        description={`Are you sure you want to revoke the invitation sent to "${revokeConfirm?.email}"? They will no longer be able to join using this invitation.`}
        confirmLabel="Revoke"
        variant="destructive"
        onConfirm={() => {
          if (revokeConfirm) handleRevoke(revokeConfirm)
        }}
      />

      <ConfirmDialog
        open={!!desigDeleteConfirm}
        onOpenChange={(open) => !open && setDesigDeleteConfirm(null)}
        title="Delete Designation"
        description={`Are you sure you want to delete "${desigDeleteConfirm?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (desigDeleteConfirm) handleDeleteDesig(desigDeleteConfirm)
        }}
      />

      <ConfirmDialog
        open={!!deptDeleteConfirm}
        onOpenChange={(open) => !open && setDeptDeleteConfirm(null)}
        title="Delete Department"
        description={`Are you sure you want to delete "${deptDeleteConfirm?.name}"? All members will be unassigned from this department.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deptDeleteConfirm) handleDeleteDept(deptDeleteConfirm)
        }}
      />
    </div>
  )
}
