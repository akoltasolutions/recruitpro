'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { authFetch } from '@/stores/auth-store'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Announcement {
  id: string
  title: string
  content: string
  isActive: boolean
  createdAt: string
}

interface FormData {
  title: string
  content: string
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return 'recently'
  }
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function ManagementSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      {[...Array(3)].map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnnouncementsManagement() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Dialog states
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>({ title: '', content: '' })
  const [formErrors, setFormErrors] = useState<Partial<FormData>>({})

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null)

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/announcements')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setAnnouncements(data.announcements ?? [])
    } catch {
      toast.error('Failed to load announcements')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnnouncements()
  }, [fetchAnnouncements])

  // -----------------------------------------------------------------------
  // Form helpers
  // -----------------------------------------------------------------------

  const openCreateDialog = () => {
    setEditingId(null)
    setFormData({ title: '', content: '' })
    setFormErrors({})
    setFormDialogOpen(true)
  }

  const openEditDialog = (announcement: Announcement) => {
    setEditingId(announcement.id)
    setFormData({ title: announcement.title, content: announcement.content })
    setFormErrors({})
    setFormDialogOpen(true)
  }

  const validateForm = (): boolean => {
    const errors: Partial<FormData> = {}
    if (!formData.title.trim()) errors.title = 'Title is required'
    if (!formData.content.trim()) errors.content = 'Content is required'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // -----------------------------------------------------------------------
  // CRUD handlers
  // -----------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!validateForm()) return

    const isNew = !editingId
    setActionLoading(isNew ? 'create' : editingId)

    try {
      if (isNew) {
        const res = await authFetch('/api/announcements', {
          method: 'POST',
          body: JSON.stringify({
            title: formData.title.trim(),
            content: formData.content.trim(),
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to create announcement')
        }
        toast.success('Announcement created successfully')
      } else {
        const res = await authFetch(`/api/announcements/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: formData.title.trim(),
            content: formData.content.trim(),
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to update announcement')
        }
        toast.success('Announcement updated successfully')
      }

      setFormDialogOpen(false)
      fetchAnnouncements()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setActionLoading(null)
    }
  }

  const handleToggleActive = async (announcement: Announcement) => {
    setActionLoading(`toggle-${announcement.id}`)
    try {
      const res = await authFetch(`/api/announcements/${announcement.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !announcement.isActive }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to toggle announcement')
      }
      toast.success(
        announcement.isActive
          ? 'Announcement deactivated'
          : 'Announcement activated',
      )
      fetchAnnouncements()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setActionLoading(`delete-${deleteTarget.id}`)
    try {
      const res = await authFetch(`/api/announcements/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete announcement')
      }
      toast.success('Announcement deleted')
      setDeleteTarget(null)
      fetchAnnouncements()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setActionLoading(null)
    }
  }

  // -----------------------------------------------------------------------
  // Render: Loading
  // -----------------------------------------------------------------------

  if (loading) {
    return <ManagementSkeleton />
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
            <Megaphone className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Announcements
            </h2>
            <p className="text-sm text-muted-foreground">
              Manage announcements for your recruiting team
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAnnouncements}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={openCreateDialog}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="h-4 w-4" />
            Add New
          </Button>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Active
              </span>
            </div>
            <p className="text-2xl font-bold mt-1">{announcements.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                Total Shown
              </span>
            </div>
            <p className="text-2xl font-bold mt-1">{announcements.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Announcements List ─────────────────────────────────────────── */}
      {announcements.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center text-center">
            <Megaphone className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">
              No announcements yet
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first announcement to keep your team informed.
            </p>
            <Button
              className="mt-4 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={openCreateDialog}
            >
              <Plus className="h-4 w-4" />
              Create First Announcement
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {announcements.map((announcement) => {
            const isToggling = actionLoading === `toggle-${announcement.id}`
            const isEditing = actionLoading === announcement.id
            const isDeleting = actionLoading === `delete-${announcement.id}`
            const isBusy = isToggling || isEditing || isDeleting

            return (
              <Card key={announcement.id} className="overflow-hidden">
                {/* Status bar */}
                <div
                  className={`h-1 ${
                    announcement.isActive
                      ? 'bg-emerald-500'
                      : 'bg-gray-300 dark:bg-gray-700'
                  }`}
                />
                <CardContent className="p-4 sm:p-5">
                  {/* Mobile layout */}
                  <div className="space-y-3 sm:hidden">
                    {/* Title + badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {announcement.isActive ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 text-xs border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="shrink-0 text-xs"
                          >
                            Inactive
                          </Badge>
                        )}
                        <h4 className="font-semibold text-sm truncate">
                          {announcement.title}
                        </h4>
                      </div>
                    </div>

                    {/* Content */}
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-3">
                      {announcement.content}
                    </p>

                    {/* Meta */}
                    <p className="text-xs text-muted-foreground">
                      Posted {relativeTime(announcement.createdAt)}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditDialog(announcement)}
                        disabled={isBusy}
                        className="gap-1.5 flex-1"
                      >
                        {isEditing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Pencil className="h-3.5 w-3.5" />
                        )}
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant={announcement.isActive ? 'outline' : 'default'}
                        onClick={() => handleToggleActive(announcement)}
                        disabled={isBusy}
                        className={
                          announcement.isActive
                            ? 'gap-1.5 flex-1'
                            : 'gap-1.5 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white'
                        }
                      >
                        {isToggling ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : announcement.isActive ? (
                          <>
                            <EyeOff className="h-3.5 w-3.5" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            Activate
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeleteTarget(announcement)}
                        disabled={isBusy}
                        className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 border-red-200 dark:border-red-800"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden sm:flex items-start justify-between gap-4">
                    {/* Left: content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        {announcement.isActive ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                        <h4 className="font-semibold text-sm">
                          {announcement.title}
                        </h4>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-2">
                        {announcement.content}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Posted {relativeTime(announcement.createdAt)}
                      </p>
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditDialog(announcement)}
                        disabled={isBusy}
                        className="gap-1.5"
                      >
                        {isEditing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Pencil className="h-3.5 w-3.5" />
                        )}
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant={announcement.isActive ? 'outline' : 'default'}
                        onClick={() => handleToggleActive(announcement)}
                        disabled={isBusy}
                        className={
                          announcement.isActive
                            ? 'gap-1.5'
                            : 'gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white'
                        }
                      >
                        {isToggling ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : announcement.isActive ? (
                          <>
                            <EyeOff className="h-3.5 w-3.5" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            Activate
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeleteTarget(announcement)}
                        disabled={isBusy}
                        className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 border-red-200 dark:border-red-800"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Create / Edit Dialog ───────────────────────────────────────── */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Announcement' : 'New Announcement'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update the announcement details below.'
                : 'Create a new announcement for your team.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Title field */}
            <div className="space-y-2">
              <Label htmlFor="announcement-title">Title</Label>
              <Input
                id="announcement-title"
                placeholder="e.g. New calling guidelines"
                value={formData.title}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                  if (formErrors.title) {
                    setFormErrors((prev) => ({ ...prev, title: undefined }))
                  }
                }}
                className={formErrors.title ? 'border-red-500' : ''}
              />
              {formErrors.title && (
                <p className="text-xs text-red-500">{formErrors.title}</p>
              )}
            </div>

            {/* Content field */}
            <div className="space-y-2">
              <Label htmlFor="announcement-content">Content</Label>
              <Textarea
                id="announcement-content"
                placeholder="Enter the announcement content..."
                rows={5}
                value={formData.content}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, content: e.target.value }))
                  if (formErrors.content) {
                    setFormErrors((prev) => ({ ...prev, content: undefined }))
                  }
                }}
                className={formErrors.content ? 'border-red-500' : ''}
              />
              {formErrors.content && (
                <p className="text-xs text-red-500">{formErrors.content}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFormDialogOpen(false)}
              disabled={!!actionLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!!actionLoading}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {editingId ? 'Updating...' : 'Creating...'}
                </>
              ) : editingId ? (
                <>
                  <Pencil className="h-4 w-4" />
                  Update
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ────────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;
              <span className="font-medium">{deleteTarget?.title}</span>
              &rdquo;? This action cannot be undone and the announcement will be
              permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!actionLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={!!actionLoading}
              className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
            >
              {actionLoading?.startsWith('delete') ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
