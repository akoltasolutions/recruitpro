'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tag, Plus, Pencil, Trash2, Power, Search } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'

interface Disposition {
  id: string
  heading: string
  type: string
  isActive: boolean
  createdAt: string
}

const typeColors: Record<string, string> = {
  SHORTLISTED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  CONNECTED: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  NOT_CONNECTED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  NOT_INTERESTED: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
}

const typeLabels: Record<string, string> = {
  SHORTLISTED: 'Shortlisted',
  CONNECTED: 'Connected',
  NOT_CONNECTED: 'Not Connected',
  NOT_INTERESTED: 'Not Interested',
}

export function DispositionManagement() {
  const [dispositions, setDispositions] = useState<Disposition[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Disposition | null>(null)
  const [heading, setHeading] = useState('')
  const [type, setType] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Disposition | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<Disposition | null>(null)

  const fetchDispositions = async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/dispositions')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setDispositions(json.dispositions || [])
    } catch {
      toast.error('Failed to load dispositions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDispositions() }, [])

  const openCreate = () => {
    setEditing(null)
    setHeading('')
    setType('')
    setDialogOpen(true)
  }

  const openEdit = (d: Disposition) => {
    setEditing(d)
    setHeading(d.heading)
    setType(d.type)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!heading || !type) { toast.error('Heading and type are required'); return }
    setSaving(true)
    try {
      const url = editing ? `/api/dispositions/${editing.id}` : '/api/dispositions'
      const method = editing ? 'PUT' : 'POST'
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heading, type }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return }
      toast.success(editing ? 'Disposition updated' : 'Disposition created')
      setDialogOpen(false)
      fetchDispositions()
    } catch { toast.error('Something went wrong') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      const res = await authFetch(`/api/dispositions/${confirmDelete.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete'); return }
      toast.success('Disposition deleted')
      fetchDispositions()
    } catch { toast.error('Something went wrong') }
    setConfirmDelete(null)
  }

  const handleToggle = async () => {
    if (!confirmToggle) return
    try {
      const res = await authFetch(`/api/dispositions/${confirmToggle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !confirmToggle.isActive }),
      })
      if (!res.ok) { toast.error('Failed to update'); return }
      toast.success(`Disposition ${confirmToggle.isActive ? 'deactivated' : 'activated'}`)
      fetchDispositions()
    } catch { toast.error('Something went wrong') }
    setConfirmToggle(null)
  }

  const filtered = dispositions.filter(d =>
    d.heading.toLowerCase().includes(search.toLowerCase()) ||
    d.type.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <PageHeader title="Disposition Management" description="Manage call outcome categories" icon={Tag}>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-2" /> Add Disposition
        </Button>
      </PageHeader>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search dispositions..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Tag} title="No dispositions found" description="Create your first disposition to categorize call outcomes" actionLabel="Add Disposition" onAction={openCreate} />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block rounded-lg border overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Heading</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.heading}</TableCell>
                  <TableCell>
                    <Badge className={typeColors[d.type] || ''}>{typeLabels[d.type] || d.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={d.isActive ? 'default' : 'secondary'} className={d.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : ''}>
                      {d.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(d)} className="h-8 w-8"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setConfirmToggle(d)} className="h-8 w-8">
                        <Power className={`h-3.5 w-3.5 ${d.isActive ? 'text-red-500' : 'text-emerald-500'}`} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(d)} className="h-8 w-8 text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {filtered.map((d) => (
              <div key={d.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="font-medium text-sm truncate">{d.heading}</p>
                  </div>
                  <Badge variant={d.isActive ? 'default' : 'secondary'} className={d.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 shrink-0' : ''}>
                    {d.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={typeColors[d.type] || ''}>{typeLabels[d.type] || d.type}</Badge>
                </div>
                <div className="flex items-center gap-1 pt-2 border-t">
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-9" onClick={() => openEdit(d)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-9" onClick={() => setConfirmToggle(d)}>
                    <Power className={`h-3 w-3 mr-1 ${d.isActive ? 'text-red-500' : 'text-emerald-500'}`} />
                    {d.isActive ? 'Disable' : 'Enable'}
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs h-9 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => setConfirmDelete(d)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Disposition' : 'Add Disposition'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Heading</Label>
              <Input placeholder="e.g., Connected - Interested" value={heading} onChange={e => setHeading(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
              >
                <option value="">Select type</option>
                <option value="SHORTLISTED">Shortlisted</option>
                <option value="CONNECTED">Connected</option>
                <option value="NOT_CONNECTED">Not Connected</option>
                <option value="NOT_INTERESTED">Not Interested</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Delete Disposition"
        description={`Are you sure you want to delete "${confirmDelete?.heading}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={!!confirmToggle}
        onOpenChange={() => setConfirmToggle(null)}
        title={confirmToggle?.isActive ? 'Deactivate Disposition' : 'Activate Disposition'}
        description={`Are you sure you want to ${confirmToggle?.isActive ? 'deactivate' : 'activate'} "${confirmToggle?.heading}"?`}
        onConfirm={handleToggle}
      />
    </div>
  )
}
