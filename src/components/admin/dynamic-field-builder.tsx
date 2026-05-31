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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
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
  FormInput, Hash, Calendar, Mail, Phone, List, ListChecks, ToggleLeft,
  AlignLeft, Link2, Plus, Pencil, Trash2, GripVertical, X, Settings2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'

// ── Types ───────────────────────────────────────────────────────────────────

type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'EMAIL' | 'PHONE' | 'SELECT' | 'MULTI_SELECT' | 'BOOLEAN' | 'TEXTAREA' | 'URL'

interface DynamicField {
  id: string
  name: string
  label: string
  fieldType: FieldType
  options: string | null
  isRequired: boolean
  sortOrder: number
  isActive: boolean
}

interface FieldTypeOption {
  type: FieldType
  label: string
  icon: LucideIcon
  description: string
}

// ── Field type definitions ──────────────────────────────────────────────────

const FIELD_TYPES: FieldTypeOption[] = [
  { type: 'TEXT', label: 'Text', icon: FormInput, description: 'Single line text' },
  { type: 'NUMBER', label: 'Number', icon: Hash, description: 'Numeric input' },
  { type: 'DATE', label: 'Date', icon: Calendar, description: 'Date picker' },
  { type: 'EMAIL', label: 'Email', icon: Mail, description: 'Email address' },
  { type: 'PHONE', label: 'Phone', icon: Phone, description: 'Phone number' },
  { type: 'SELECT', label: 'Select', icon: List, description: 'Single choice dropdown' },
  { type: 'MULTI_SELECT', label: 'Multi-Select', icon: ListChecks, description: 'Multiple choice' },
  { type: 'BOOLEAN', label: 'Boolean', icon: ToggleLeft, description: 'Yes/No toggle' },
  { type: 'TEXTAREA', label: 'Textarea', icon: AlignLeft, description: 'Multi-line text' },
  { type: 'URL', label: 'URL', icon: Link2, description: 'Website link' },
]

const FIELD_TYPE_COLORS: Record<FieldType, string> = {
  TEXT: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  NUMBER: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400',
  DATE: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400',
  EMAIL: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  PHONE: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400',
  SELECT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  MULTI_SELECT: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400',
  BOOLEAN: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-400',
  TEXTAREA: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  URL: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400',
}

// ── Sortable Field Item ─────────────────────────────────────────────────────

