'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import {
  UserCheck, Clock, Mail, Phone, CheckCircle2, XCircle,
  Loader2, Eye, UserPlus, Trash2, ShieldCheck, Ban,
  RotateCcw,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { invalidateApprovalBadgeCount } from '@/hooks/useApprovalPendingCount'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'

interface PendingUser {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
  approvalStatus: string
  isActive: boolean
  createdAt: string
}

type TabValue = 'pending' | 'rejected'

// A user is considered "pending" if:
// - approvalStatus === 'PENDING' (new model), OR
// - isActive=false AND approvalStatus='APPROVED' (legacy: column was added with default APPROVED)
function isUserPending(u: PendingUser): boolean {
  return u.approvalStatus === 'PENDING' || (!u.isActive && u.approvalStatus === 'APPROVED')
}

export function ApprovalRequests() {
  const [allUsers, setAllUsers] = useState<PendingUser[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabValue>('pending')
  const [detailUser, setDetailUser] = useState<PendingUser | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Confirm dialogs
  const [rejectConfirm, setRejectConfirm] = useState<PendingUser | null>(null)
  const [approveConfirm, setApproveConfirm] = useState<PendingUser | null>(null)
  const [forceApproveConfirm, setForceApproveConfirm] = useState<PendingUser | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<PendingUser | null>(null)

  const pendingUsers = allUsers.filter(isUserPending)
  const rejectedUsers = allUsers.filter((u) => u.approvalStatus === 'REJECTED')

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/users/pending-approvals')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAllUsers(data.users || [])
    } catch {
      toast.error('Failed to load approval requests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  // Refresh badge count whenever data changes
  useEffect(() => {
    invalidateApprovalBadgeCount()
  }, [allUsers])

  const handleAction = async (url: string, successMsg: string, errorMsg: string) => {
    setActionLoading(true)
    try {
      const res = await authFetch(url, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: errorMsg }))
        throw new Error(err.message || errorMsg)
      }
      toast.success(successMsg)
      setDetailOpen(false)
      setRejectConfirm(null)
      setApproveConfirm(null)
      setForceApproveConfirm(null)
      setDeleteConfirm(null)
      invalidateApprovalBadgeCount()
      fetchUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : errorMsg)
    } finally {
      setActionLoading(false)
    }
  }

  const handleApprove = () => {
    if (!approveConfirm) return
    handleAction(
      `/api/users/${approveConfirm.id}/approve`,
      `"${approveConfirm.name}" has been approved! They can now log in.`,
      'Approval failed'
    )
  }

  const handleReject = () => {
    if (!rejectConfirm) return
    handleAction(
      `/api/users/${rejectConfirm.id}/reject`,
      `Registration for "${rejectConfirm.name}" has been rejected.`,
      'Rejection failed'
    )
  }

  const handleForceApprove = () => {
    if (!forceApproveConfirm) return
    handleAction(
      `/api/users/${forceApproveConfirm.id}/force-approve`,
      `"${forceApproveConfirm.name}" has been force approved. The account is now active.`,
      'Force approve failed'
    )
  }

  const handleDelete = () => {
    if (!deleteConfirm) return
    handleAction(
      `/api/users/${deleteConfirm.id}/delete-permanent`,
      `"${deleteConfirm.name}" has been permanently deleted.`,
      'Delete failed'
    )
  }

  const openDetail = (user: PendingUser) => {
    setDetailUser(user)
    setDetailOpen(true)
  }

  const getStatusBadge = (user: PendingUser) => {
    if (isUserPending(user)) {
      return (
        <Badge variant="outline" className="text-[10px] border-amber-300 dark:border-amber-700 text-amber-600">
          PENDING APPROVAL
        </Badge>
      )
    }
    if (user.approvalStatus === 'REJECTED') {
      return (
        <Badge variant="outline" className="text-[10px] border-red-300 dark:border-red-700 text-red-600">
          REJECTED
        </Badge>
      )
    }
    return null
  }

  const renderUserCard = (user: PendingUser) => {
    const pending = isUserPending(user)
    return (
      <div
        key={user.id}
        className={`rounded-lg border transition-shadow p-4 sm:p-5 ${
          pending
            ? 'border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-900 hover:shadow-sm'
            : 'border-red-200 bg-red-50/30 dark:bg-red-950/10 dark:border-red-900 hover:shadow-sm'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`flex items-center justify-center h-9 w-9 rounded-full shrink-0 ${
                pending
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-600'
              }`}>
                {pending ? <UserPlus className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{user.name}</p>
                {getStatusBadge(user)}
              </div>
            </div>
            <div className="space-y-1 ml-11">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />
                <span>{user.email}</span>
              </div>
              {user.phone && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  <span>{user.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Registered {new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => openDetail(user)}
            >
              <Eye className="h-3.5 w-3.5 mr-1" /> View
            </Button>

            {pending && (
              <>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  onClick={() => setApproveConfirm(user)}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 border-red-200"
                  onClick={() => setRejectConfirm(user)}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
                  Reject
                </Button>
              </>
            )}

            {!pending && (
              <>
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                  onClick={() => setForceApproveConfirm(user)}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                  Force Approve
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              onClick={() => setDeleteConfirm(user)}
              disabled={actionLoading}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval Requests"
        description="Review and approve new recruiter registrations"
        icon={UserCheck}
      >
        {pendingUsers.length > 0 && (
          <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800 text-sm px-3 py-1">
            {pendingUsers.length} Pending
          </Badge>
        )}
      </PageHeader>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="pending" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Pending
            {pendingUsers.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-amber-500 text-white text-[10px] font-semibold px-1">
                {pendingUsers.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-1.5">
            <Ban className="h-3.5 w-3.5" />
            Rejected
            {rejectedUsers.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-red-500 text-white text-[10px] font-semibold px-1">
                {rejectedUsers.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : pendingUsers.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="No pending requests"
              description="All recruiter registrations have been reviewed. No pending approval requests."
            />
          ) : (
            <div className="space-y-3">
              {pendingUsers.map((user) => renderUserCard(user))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rejected" className="mt-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : rejectedUsers.length === 0 ? (
            <EmptyState
              icon={Ban}
              title="No rejected requests"
              description="No rejected recruiter registrations."
            />
          ) : (
            <div className="space-y-3">
              {rejectedUsers.map((user) => renderUserCard(user))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={(open) => !open && setDetailOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-amber-600" />
              Registration Details
            </DialogTitle>
            <DialogDescription>
              Review recruiter information before taking action.
            </DialogDescription>
          </DialogHeader>
          {detailUser && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Full Name</p>
                    <p className="font-medium">{detailUser.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium truncate">{detailUser.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="font-medium">{detailUser.phone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Registered</p>
                    <p className="font-medium">{new Date(detailUser.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <div className="mt-0.5">{getStatusBadge(detailUser)}</div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {isUserPending(detailUser) ? (
                  <>
                    <strong>Approving</strong> will activate the account and allow the recruiter to log in.
                    <strong> Rejecting</strong> will mark the registration as rejected.
                  </>
                ) : (
                  <>
                    <strong>Force Approving</strong> will override the rejection and activate the account.
                    <strong> Deleting</strong> will permanently remove this request.
                  </>
                )}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 flex-wrap">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
            {detailUser && isUserPending(detailUser) && (
              <>
                <Button
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 border-red-200"
                  onClick={() => { setDetailOpen(false); setRejectConfirm(detailUser) }}
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Reject
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => { setDetailOpen(false); setApproveConfirm(detailUser) }}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                  Approve
                </Button>
              </>
            )}
            {detailUser && !isUserPending(detailUser) && (
              <>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => { setDetailOpen(false); setForceApproveConfirm(detailUser) }}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}
                  Force Approve
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Approve Confirmation */}
      <ConfirmDialog
        open={!!approveConfirm}
        onOpenChange={(open) => !open && setApproveConfirm(null)}
        title="Approve Registration"
        description={`Are you sure you want to approve "${approveConfirm?.name}"? They will be able to log in and access the recruiting tools.`}
        confirmLabel="Approve"
        variant="default"
        onConfirm={() => {
          if (approveConfirm) handleApprove()
        }}
      />

      {/* Reject Confirmation */}
      <ConfirmDialog
        open={!!rejectConfirm}
        onOpenChange={(open) => !open && setRejectConfirm(null)}
        title="Reject Registration"
        description={`Are you sure you want to reject "${rejectConfirm?.name}"? This will mark the registration as rejected. You can still force approve it later if needed.`}
        confirmLabel="Reject"
        variant="destructive"
        onConfirm={() => {
          if (rejectConfirm) handleReject()
        }}
      />

      {/* Force Approve Confirmation */}
      <ConfirmDialog
        open={!!forceApproveConfirm}
        onOpenChange={(open) => !open && setForceApproveConfirm(null)}
        title="Force Approve Registration"
        description={`Are you sure you want to force approve "${forceApproveConfirm?.name}"? This will override the previous rejection and activate the account.`}
        confirmLabel="Force Approve"
        variant="default"
        onConfirm={() => {
          if (forceApproveConfirm) handleForceApprove()
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete Permanently"
        description={`Are you sure you want to permanently delete the registration for "${deleteConfirm?.name}"? This action cannot be undone. The request will be removed from all views.`}
        confirmLabel="Delete Permanently"
        variant="destructive"
        onConfirm={() => {
          if (deleteConfirm) handleDelete()
        }}
      />
    </div>
  )
}
