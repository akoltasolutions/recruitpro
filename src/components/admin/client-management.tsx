'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import { Building2, Plus, Pencil, Trash2, Loader2, Power } from 'lucide-react'
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

interface Client {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ClientManagement() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Dialog states
  const [formOpen, setFormOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [clientName, setClientName] = useState('')

  // Confirm dialog states
  const [deleteConfirm, setDeleteConfirm] = useState<Client | null>(null)
  const [toggleConfirm, setToggleConfirm] = useState<Client | null>(null)

  // ─── Fetch Clients ───────────────────────────────────────────────────────

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true)
      const res = await authFetch('/api/clients')
      if (!res.ok) throw new Error('Failed to fetch clients')
      const data = await res.json()
      setClients(data.clients || [])
    } catch {
      toast.error('Failed to load clients')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  // ─── Form Handlers ───────────────────────────────────────────────────────

  function openCreate() {
    setEditingClient(null)
    setClientName('')
    setFormOpen(true)
  }

  function openEdit(client: Client) {
    setEditingClient(client)
    setClientName(client.name)
    setFormOpen(true)
  }

  async function handleSubmit() {
    const trimmed = clientName.trim()
    if (!trimmed) {
      toast.error('Client name is required')
      return
    }

    setSubmitting(true)
    try {
      if (editingClient) {
        const res = await authFetch(`/api/clients/${editingClient.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Update failed' }))
          throw new Error(err.message || 'Update failed')
        }
        toast.success(`Client "${trimmed}" updated successfully`)
      } else {
        const res = await authFetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Creation failed' }))
          throw new Error(err.message || 'Creation failed')
        }
        toast.success(`Client "${trimmed}" created successfully`)
      }
      setFormOpen(false)
      fetchClients()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operation failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Action Handlers ─────────────────────────────────────────────────────

  async function handleDelete(client: Client) {
    try {
      const res = await authFetch(`/api/clients/${client.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Delete failed' }))
        throw new Error(err.message || 'Delete failed')
      }
      toast.success(`Client "${client.name}" deleted successfully`)
      fetchClients()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete client')
    }
  }

  async function handleToggleActive(client: Client) {
    try {
      const res = await authFetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !client.isActive }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Toggle failed' }))
        throw new Error(err.message || 'Toggle failed')
      }
      toast.success(`Client "${client.name}" ${client.isActive ? 'deactivated' : 'activated'}`)
      fetchClients()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to toggle client status')
    }
  }

  // ─── Badge Helper ────────────────────────────────────────────────────────

  function StatusBadge({ active }: { active: boolean }) {
    return active ? (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
        Active
      </Badge>
    ) : (
      <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:border-red-800">
        Inactive
      </Badge>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Management"
        description="Manage client names for call tracking"
        icon={Building2}
      >
        <Button onClick={openCreate} size="sm">
          <Plus className="size-4" />
          Add Client
        </Button>
      </PageHeader>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading clients...</span>
        </div>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Add your first client to get started with call tracking"
          actionLabel="Add Client"
          onAction={openCreate}
        />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.id} className={!client.isActive ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell>
                      <StatusBadge active={client.isActive} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openEdit(client)}
                          title="Edit client"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setToggleConfirm(client)}
                          title={client.isActive ? 'Deactivate client' : 'Activate client'}
                        >
                          <Power className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                          onClick={() => setDeleteConfirm(client)}
                          title="Delete client"
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
            {clients.map((client) => (
              <div
                key={client.id}
                className={`rounded-lg border p-4 space-y-3 ${!client.isActive ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-muted-foreground" />
                    <p className="font-medium text-sm">{client.name}</p>
                  </div>
                  <StatusBadge active={client.isActive} />
                </div>

                <div className="flex items-center gap-1 pt-2 border-t">
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-9" onClick={() => openEdit(client)}>
                    <Pencil className="size-3" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-9" onClick={() => setToggleConfirm(client)}>
                    <Power className="size-3" /> {client.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs h-9 text-red-500 hover:text-red-600" onClick={() => setDeleteConfirm(client)}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Edit Client' : 'Add Client'}</DialogTitle>
            <DialogDescription>
              {editingClient
                ? 'Update the client name.'
                : 'Add a new client for call tracking and categorization.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="client-name">Client Name</Label>
              <Input
                id="client-name"
                placeholder="e.g. Akolta, Zepto"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit()
                }}
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {editingClient ? 'Save Changes' : 'Add Client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete Client"
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
        title={toggleConfirm?.isActive ? 'Deactivate Client' : 'Activate Client'}
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
    </div>
  )
}
