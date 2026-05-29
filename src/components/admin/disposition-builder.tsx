'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Palette, Plus, Pencil, Trash2, GripVertical, Check, X,
  ThumbsUp, ThumbsDown, Minus, SmilePlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'

// ── Types ───────────────────────────────────────────────────────────────────

interface CustomDisposition {
  id: string
  name: string
  color: string
  isPositive: boolean
  sortOrder: number
  isActive: boolean
}

// ── Color Palettes ──────────────────────────────────────────────────────────

const POSITIVE_COLORS = [
  { color: '#059669', label: 'Emerald' },
  { color: '#10B981', label: 'Green' },
  { color: '#34D399', label: 'Light Green' },
  { color: '#047857', label: 'Dark Emerald' },
  { color: '#065F46', label: 'Forest' },
]

const NEGATIVE_COLORS = [
  { color: '#DC2626', label: 'Red' },
  { color: '#EF4444', label: 'Bright Red' },
  { color: '#F97316', label: 'Orange' },
  { color: '#D97706', label: 'Amber' },
  { color: '#EA580C', label: 'Deep Orange' },
]

const NEUTRAL_COLORS = [
  { color: '#6B7280', label: 'Gray' },
  { color: '#9CA3AF', label: 'Light Gray' },
  { color: '#4B5563', label: 'Dark Gray' },
  { color: '#374151', label: 'Charcoal' },
  { color: '#78716C', label: 'Stone' },
]

function getColorPalette(isPositive: boolean | null) {
  if (isPositive === true) return POSITIVE_COLORS
  if (isPositive === false) return NEGATIVE_COLORS
  return NEUTRAL_COLORS
}

// ── Sortable Disposition Item ───────────────────────────────────────────────

