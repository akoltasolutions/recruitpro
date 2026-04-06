'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Rocket, Coffee, CheckCircle, Clock, Play, Pause, RefreshCw, Moon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { authFetch } from '@/stores/auth-store'
import { toast } from 'sonner'
import { useActivityTracker } from '@/hooks/use-activity-tracker'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UserStatus = 'IDLE' | 'LAUNCH' | 'BREAK' | 'ACTIVE' | 'OFFLINE'

interface StatusInfo {
  userId: string
  status: UserStatus
  loginTime: string | null
  totalBreakDurationMs: number
  totalActiveDurationMs: number
  currentBreakStartTime: string | null
}

interface StatusManagementProps {
  onStatusChange?: (status: string) => void
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  {
    label: string
    emoji: string
    bgClass: string
    textClass: string
    badgeBg: string
    activeBtnClass: string
    description: string
  }
> = {
  IDLE: {
    label: 'Idle',
    emoji: '😴',
    bgClass: 'bg-slate-50 dark:bg-slate-950/40',
    textClass: 'text-slate-500 dark:text-slate-400',
    badgeBg: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-950 dark:text-slate-400 dark:border-slate-800',
    activeBtnClass: 'bg-slate-600 hover:bg-slate-700 text-white shadow-sm',
    description: 'No activity',
  },
  LAUNCH: {
    label: 'Launch',
    emoji: '🚀',
    bgClass: 'bg-blue-50 dark:bg-blue-950/40',
    textClass: 'text-blue-700 dark:text-blue-400',
    badgeBg: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
    activeBtnClass: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
    description: 'Shift started',
  },
  BREAK: {
    label: 'Break',
    emoji: '☕',
    bgClass: 'bg-amber-50 dark:bg-amber-950/40',
    textClass: 'text-amber-700 dark:text-amber-400',
    badgeBg: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    activeBtnClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm',
    description: 'Taking a break',
  },
  ACTIVE: {
    label: 'Active',
    emoji: '✅',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/40',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    badgeBg: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    activeBtnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
    description: 'Ready to call',
  },
  OFFLINE: {
    label: 'Select',
    emoji: '⚪',
    bgClass: 'bg-gray-50 dark:bg-gray-950/40',
    textClass: 'text-gray-500',
    badgeBg: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-950 dark:text-gray-400 dark:border-gray-800',
    activeBtnClass: 'bg-gray-600 hover:bg-gray-700 text-white shadow-sm',
    description: 'Select your status',
  },
}

// ---------------------------------------------------------------------------
// Timer hook — counts up every second
// ---------------------------------------------------------------------------

function useCountUp(startTime: string | null, enabled: boolean): number {
  const compute = useCallback((): number => {
    if (!startTime || !enabled) return 0
    return Math.max(0, Date.now() - new Date(startTime).getTime())
  }, [startTime, enabled])

  const [elapsed, setElapsed] = useState(compute)

  useEffect(() => {
    if (!startTime || !enabled) return

    const interval = setInterval(() => setElapsed(compute()), 1000)
    return () => clearInterval(interval)
  }, [compute, startTime, enabled])

  // If disabled, return 0 without triggering effect setState
  if (!startTime || !enabled) return 0

  return elapsed
}

// ---------------------------------------------------------------------------
// Utility formatters
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60