function SortableFieldItem({
  field,
  onEdit,
  onDelete,
}: {
  field: DynamicField
  onEdit: (f: DynamicField) => void
  onDelete: (f: DynamicField) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  const typeInfo = FIELD_TYPES.find(t => t.type === field.fieldType)
  const TypeIcon = typeInfo?.icon || FormInput
  const optionsCount = field.options ? JSON.parse(field.options).length : 0

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

            {/* Type icon */}
            <div className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${FIELD_TYPE_COLORS[field.fieldType]}`}>
              <TypeIcon className="h-4 w-4" />
            </div>

            {/* Field info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate">{field.label}</span>
                {field.isRequired && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-red-600 border-red-200 dark:border-red-800">
                    Required
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <code className="text-xs text-muted-foreground">{field.name}</code>
                {(field.fieldType === 'SELECT' || field.fieldType === 'MULTI_SELECT') && optionsCount > 0 && (
                  <span className="text-[10px] text-muted-foreground">· {optionsCount} options</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onEdit(field)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-500 hover:text-red-700"
                onClick={() => onDelete(field)}
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

export function DynamicFieldBuilder() {
  const [fields, setFields] = useState<DynamicField[]>([])
  const [loading, setLoading] = useState(true)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingField, setEditingField] = useState<DynamicField | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<DynamicField | null>(null)

  // Edit form state
  const [formLabel, setFormLabel] = useState('')
  const [formType, setFormType] = useState<FieldType>('TEXT')
  const [formOptions, setFormOptions] = useState<string[]>([])
  const [formRequired, setFormRequired] = useState(false)
  const [formActive, setFormActive] = useState(true)
  const [newOption, setNewOption] = useState('')
  const [saving, setSaving] = useState(false)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  )

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchFields = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/dynamic-fields')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setFields(json.fields || [])
    } catch {
      toast.error('Failed to load fields')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchFields() }, [fetchFields])

  // ── Drag handling ────────────────────────────────────────────────────────

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = fields.findIndex(f => f.id === active.id)
    const newIndex = fields.findIndex(f => f.id === over.id)
    const reordered = arrayMove(fields, oldIndex, newIndex).map((f, i) => ({
      ...f,
      sortOrder: i,
    }))

    setFields(reordered)

    // Persist reorder
    try {
      await authFetch('/api/dynamic-fields', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: reordered.map(f => ({ id: f.id, sortOrder: f.sortOrder })),
        }),
      })
    } catch {
      toast.error('Failed to reorder fields')
      fetchFields()
    }
  }

  // ── Add field ────────────────────────────────────────────────────────────

  const handleAddField = async (type: FieldType) => {
    const typeInfo = FIELD_TYPES.find(t => t.type === type)
    if (!typeInfo) return

    try {
      const res = await authFetch('/api/dynamic-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: `${typeInfo.label} Field`,
          fieldType: type,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to add field')
        return
      }
      const json = await res.json()
      // Open edit dialog for the new field
      setEditingField(json.field)
      setFormLabel(json.field.label)
      setFormType(json.field.fieldType as FieldType)
      setFormOptions(json.field.options ? JSON.parse(json.field.options) : [])
      setFormRequired(json.field.isRequired)
      setFormActive(json.field.isActive)
      setEditDialogOpen(true)
      toast.success('Field added — configure it now')
      fetchFields()
    } catch {
      toast.error('Failed to add field')
    }
  }

  // ── Edit field ───────────────────────────────────────────────────────────

  const openEdit = (field: DynamicField) => {
    setEditingField(field)
    setFormLabel(field.label)
    setFormType(field.fieldType)
    setFormOptions(field.options ? JSON.parse(field.options) : [])
    setFormRequired(field.isRequired)
    setFormActive(field.isActive)
    setEditDialogOpen(true)
  }

  const handleSave = async () => {
    if (!editingField) return
    if (!formLabel.trim()) {
      toast.error('Label is required')
      return
    }

    setSaving(true)
    try {
      const res = await authFetch(`/api/dynamic-fields/${editingField.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: formLabel.trim(),
          fieldType: formType,
          options: (formType === 'SELECT' || formType === 'MULTI_SELECT')
            ? JSON.stringify(formOptions)
            : null,
          isRequired: formRequired,
          isActive: formActive,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to update field')
        return
      }
      toast.success('Field updated')
      setEditDialogOpen(false)
      fetchFields()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete field ─────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      const res = await authFetch(`/api/dynamic-fields/${confirmDelete.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete'); return }
      toast.success('Field removed')
      fetchFields()
    } catch { toast.error('Something went wrong') }
    setConfirmDelete(null)
  }

  // ── Options management ───────────────────────────────────────────────────

  const addOption = () => {
    const val = newOption.trim()
    if (!val) return
    if (formOptions.includes(val)) {
      toast.error('Option already exists')
      return
    }
    setFormOptions([...formOptions, val])
    setNewOption('')
  }

  const removeOption = (index: number) => {
    setFormOptions(formOptions.filter((_, i) => i !== index))
  }

  // ── Field count stats ────────────────────────────────────────────────────

  const requiredCount = fields.filter(f => f.isRequired).length

  return (
    <div>
      <PageHeader
        title="Calling List Fields"
        description="Customize the fields available when creating calling lists"
        icon={Settings2}
      >
        <div className="flex items-center gap-2">
          {fields.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground mr-2">
              <Badge variant="secondary" className="font-normal">{fields.length} fields</Badge>
              {requiredCount > 0 && (
                <Badge variant="outline" className="font-normal text-red-600 border-red-200 dark:border-red-800">{requiredCount} required</Badge>
              )}
            </div>
          )}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Panel — Field Types Palette */}
        <div className="lg:col-span-4 xl:col-span-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Field Types</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="grid grid-cols-2 gap-2">
                {FIELD_TYPES.map((ft) => (
                  <button
                    key={ft.type}
                    onClick={() => handleAddField(ft.type)}
                    className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-center hover:bg-accent/50 transition-colors group cursor-pointer"
                  >
                    <div className={`flex items-center justify-center h-9 w-9 rounded-lg ${FIELD_TYPE_COLORS[ft.type]}`}>
                      <ft.icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium leading-tight">{ft.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight hidden xl:block">{ft.description}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel — Configured Fields */}
        <div className="lg:col-span-8 xl:col-span-9">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : fields.length === 0 ? (
            <EmptyState
              icon={FormInput}
              title="No custom fields yet"
              description="Add fields from the palette on the left to customize your calling list data capture"
              actionLabel="Add Your First Field"
              onAction={() => handleAddField('TEXT')}
            />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={fields.map(f => f.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                  {fields.map((field) => (
                    <SortableFieldItem
                      key={field.id}
                      field={field}
                      onEdit={openEdit}
                      onDelete={setConfirmDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {fields.length > 0 && !loading && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Drag fields to reorder their display position in calling lists
            </p>
          )}
        </div>
      </div>

      {/* Edit Field Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingField ? 'Configure Field' : 'New Field'}
            </DialogTitle>
            <DialogDescription>
              Set the display label, type, and options for this field.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Label */}
            <div className="space-y-2">
              <Label htmlFor="field-label">Display Label</Label>
              <Input
                id="field-label"
                placeholder="e.g. Alternate Phone"
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
              />
            </div>

            {/* Field Name (read-only) */}
            {editingField && (
              <div className="space-y-2">
                <Label>Field Key</Label>
                <code className="block text-sm px-3 py-2 rounded-lg bg-muted text-muted-foreground">
                  {editingField.name}
                </code>
              </div>
            )}

            {/* Field Type */}
            <div className="space-y-2">
              <Label htmlFor="field-type">Field Type</Label>
              <Select value={formType} onValueChange={v => setFormType(v as FieldType)} modal={false}>
                <SelectTrigger id="field-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(ft => (
                    <SelectItem key={ft.type} value={ft.type}>
                      <div className="flex items-center gap-2">
                        <ft.icon className="h-3.5 w-3.5" />
                        <span>{ft.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Options for SELECT / MULTI_SELECT */}
            {(formType === 'SELECT' || formType === 'MULTI_SELECT') && (
              <div className="space-y-3">
                <Label>Options</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add an option..."
                    value={newOption}
                    onChange={e => setNewOption(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addOption()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addOption}
                    disabled={!newOption.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {formOptions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formOptions.map((opt, idx) => (
                      <Badge key={idx} variant="secondary" className="pl-2.5 pr-1 py-1.5 gap-1">
                        {opt}
                        <button
                          onClick={() => removeOption(idx)}
                          className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                {formOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">No options added yet. Type an option and press Enter or click +</p>
                )}
              </div>
            )}

            <Separator />

            {/* Toggles */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="field-required">Required Field</Label>
                <p className="text-xs text-muted-foreground">Recruiters must fill this in</p>
              </div>
              <Switch
                id="field-required"
                checked={formRequired}
                onCheckedChange={setFormRequired}
              />
            </div>

            {editingField && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="field-active">Active</Label>
                  <p className="text-xs text-muted-foreground">Show this field in calling lists</p>
                </div>
                <Switch
                  id="field-active"
                  checked={formActive}
                  onCheckedChange={setFormActive}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Remove Field"
        description={`Are you sure you want to remove "${confirmDelete?.label}"? Existing data using this field will be preserved.`}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