function SortableDispositionItem({
  disposition,
  onEdit,
  onDelete,
}: {
  disposition: CustomDisposition
  onEdit: (d: CustomDisposition) => void
  onDelete: (d: CustomDisposition) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: disposition.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="group hover:shadow-md transition-shadow">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Drag handle */}
            <button
              {...attributes}
              {...listeners}
              className="touch-none cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted text-muted-foreground shrink-0"
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </button>

            {/* Color circle */}
            <div
              className="h-8 w-8 rounded-full shrink-0 ring-2 ring-background shadow-sm"
              style={{ backgroundColor: disposition.color }}
            />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate">{disposition.name}</span>
                {disposition.isPositive ? (
                  <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 text-[10px] px-1.5 py-0">
                    <ThumbsUp className="h-2.5 w-2.5 mr-0.5" /> Positive
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 text-[10px] px-1.5 py-0">
                    <ThumbsDown className="h-2.5 w-2.5 mr-0.5" /> Negative
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <code className="text-[10px] text-muted-foreground">{disposition.color}</code>
                <span className="text-[10px] text-muted-foreground">· Order #{disposition.sortOrder + 1}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onEdit(disposition)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-500 hover:text-red-700"
                onClick={() => onDelete(disposition)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function DispositionBuilder() {
  const [dispositions, setDispositions] = useState<CustomDisposition[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CustomDisposition | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<CustomDisposition | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formColor, setFormColor] = useState('#6B7280')
  const [formIsPositive, setFormIsPositive] = useState<boolean | null>(null) // null = neutral

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchDispositions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/custom-dispositions')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setDispositions(json.dispositions || [])
    } catch {
      toast.error('Failed to load dispositions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDispositions() }, [fetchDispositions])

  // ── Drag handling ────────────────────────────────────────────────────────

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = dispositions.findIndex(d => d.id === active.id)
    const newIndex = dispositions.findIndex(d => d.id === over.id)
    const reordered = arrayMove(dispositions, oldIndex, newIndex).map((d, i) => ({
      ...d,
      sortOrder: i,
    }))

    setDispositions(reordered)

    try {
      await authFetch('/api/custom-dispositions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: reordered.map(d => ({ id: d.id, sortOrder: d.sortOrder })),
        }),
      })
    } catch {
      toast.error('Failed to reorder dispositions')
      fetchDispositions()
    }
  }

  // ── Create / Edit ───────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null)
    setFormName('')
    setFormColor('#6B7280')
    setFormIsPositive(null)
    setDialogOpen(true)
  }

  const openEdit = (d: CustomDisposition) => {
    setEditing(d)
    setFormName(d.name)
    setFormColor(d.color)
    setFormIsPositive(d.isPositive)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Name is required')
      return
    }

    setSaving(true)
    try {
      const url = editing
        ? `/api/custom-dispositions/${editing.id}`
        : '/api/custom-dispositions'
      const method = editing ? 'PUT' : 'POST'
      const body: Record<string, unknown> = {
        name: formName.trim(),
        color: formColor,
        isPositive: formIsPositive === true,
      }

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to save')
        return
      }
      toast.success(editing ? 'Disposition updated' : 'Disposition created')
      setDialogOpen(false)
      fetchDispositions()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      const res = await authFetch(`/api/custom-dispositions/${confirmDelete.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete'); return }
      toast.success('Disposition removed')
      fetchDispositions()
    } catch { toast.error('Something went wrong') }
    setConfirmDelete(null)
  }

  // ── Stats ───────────────────────────────────────────────────────────────

  const positiveCount = dispositions.filter(d => d.isPositive).length
  const negativeCount = dispositions.filter(d => !d.isPositive).length
  const currentPalette = getColorPalette(formIsPositive)

  return (
    <div>
      <PageHeader
        title="Custom Dispositions"
        description="Define call outcome categories with colors and sentiment"
        icon={SmilePlus}
      >
        <div className="flex items-center gap-2">
          {dispositions.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground mr-2">
              <Badge variant="secondary" className="font-normal">{dispositions.length} total</Badge>
              {positiveCount > 0 && (
                <Badge className="font-normal bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">{positiveCount} positive</Badge>
              )}
              {negativeCount > 0 && (
                <Badge className="font-normal bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">{negativeCount} negative</Badge>
              )}
            </div>
          )}
          <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-2" /> Add Disposition
          </Button>
        </div>
      </PageHeader>

      {/* Summary strip — mobile */}
      {dispositions.length > 0 && (
        <div className="sm:hidden flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          <Badge variant="secondary" className="font-normal shrink-0">{dispositions.length} total</Badge>
          {positiveCount > 0 && (
            <Badge className="font-normal bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 shrink-0">{positiveCount} positive</Badge>
          )}
          {negativeCount > 0 && (
            <Badge className="font-normal bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 shrink-0">{negativeCount} negative</Badge>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : dispositions.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No custom dispositions"
          description="Create disposition categories to track call outcomes with colors and sentiment"
          actionLabel="Create First Disposition"
          onAction={openCreate}
        />
      ) : (
        <>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 mb-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-emerald-500" />
              <span>Positive outcome</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span>Negative outcome</span>
            </div>
            <Separator orientation="vertical" className="h-3" />
            <span>Drag to reorder priority</span>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={dispositions.map(d => d.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {dispositions.map((disposition) => (
                  <SortableDispositionItem
                    key={disposition.id}
                    disposition={disposition}
                    onEdit={openEdit}
                    onDelete={setConfirmDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <p className="text-xs text-muted-foreground mt-3 text-center">
            Drag dispositions to change their default order
          </p>
        </>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit Disposition' : 'New Disposition'}
            </DialogTitle>
            <DialogDescription>
              Set the name, color, and sentiment for this call outcome category.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="disp-name">Name</Label>
              <Input
                id="disp-name"
                placeholder="e.g. Interested — Callback Scheduled"
                value={formName}
                onChange={e => setFormName(e.target.value)}
              />
            </div>

            {/* Sentiment Toggle */}
            <div className="space-y-2">
              <Label>Sentiment</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={formIsPositive === true ? 'default' : 'outline'}
                  size="sm"
                  className={`flex-1 ${formIsPositive === true ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                  onClick={() => setFormIsPositive(formIsPositive === true ? null : true)}
                >
                  <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
                  Positive
                </Button>
                <Button
                  type="button"
                  variant={formIsPositive === false ? 'default' : 'outline'}
                  size="sm"
                  className={`flex-1 ${formIsPositive === false ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
                  onClick={() => setFormIsPositive(formIsPositive === false ? null : false)}
                >
                  <ThumbsDown className="h-3.5 w-3.5 mr-1.5" />
                  Negative
                </Button>
                <Button
                  type="button"
                  variant={formIsPositive === null ? 'default' : 'outline'}
                  size="sm"
                  className={`flex-1 ${formIsPositive === null ? 'bg-gray-600 hover:bg-gray-700 text-white' : ''}`}
                  onClick={() => setFormIsPositive(null)}
                >
                  <Minus className="h-3.5 w-3.5 mr-1.5" />
                  Neutral
                </Button>
              </div>
            </div>

            {/* Color Picker */}
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {currentPalette.map((c) => (
                  <button
                    key={c.color}
                    type="button"
                    onClick={() => setFormColor(c.color)}
                    className={`h-9 w-9 rounded-full transition-all cursor-pointer ${
                      formColor === c.color
                        ? 'ring-2 ring-offset-2 ring-emerald-600 dark:ring-offset-background scale-110'
                        : 'ring-1 ring-border hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.color }}
                    title={c.label}
                    aria-label={c.label}
                  />
                ))}
              </div>
              {/* Custom hex input */}
              <div className="flex items-center gap-2 mt-2">
                <div
                  className="h-8 w-8 rounded-lg ring-1 ring-border shrink-0"
                  style={{ backgroundColor: formColor }}
                />
                <Input
                  value={formColor}
                  onChange={e => setFormColor(e.target.value)}
                  placeholder="#6B7280"
                  className="font-mono text-sm w-32"
                />
                <code className="text-xs text-muted-foreground">{formColor}</code>
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Preview</Label>
              <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
                <div
                  className="h-8 w-8 rounded-full ring-2 ring-background shadow-sm shrink-0"
                  style={{ backgroundColor: formColor }}
                />
                <div>
                  <p className="text-sm font-medium">{formName || 'Disposition Name'}</p>
                  <Badge
                    className={`text-[10px] px-1.5 py-0 ${
                      formIsPositive === true
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                        : formIsPositive === false
                          ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    {formIsPositive === true ? 'Positive' : formIsPositive === false ? 'Negative' : 'Neutral'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Remove Disposition"
        description={`Are you sure you want to remove "${confirmDelete?.name}"? This will be deactivated but existing records are preserved.`}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
