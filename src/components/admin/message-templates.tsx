'use client'

import { useState, useEffect, useRef } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { MessageSquare, Plus, Pencil, Trash2, Power, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'

interface MessageTemplate {
  id: string
  name: string
  type: string
  content: string
  isActive: boolean
  createdAt: string
}

const typeColors: Record<string, string> = {
  NOT_ANSWERED: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  SHORTLISTED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  CUSTOM: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
}

const typeLabels: Record<string, string> = {
  NOT_ANSWERED: 'Not Answered',
  SHORTLISTED: 'Shortlisted',
  CUSTOM: 'Custom',
}

const dynamicVariables = [
  { key: '{{candidate_name}}', label: 'Candidate Name' },
  { key: '{{recruiter_name}}', label: 'Recruiter Name' },
  { key: '{{role}}', label: 'Role' },
  { key: '{{location}}', label: 'Location' },
]

const previewData: Record<string, string> = {
  '{{candidate_name}}': 'Rahul Sharma',
  '{{recruiter_name}}': 'John Recruiter',
  '{{role}}': 'Software Engineer',
  '{{location}}': 'Bangalore',
}

export function MessageTemplates() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [editing, setEditing] = useState<MessageTemplate | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<MessageTemplate | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<MessageTemplate | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplate | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/message-templates')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setTemplates(json.templates || [])
    } catch { toast.error('Failed to load templates') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchTemplates() }, [])

  const openCreate = () => {
    setEditing(null)
    setName('')
    setType('')
    setContent('')
    setDialogOpen(true)
  }

  const openEdit = (t: MessageTemplate) => {
    setEditing(t)
    setName(t.name)
    setType(t.type)
    setContent(t.content)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!name || !type || !content) { toast.error('All fields are required'); return }
    setSaving(true)
    try {
      const url = editing ? `/api/message-templates/${editing.id}` : '/api/message-templates'
      const method = editing ? 'PUT' : 'POST'
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, content }),
      })
      if (!res.ok) { const data = await res.json(); toast.error(data.error || 'Failed'); return }
      toast.success(editing ? 'Template updated' : 'Template created')
      setDialogOpen(false)
      fetchTemplates()
    } catch { toast.error('Something went wrong') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      const res = await authFetch(`/api/message-templates/${confirmDelete.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete'); return }
      toast.success('Template deleted')
      fetchTemplates()
    } catch { toast.error('Something went wrong') }
    setConfirmDelete(null)
  }

  const handleToggle = async () => {
    if (!confirmToggle) return
    try {
      const res = await authFetch(`/api/message-templates/${confirmToggle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !confirmToggle.isActive }),
      })
      if (!res.ok) { toast.error('Failed to update'); return }
      toast.success(`Template ${confirmToggle.isActive ? 'deactivated' : 'activated'}`)
      fetchTemplates()
    } catch { toast.error('Something went wrong') }
    setConfirmToggle(null)
  }

  const insertVariable = (variable: string) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newContent = content.substring(0, start) + variable + content.substring(end)
    setContent(newContent)
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + variable.length
      textarea.focus()
    }, 0)
  }

  const getPreview = (text: string) => {
    let result = text
    Object.entries(previewData).forEach(([key, value]) => {
      result = result.replaceAll(key, value)
    })
    return result
  }

  return (
    <div>
      <PageHeader title="Message Templates" description="Manage WhatsApp and SMS templates" icon={MessageSquare}>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-2" /> Add Template
        </Button>
      </PageHeader>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : templates.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No templates" description="Create message templates for WhatsApp and SMS" actionLabel="Add Template" onAction={openCreate} />
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <Card key={t.id} className={!t.isActive ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm">{t.name}</h3>
                      <Badge className={typeColors[t.type] || ''}>{typeLabels[t.type] || t.type}</Badge>
                      {!t.isActive && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{t.content}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setPreviewTemplate(t); setPreviewOpen(true) }}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setConfirmToggle(t)}>
                      <Power className={`h-3.5 w-3.5 ${t.isActive ? 'text-red-500' : 'text-emerald-500'}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => setConfirmDelete(t)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Template' : 'Add Template'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Not Answered Template" />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
              >
                <option value="">Select type</option>
                <option value="NOT_ANSWERED">Not Answered</option>
                <option value="SHORTLISTED">Shortlisted</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Dynamic Variables</Label>
              <div className="flex flex-wrap gap-1.5">
                {dynamicVariables.map(v => (
                  <Badge key={v.key} variant="outline" className="cursor-pointer hover:bg-muted text-xs" onClick={() => insertVariable(v.key)}>
                    {v.label}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value)} placeholder="Write your message template..." rows={5} />
              <p className="text-xs text-muted-foreground">Click on variables above to insert them at cursor position</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Template Preview</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Original</Label>
              <p className="text-sm bg-muted rounded-md p-3 whitespace-pre-wrap">{previewTemplate?.content}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">With Sample Data</Label>
              <p className="text-sm bg-emerald-50 dark:bg-emerald-950 rounded-md p-3 whitespace-pre-wrap">{getPreview(previewTemplate?.content || '')}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Delete Template"
        description={`Are you sure you want to delete "${confirmDelete?.name}"?`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={!!confirmToggle}
        onOpenChange={() => setConfirmToggle(null)}
        title={confirmToggle?.isActive ? 'Deactivate Template' : 'Activate Template'}
        description={`Are you sure you want to ${confirmToggle?.isActive ? 'deactivate' : 'activate'} "${confirmToggle?.name}"?`}
        onConfirm={handleToggle}
      />
    </div>
  )
}
