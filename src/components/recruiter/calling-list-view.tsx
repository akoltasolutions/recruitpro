'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  PhoneCall, Users, Search, ChevronDown, ChevronUp, Eye, Clock, Play,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import { format } from 'date-fns'
import { PaginationControls, InfiniteScrollLoader } from '@/components/shared/pagination-controls'

interface CallingList {
  id: string
  name: string
  description: string | null
  source: string
  createdAt: string
  candidates: Array<{ id: string }>
}

interface Candidate {
  id: string
  name: string
  phone: string
  email: string | null
  role: string | null
  location: string | null
  company: string | null
  status: string
  notes: string | null
  lastDisposition: string | null
}

interface Props {
  userId: string
  onNavigate: (page: string) => void
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  DONE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  SCHEDULED: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  SKIPPED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

export function CallingListView({ userId, onNavigate }: Props) {
  const [callingLists, setCallingLists] = useState<CallingList[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedListId, setExpandedListId] = useState<string | null>(null)

  // Server-side pagination state
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // View candidates dialog
  const [candidatesOpen, setCandidatesOpen] = useState(false)
  const [selectedList, setSelectedList] = useState<CallingList | null>(null)
  const [candidateSearch, setCandidateSearch] = useState('')

  // Fetched candidate details (per list)
  const [listCandidatesMap, setListCandidatesMap] = useState<Record<string, Candidate[]>>({})
  const [listCandidatesLoading, setListCandidatesLoading] = useState<Record<string, boolean>>({})

  // ─── Debounced Search ──────────────────────────────────────────────────────

  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // ─── Fetch Calling Lists ─────────────────────────────────────────────────────

  const fetchCallingLists = useCallback(async (page = 1, limit = 50, searchVal = '', append = false) => {
    try {
      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(limit))
      if (searchVal) params.set('search', searchVal)

      const res = await authFetch(`/api/call-lists?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch calling lists')
      const json = await res.json()
      // Filter to only lists that have candidates assigned
      const assigned = (json.callLists || []).filter(
        (l: CallingList) => l.candidates && l.candidates.length > 0
      ) as CallingList[]

      if (append) {
        setCallingLists(prev => [...prev, ...assigned])
      } else {
        setCallingLists(assigned)
      }
      setTotalCount(json.totalCount || 0)
      setCurrentPage(json.page || page)
      setTotalPages(json.totalPages || 1)
    } catch {
      toast.error('Failed to load calling lists')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  // Initial load + refetch when search or page size changes
  useEffect(() => {
    setCurrentPage(1)
    setCallingLists([])
    fetchCallingLists(1, pageSize, debouncedSearch)
  }, [debouncedSearch, pageSize])

  // ─── Infinite Scroll ──────────────────────────────────────────────────────

  const hasMore = currentPage < totalPages && callingLists.length < totalCount

  const loadMoreFn = () => {
    if (loadingMore || !hasMore) return
    fetchCallingLists(currentPage + 1, pageSize, debouncedSearch, true)
  }

  const loadMoreRef = useRef(loadMoreFn)
  loadMoreRef.current = loadMoreFn

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreRef.current()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // ─── Fetch Candidate Details for a List ─────────────────────────────────────

  const fetchListCandidates = useCallback(async (listId: string) => {
    if (listCandidatesMap[listId]) return // already fetched
    setListCandidatesLoading(prev => ({ ...prev, [listId]: true }))
    try {
      const res = await authFetch(`/api/call-lists/${listId}/candidates`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setListCandidatesMap(prev => ({ ...prev, [listId]: json.candidates || [] }))
    } catch {
      toast.error('Failed to load candidates')
    } finally {
      setListCandidatesLoading(prev => ({ ...prev, [listId]: false }))
    }
  }, [listCandidatesMap])

  // ─── Filter candidates across a single list based on search ─────────────────

  const getFilteredCandidates = useCallback((list: CallingList) => {
    const candidates = listCandidatesMap[list.id] || []
    const q = candidateSearch.toLowerCase().trim()
    if (!q) return candidates
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.role && c.role.toLowerCase().includes(q)) ||
        (c.location && c.location.toLowerCase().includes(q)) ||
        (c.company && c.company.toLowerCase().includes(q))
    )
  }, [listCandidatesMap, candidateSearch])

  // Global search filters which lists are shown (by list name/description only)
  const filteredLists = callingLists.filter((list) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return (
      list.name.toLowerCase().includes(q) ||
      (list.description && list.description.toLowerCase().includes(q))
    )
  })

  const handleExpand = (listId: string) => {
    const isExpanding = expandedListId !== listId
    setExpandedListId((prev) => (prev === listId ? null : listId))
    if (isExpanding) {
      fetchListCandidates(listId)
    }
  }

  const handleViewCandidates = (list: CallingList) => {
    setSelectedList(list)
    setCandidateSearch('')
    fetchListCandidates(list.id)
    setCandidatesOpen(true)
  }

  // Find the first list with candidates and start dialing
  const handleStartDialing = () => {
    const listWithCandidates = callingLists.find(
      (l) => l.candidates.length > 0
    )
    if (!listWithCandidates) {
      toast.info('No pending calling lists available. All candidates have been called.', { duration: 4000 })
      return
    }
    // Store the list ID in sessionStorage for AutoDialer to pick up
    try {
      sessionStorage.setItem('auto_select_list_id', listWithCandidates.id)
    } catch { /* ignore */ }
    onNavigate('pending')
  }

  const getListStats = (list: CallingList) => {
    const candidates = listCandidatesMap[list.id]
    if (!candidates || candidates.length === 0) {
      return { total: list.candidates?.length || 0, pending: 0, done: 0, scheduled: 0 }
    }
    const total = candidates.length
    const pending = candidates.filter((c) => c.status === 'PENDING').length
    const done = candidates.filter((c) => c.status === 'DONE').length
    const scheduled = candidates.filter((c) => c.status === 'SCHEDULED').length
    return { total, pending, done, scheduled }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Calling Lists"
        description="View your assigned calling lists and candidates"
        icon={PhoneCall}
      />

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={handleStartDialing}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={callingLists.length === 0}
        >
          <Play className="h-4 w-4 mr-2" />
          Start Dialing
        </Button>
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search lists..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredLists.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title={search ? 'No matching results' : 'No Calling Lists Assigned'}
          description={
            search
              ? 'Try a different search term'
              : "You haven't been assigned any calling lists yet. Please contact your admin."
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredLists.map((list) => {
            const stats = getListStats(list)
            const isExpanded = expandedListId === list.id
            const candidatesForList = listCandidatesMap[list.id]
            const isLoadingCandidates = listCandidatesLoading[list.id]

            return (
              <Card key={list.id} className="overflow-hidden">
                <CardHeader
                  className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => handleExpand(list.id)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 shrink-0">
                        <PhoneCall className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{list.name}</CardTitle>
                        {list.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {list.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="secondary" className="text-xs">
                          <Users className="h-3 w-3 mr-1" />
                          {stats.total}
                        </Badge>
                        {stats.pending > 0 && (
                          <Badge className={statusColors.PENDING}>{stats.pending} pending</Badge>
                        )}
                        {stats.done > 0 && (
                          <Badge className={statusColors.DONE}>{stats.done} done</Badge>
                        )}
                        {stats.scheduled > 0 && (
                          <Badge className={statusColors.SCHEDULED}>{stats.scheduled} scheduled</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleViewCandidates(list)
                          }}
                          className="h-8 px-2"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleExpand(list.id)
                          }}
                          className="h-8 px-2"
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                {/* Expanded candidate preview */}
                {isExpanded && (
                  <CardContent className="pt-0 px-4 pb-4">
                    <div className="border-t pt-3">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium">Candidates</p>
                        <Badge variant="outline" className="text-xs">
                          Created {format(new Date(list.createdAt), 'MMM dd, yyyy')}
                        </Badge>
                      </div>

                      {/* Inline candidate search */}
                      <div className="relative mb-3 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Filter candidates..."
                          value={candidateSearch}
                          onChange={(e) => setCandidateSearch(e.target.value)}
                          className="pl-8 h-8 text-sm"
                        />
                      </div>

                      {isLoadingCandidates ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="rounded-md border overflow-auto max-h-96">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs w-8">#</TableHead>
                                <TableHead className="text-xs">Name</TableHead>
                                <TableHead className="text-xs">Phone</TableHead>
                                <TableHead className="text-xs hidden sm:table-cell">Email</TableHead>
                                <TableHead className="text-xs hidden md:table-cell">Role</TableHead>
                                <TableHead className="text-xs hidden lg:table-cell">Location</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                                <TableHead className="text-xs hidden xl:table-cell">Notes</TableHead>
                                <TableHead className="text-xs hidden xl:table-cell">Last Disposition</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getFilteredCandidates(list).length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">
                                    {candidateSearch ? 'No candidates match your filter' : 'No candidates in this list'}
                                  </TableCell>
                                </TableRow>
                              ) : (
                                getFilteredCandidates(list).map((candidate, idx) => (
                                  <TableRow key={candidate.id}>
                                    <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                                    <TableCell className="text-xs font-medium">{candidate.name}</TableCell>
                                    <TableCell className="text-xs">{candidate.phone}</TableCell>
                                    <TableCell className="text-xs hidden sm:table-cell">{candidate.email || '—'}</TableCell>
                                    <TableCell className="text-xs hidden md:table-cell">{candidate.role || '—'}</TableCell>
                                    <TableCell className="text-xs hidden lg:table-cell">{candidate.location || '—'}</TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        className={`text-xs ${statusColors[candidate.status] || ''}`}
                                      >
                                        {candidate.status}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs hidden xl:table-cell max-w-[150px] truncate">
                                      {candidate.notes || '—'}
                                    </TableCell>
                                    <TableCell className="text-xs hidden xl:table-cell max-w-[150px] truncate">
                                      {candidate.lastDisposition || '—'}
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}

          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} className="h-1" />

          {/* Infinite scroll loader */}
          <InfiniteScrollLoader loadingMore={loadingMore} isEnd={!hasMore && callingLists.length > 0} />

          {/* Pagination controls */}
          <PaginationControls
            totalCount={totalCount}
            displayedCount={callingLists.length}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            pageSizeOptions={[50, 100]}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize)
              setCurrentPage(1)
              setCallingLists([])
            }}
            onLoadMore={loadMoreFn}
            loadingMore={loadingMore}
            loading={loading}
            hasMore={hasMore}
          />
        </div>
      )}

      {/* View Candidates Dialog (full view with search) */}
      <Dialog open={candidatesOpen} onOpenChange={setCandidatesOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneCall className="h-5 w-5 text-emerald-600" />
              {selectedList?.name} — Candidates
            </DialogTitle>
          </DialogHeader>
          {selectedList && (
            <div className="space-y-3">
              {/* Stats row */}
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                <Badge variant="secondary">{getListStats(selectedList).total} total</Badge>
                <Badge className={statusColors.PENDING}>{getListStats(selectedList).pending} pending</Badge>
                <Badge className={statusColors.DONE}>{getListStats(selectedList).done} done</Badge>
                {getListStats(selectedList).scheduled > 0 && (
                  <Badge className={statusColors.SCHEDULED}>{getListStats(selectedList).scheduled} scheduled</Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  {format(new Date(selectedList.createdAt), 'MMM dd, yyyy')}
                </Badge>
              </div>

              {/* Candidate search */}
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, phone, email, role, location..."
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Candidate table */}
              {listCandidatesLoading[selectedList.id] ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="rounded-md border overflow-auto max-h-[60vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-8">#</TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Phone</TableHead>
                        <TableHead className="text-xs hidden sm:table-cell">Email</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Role</TableHead>
                        <TableHead className="text-xs hidden lg:table-cell">Location</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs hidden xl:table-cell">Notes</TableHead>
                        <TableHead className="text-xs hidden xl:table-cell">Last Disposition</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getFilteredCandidates(selectedList).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                            {candidateSearch ? 'No candidates match your search' : 'No candidates in this list'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        getFilteredCandidates(selectedList).map((candidate, idx) => (
                          <TableRow key={candidate.id}>
                            <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="text-xs font-medium">{candidate.name}</TableCell>
                            <TableCell className="text-xs">
                              <a
                                href={`tel:${candidate.phone.replace(/[^0-9]/g, '')}`}
                                className="text-emerald-600 hover:underline"
                                style={{ touchAction: 'manipulation' }}
                              >
                                {candidate.phone}
                              </a>
                            </TableCell>
                            <TableCell className="text-xs hidden sm:table-cell">{candidate.email || '—'}</TableCell>
                            <TableCell className="text-xs hidden md:table-cell">{candidate.role || '—'}</TableCell>
                            <TableCell className="text-xs hidden lg:table-cell">{candidate.location || '—'}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-xs ${statusColors[candidate.status] || ''}`}
                              >
                                {candidate.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs hidden xl:table-cell max-w-[150px] truncate" title={candidate.notes || ''}>
                              {candidate.notes || '—'}
                            </TableCell>
                            <TableCell className="text-xs hidden xl:table-cell max-w-[150px] truncate" title={candidate.lastDisposition || ''}>
                              {candidate.lastDisposition || '—'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Result count */}
              {!listCandidatesLoading[selectedList.id] && (
                <p className="text-xs text-muted-foreground text-right">
                  Showing {getFilteredCandidates(selectedList).length} of {listCandidatesMap[selectedList.id]?.length || selectedList.candidates.length} candidates
                  {candidateSearch && ' (filtered)'}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
