'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import {
  UserCheck, Clock, Mail, Phone, CheckCircle2, XCircle,
  Loader2, Users, Eye, Trash2, UserPlus,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'

interface PendingUser {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
  createdAt: string
}

export function ApprovalRequests() {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [loading, setLoading] = useState(true)
  const [detailUser, setDetailUser] = useState<PendingUser | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [rejectConfirm, setRejectConfirm] = useState<PendingUser | null>(null)
  const [approveConfirm, setApproveConfirm] = useState<PendingUser | null>(null)

  const fetchPendingUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/users')
      if (!res.ok) throw new Error()
      const data = await res.json()
      const pending = (data.users || []).filter((u: { isActive: boolean; role: string }) => !u.isActive && u.role === 'RECRUITER')
      setPendingUsers(pending)
    } catch {
      toast.error('Failed to load pending requests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPendingUsers() }, [fetchPendingUsers])

  const handleApprove = async () => {
    if (!approveConfirm) return
    setActionLoading(true)
    try {
      const res = await authFetch(`/api/users/${approveConfirm.id}/approve`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Approval failed' }))
        throw new Error(err.message || 'Approval failed')
      }
      toast.success(`"${approveConfirm.name}" has been approved! They can now log in.`)
      setDetailOpen(false)
      setApproveConfirm(null)
      fetchPendingUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!rejectConfirm) return
    setActionLoading(true)
    try {
      const res = await authFetch(`/api/users/${rejectConfirm.id}/reject`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Rejection failed' }))
        throw new Error(err.message || 'Rejection failed')
      }
      toast.success(`Registration for "${rejectConfirm.name}" has been rejected.`)
      setRejectConfirm(null)
      fetchPendingUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reject user')
    } finally {
      setActionLoading(false)
    }
  }

  const openDetail = (user: PendingUser) => {
    setDetailUser(user)
    setDetailOpen(true)
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
          {pendingUsers.map((user) => (
            <div
              key={user.id}
              className="rounded-lg border border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-900 hover:shadow-sm transition-shadow p-4 sm:p-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex items-center justify-center h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 shrink-0">
                      <UserPlus className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{user.name}</p>
                      <Badge variant="outline" className="text-[10px] border-amber-300 dark:border-amber-700 text-amber-600">
                        PENDING APPROVAL
                      </Badge>
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
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => openDetail(user)}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" /> View
                  </Button>
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={(open) => !open && setDetailOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-amber-600" />
              Registration Details
            </DialogTitle>
            <DialogDescription>
              Review recruiter information before approving or rejecting.
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
                    <p className="font-medium">{new Date(detailUser.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Approving</strong> will activate the account and allow the recruiter to log in.
                <strong>Rejecting</strong> will deactivate the account.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
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
          if (approveConfirm) {
            handleApprove()
          }
        }}
      />

      {/* Reject Confirmation */}
      <ConfirmDialog
        open={!!rejectConfirm}
        onOpenChange={(open) => !open && setRejectConfirm(null)}
        title="Reject Registration"
        description={`Are you sure you want to reject "${rejectConfirm?.name}"? This will deactivate their account. This action cannot be undone.`}
        confirmLabel="Reject"
        variant="destructive"
        onConfirm={() => {
          if (rejectConfirm) {
            handleReject()
          }
        }}
      />
    </div>
  )
}