  if (h > 0) {
    if (m > 0) return `${h}h ${m}m ${s}s`
    return `${h}h ${s}s`
  }
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatLoginTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

// ---------------------------------------------------------------------------
// Confirmation Dialog (inline)
// ---------------------------------------------------------------------------

function ConfirmOverlay({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm">
      <Card className="w-72 shadow-lg">
        <CardContent className="p-5 text-center space-y-3">
          <p className="text-sm font-medium">{message}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={onConfirm} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Confirm
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StatusManagement({ onStatusChange }: StatusManagementProps) {
  const [statusInfo, setStatusInfo] = useState<StatusInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<UserStatus | null>(null)
  const mountedRef = useRef(true)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // -----------------------------------------------------------------------
  // Fetch current status
  // -----------------------------------------------------------------------

  const fetchStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/user-status')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: StatusInfo = await res.json()
      if (mountedRef.current) {
        setStatusInfo(data)
      }
    } catch {
      toast.error('Failed to load status')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  // Initial load + auto-refresh every 60s
  useEffect(() => {
    mountedRef.current = true
    fetchStatus()
    refreshTimerRef.current = setInterval(fetchStatus, 60_000)
    return () => {
      mountedRef.current = false
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    }
  }, [fetchStatus])

  // -----------------------------------------------------------------------
  // Activity tracker: auto-idle (20 min no calls) + auto-logout (30 min)
  // -----------------------------------------------------------------------

  const currentStatus = statusInfo?.status || 'OFFLINE'

  const handleAutoIdle = useCallback(() => {
    // When auto-idle fires, refresh status from API
    fetchStatus()
    onStatusChange?.('IDLE')
  }, [fetchStatus, onStatusChange])

  useActivityTracker({
    currentStatus,
    onAutoIdle: handleAutoIdle,
  })

  // -----------------------------------------------------------------------
  // Status switch handler
  // -----------------------------------------------------------------------

  const handleStatusSwitch = useCallback(
    async (target: UserStatus) => {
      // Don't switch to OFFLINE (that's a system status, not user-selectable)
      if (target === 'OFFLINE') {
        setConfirmTarget(null)
        return
      }

      // Don't switch if already on the same status (except LAUNCH can be re-done)
      if (statusInfo && statusInfo.status === target && target !== 'LAUNCH') {
        setConfirmTarget(null)
        return
      }

      setSwitching(true)
      try {
        const res = await authFetch('/api/user-status', {
          method: 'POST',
          body: JSON.stringify({ status: target }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `HTTP ${res.status}`)
        }
        const updated: StatusInfo = await res.json()
        setStatusInfo(updated)
        // Save to localStorage so AutoDialer can check status restriction
        try { localStorage.setItem('recruiter_current_status', target) } catch { /* ignore */ }
        toast.success(`Status changed to ${STATUS_CONFIG[target]?.label || target}`)
        onStatusChange?.(target)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update status')
      } finally {
        setSwitching(false)
        setConfirmTarget(null)
      }
    },
    [statusInfo, onStatusChange],
  )

  // -----------------------------------------------------------------------
  // Live timers
  // -----------------------------------------------------------------------

  // Active timer: counts from when status became ACTIVE (or LAUNCH)
  const activeTimerStart = statusInfo
    ? statusInfo.currentBreakStartTime
      ? null // Currently on break, not active
      : statusInfo.loginTime // Use loginTime as the reference; subtract break time for display
    : null

  const rawActiveElapsed = useCountUp(
    activeTimerStart,
    !!statusInfo && statusInfo.status !== 'OFFLINE' && statusInfo.status !== 'BREAK' && statusInfo.status !== 'IDLE',
  )

  // Calculate actual active duration: totalActiveDurationMs from API + time since last fetch
  const activeElapsedMs = statusInfo
    ? statusInfo.totalActiveDurationMs + (activeTimerStart ? rawActiveElapsed : 0)
    : 0

  // Break timer: counts from when the current break started
  const breakElapsedMs = useCountUp(
    statusInfo?.currentBreakStartTime ?? null,
    statusInfo?.status === 'BREAK',
  )

  // Total break duration today
  const totalBreakTodayMs = statusInfo
    ? statusInfo.status === 'BREAK'
      ? statusInfo.totalBreakDurationMs - breakElapsedMs + breakElapsedMs
      : statusInfo.totalBreakDurationMs
    : 0

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const cfg = STATUS_CONFIG[currentStatus]

  if (loading) {
    return (
      <Card className="relative overflow-hidden">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center gap-3 animate-pulse">
            <div className="h-10 w-10 rounded-lg bg-muted" />
            <div className="space-y-2 flex-1">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-3 w-48 rounded bg-muted" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="relative overflow-hidden">
      {/* Top color bar */}
      <div
        className={`h-1 ${
          currentStatus === 'LAUNCH'
            ? 'bg-blue-500'
            : currentStatus === 'BREAK'
              ? 'bg-amber-500'
              : currentStatus === 'ACTIVE'
                ? 'bg-emerald-500'
                : currentStatus === 'IDLE'
                  ? 'bg-slate-400'
                  : 'bg-gray-300'
        }`}
      />

      <CardContent className="p-4 sm:p-6">
        {/* ── Status Header ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Left: Current status */}
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg ${cfg.bgClass}`}
            >
              {cfg.emoji}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base">Shift Status</h3>
                <Badge
                  variant="outline"
                  className={`text-xs font-medium border ${cfg.badgeBg}`}
                >
                  {cfg.emoji} {cfg.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{cfg.description}</p>
            </div>
          </div>

          {/* Right: Quick stats */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex flex-col items-center sm:items-end">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Login
              </span>
              <span className="font-medium">{formatLoginTime(statusInfo?.loginTime ?? null)}</span>
            </div>
            <div className="flex flex-col items-center sm:items-end">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Pause className="h-3 w-3" />
                Break Total
              </span>
              <span className="font-medium">
                {formatDuration(statusInfo?.totalBreakDurationMs ?? 0)}
              </span>
            </div>
            <div className="flex flex-col items-center sm:items-end">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Play className="h-3 w-3" />
                Active
              </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {currentStatus === 'BREAK' || currentStatus === 'IDLE' || currentStatus === 'OFFLINE'
                  ? formatDuration(statusInfo?.totalActiveDurationMs ?? 0)
                  : formatDuration(activeElapsedMs)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Live Timer Display ────────────────────────────────────── */}
        {(currentStatus === 'ACTIVE' || currentStatus === 'BREAK' || currentStatus === 'LAUNCH') && (
          <div className="mt-4 flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-mono font-medium ${cfg.bgClass} ${cfg.textClass}`}
            >
              {currentStatus === 'BREAK' ? (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  Break: {formatDuration(breakElapsedMs)}
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Active: {formatDuration(activeElapsedMs)}
                </>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">LIVE</span>
          </div>
        )}

        {/* ── Status Buttons ────────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap gap-2">
          {/* Idle button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmTarget('IDLE')}
            disabled={switching}
            className={
              currentStatus === 'IDLE'
                ? STATUS_CONFIG.IDLE.activeBtnClass
                : 'gap-1.5'
            }
          >
            {switching && confirmTarget === 'IDLE' ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
            😴 Idle
          </Button>

          {/* Launch button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmTarget('LAUNCH')}
            disabled={switching}
            className={
              currentStatus === 'LAUNCH'
                ? STATUS_CONFIG.LAUNCH.activeBtnClass
                : 'gap-1.5'
            }
          >
            {switching && confirmTarget === 'LAUNCH' ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            🚀 Launch
          </Button>

          {/* Break button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmTarget('BREAK')}
            disabled={switching || currentStatus === 'OFFLINE'}
            className={
              currentStatus === 'BREAK'
                ? STATUS_CONFIG.BREAK.activeBtnClass
                : 'gap-1.5'
            }
          >
            {switching && confirmTarget === 'BREAK' ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Coffee className="h-3.5 w-3.5" />
            )}
            ☕ Break
          </Button>

          {/* Active button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmTarget('ACTIVE')}
            disabled={switching || currentStatus === 'OFFLINE'}
            className={
              currentStatus === 'ACTIVE'
                ? STATUS_CONFIG.ACTIVE.activeBtnClass
                : 'gap-1.5'
            }
          >
            {switching && confirmTarget === 'ACTIVE' ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle className="h-3.5 w-3.5" />
            )}
            ✅ Active
          </Button>
        </div>
      </CardContent>

      {/* ── Confirmation Overlay ───────────────────────────────────── */}
      {confirmTarget && (
        <ConfirmOverlay
          message={`Switch to ${STATUS_CONFIG[confirmTarget]?.label || confirmTarget}?`}
          onConfirm={() => handleStatusSwitch(confirmTarget)}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </Card>
  )
}
