'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Monitor,
  Phone,
  Coffee,
  Clock,
  UserX,
  Play,
  Pause,
  RefreshCw,
  Users,
  Timer,
  Activity,
  Moon,
  FileSpreadsheet,
} from 'lucide-react';
import { authFetch } from '@/stores/auth-store';
import { formatDistanceToNow } from 'date-fns';
import { RecruiterReport } from '@/components/admin/recruiter-report';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveStatus {
  userId: string;
  name: string;
  status: 'ACTIVE' | 'LAUNCH' | 'ON_CALL' | 'ON_BREAK' | 'IDLE' | 'OFFLINE';
  lastActivity: string | null;
  totalHoursToday: number;
  loginTime: string | null;
  breakStartTime: string | null;
  totalBreakDurationToday: number;
  totalActiveDurationToday: number;
}

interface TeamStatusResponse {
  team: LiveStatus[];
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type StatusKey = LiveStatus['status'];

const STATUS_CONFIG: Record<
  StatusKey,
  { emoji: string; label: string; color: string; bgClass: string; textClass: string; icon: typeof Monitor }
> = {
  ACTIVE: {
    emoji: '✅',
    label: 'Active',
    color: 'emerald',
    bgClass: 'bg-emerald-100 dark:bg-emerald-950',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    icon: Activity,
  },
  LAUNCH: {
    emoji: '🚀',
    label: 'Launch',
    color: 'blue',
    bgClass: 'bg-blue-100 dark:bg-blue-950',
    textClass: 'text-blue-700 dark:text-blue-300',
    icon: Play,
  },
  ON_CALL: {
    emoji: '📞',
    label: 'On Call',
    color: 'blue',
    bgClass: 'bg-blue-100 dark:bg-blue-950',
    textClass: 'text-blue-700 dark:text-blue-300',
    icon: Phone,
  },
  ON_BREAK: {
    emoji: '☕',
    label: 'Break',
    color: 'amber',
    bgClass: 'bg-amber-100 dark:bg-amber-950',
    textClass: 'text-amber-700 dark:text-amber-300',
    icon: Coffee,
  },
  IDLE: {
    emoji: '😴',
    label: 'Idle',
    color: 'slate',
    bgClass: 'bg-slate-100 dark:bg-slate-950',
    textClass: 'text-slate-600 dark:text-slate-400',
    icon: Moon,
  },
  OFFLINE: {
    emoji: '⚪',
    label: 'Offline',
    color: 'gray',
    bgClass: 'bg-gray-100 dark:bg-gray-950',
    textClass: 'text-gray-600 dark:text-gray-400',
    icon: UserX,
  },
};

function getStatusBadgeVariant(status: StatusKey) {
  const map: Record<StatusKey, 'default' | 'secondary' | 'outline' | 'destructive'> = {
    ACTIVE: 'default',
    LAUNCH: 'default',
    ON_CALL: 'default',
    ON_BREAK: 'secondary',
    IDLE: 'secondary',
    OFFLINE: 'outline',
  };
  return map[status] || 'outline';
}

// ---------------------------------------------------------------------------
// Utility formatters
// ---------------------------------------------------------------------------

function formatHours(decimal: number): string {
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  if (h === 0 && m === 0) return '0m';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '—';
  }
}

function formatLoginTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-[140px]" />
            <Skeleton className="h-3 w-[100px]" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-4 w-16 hidden sm:block" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function MobileCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-44 rounded-xl" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type MonitoringTab = 'live' | 'reports';

export function TeamMonitoring() {
  const [activeTab, setActiveTab] = useState<MonitoringTab>('live');
  const [statuses, setStatuses] = useState<LiveStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchStatuses = useCallback(async () => {
    try {
      // Use the accurate /api/user-status/team endpoint (proper idle/break tracking)
      const res = await authFetch('/api/user-status/team');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const team = data.team || [];
      // Map API response to LiveStatus format
      const mapped: LiveStatus[] = team.map((m: Record<string, unknown>) => ({
        userId: m.userId as string,
        name: m.name as string,
        status: (m.status as LiveStatus['status']) || 'OFFLINE',
        lastActivity: m.lastActivity as string | null,
        totalHoursToday: Math.round(((m.totalActiveDurationToday as number) || 0) / 3600 * 100) / 100,
        loginTime: m.loginTime as string | null,
        breakStartTime: (m.breakStartTime as string | null) || null,
        totalBreakDurationToday: (m.totalBreakDurationToday as number) || 0,
        totalActiveDurationToday: (m.totalActiveDurationToday as number) || 0,
      }));
      setStatuses(mapped);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch team status:', err);
      setError('Failed to load team activity. Please try again.');
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchStatuses, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  // -----------------------------------------------------------------------
  // Break / Resume toggle
  // -----------------------------------------------------------------------

  const handleToggleBreak = async (recruiter: LiveStatus) => {
    const goingOnBreak = recruiter.status !== 'ON_BREAK';
    setTogglingUserId(recruiter.userId);

    try {
      const res = await authFetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: goingOnBreak ? 'BREAK_START' : 'BREAK_END',
          status: goingOnBreak ? 'ON_BREAK' : 'ACTIVE',
          metadata: { targetUserId: recruiter.userId },
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Optimistic update
      setStatuses((prev) =>
        prev.map((s) =>
          s.userId === recruiter.userId
            ? { ...s, status: goingOnBreak ? 'ON_BREAK' : ('ACTIVE' as StatusKey) }
            : s,
        ),
      );
    } catch (err) {
      console.error('Failed to toggle break:', err);
    } finally {
      setTogglingUserId(null);
    }
  };

  // -----------------------------------------------------------------------
  // Summary counts
  // -----------------------------------------------------------------------

  const counts = statuses.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<StatusKey, number>>,
  );

  const summaryCards: { key: StatusKey; label: string; icon: typeof Monitor }[] = [
    { key: 'ACTIVE', label: 'Active', icon: Activity },
    { key: 'LAUNCH', label: 'Launch', icon: Play },
    { key: 'ON_CALL', label: 'On Call', icon: Phone },
    { key: 'ON_BREAK', label: 'Break', icon: Coffee },
    { key: 'IDLE', label: 'Idle', icon: Clock },
    { key: 'OFFLINE', label: 'Offline', icon: UserX },
  ];

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const isOffline = (status: StatusKey) => status === 'OFFLINE';

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950">
            <Monitor className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Team Monitoring</h2>
            <p className="text-sm text-muted-foreground">Real-time recruiter activity tracking</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setActiveTab('live')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'live'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Live Status</span>
            <span className="sm:hidden">Live</span>
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'reports'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export Reports</span>
            <span className="sm:hidden">Reports</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground hidden sm:inline-flex items-center gap-1">
              <Timer className="h-3 w-3" />
              Updated {relativeTime(lastRefresh.toISOString())}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              fetchStatuses();
            }}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Reports Tab ──────────────────────────────────────────────── */}
      {activeTab === 'reports' && <RecruiterReport />}

      {/* ── Live Status Tab ────────────────────────────────────────────── */}
      {activeTab === 'live' && <>
      {/* ── Summary cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {summaryCards.map(({ key, label, icon: Icon }) => {
          const cfg = STATUS_CONFIG[key];
          return (
            <Card key={key} className={`${cfg.bgClass} border-0`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${cfg.textClass}`} />
                  <span className={`text-sm font-medium ${cfg.textClass}`}>{label}</span>
                </div>
                <p className="text-2xl font-bold mt-1">{counts[key] ?? 0}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Error state ────────────────────────────────────────────────── */}
      {error && (
        <Card className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950">
          <CardContent className="p-4 flex items-center justify-between">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchStatuses}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Loading state ──────────────────────────────────────────────── */}
      {loading && (
        <>
          <MobileCardSkeleton />
          <div className="hidden lg:block">
            <Card>
              <CardContent className="p-6">
                <TableSkeleton />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!loading && statuses.length === 0 && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">No team members found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Recruiters will appear here once they log in.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Mobile cards (visible on < lg) ────────────────────────────── */}
      {!loading && statuses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
          {statuses.map((recruiter) => {
            const cfg = STATUS_CONFIG[recruiter.status];
            const StatusIcon = cfg.icon;
            const offline = isOffline(recruiter.status);
            const toggling = togglingUserId === recruiter.userId;

            return (
              <Card key={recruiter.userId} className="overflow-hidden">
                {/* Status bar */}
                <div className={`h-1 ${cfg.bgClass}`} />
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: avatar + name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${cfg.bgClass} ${cfg.textClass}`}
                        >
                          {recruiter.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 text-xs leading-none">
                          {cfg.emoji}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{recruiter.name}</p>
                        <div className={`inline-flex items-center gap-1 text-xs ${cfg.textClass}`}>
                          <StatusIcon className="h-3 w-3" />
                          {cfg.label}
                        </div>
                      </div>
                    </div>

                    {/* Action button */}
                    {!offline && (
                      <Button
                        size="sm"
                        variant={recruiter.status === 'ON_BREAK' ? 'default' : 'outline'}
                        onClick={() => handleToggleBreak(recruiter)}
                        disabled={toggling}
                        className={
                          recruiter.status === 'ON_BREAK'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shrink-0'
                            : 'shrink-0'
                        }
                      >
                        {toggling ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : recruiter.status === 'ON_BREAK' ? (
                          <>
                            <Play className="h-3.5 w-3.5 mr-1" />
                            Resume
                          </>
                        ) : (
                          <>
                            <Pause className="h-3.5 w-3.5 mr-1" />
                            Break
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      In: {formatLoginTime(recruiter.loginTime)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Timer className="h-3 w-3" />
                      {formatHours(recruiter.totalHoursToday)}
                    </span>
                    {recruiter.lastActivity && (
                      <span className="inline-flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        {relativeTime(recruiter.lastActivity)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Desktop table (visible on lg+) ───────────────────────────── */}
      {!loading && statuses.length > 0 && (
        <Card className="hidden lg:block">
          <CardContent className="p-0">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] items-center gap-4 border-b px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span>Recruiter</span>
              <span>Status</span>
              <span>Login Time</span>
              <span>Hours Today</span>
              <span>Last Activity</span>
              <span className="text-right">Action</span>
            </div>

            {/* Table body with scroll */}
            <div className="max-h-[520px] overflow-y-auto">
              {statuses.map((recruiter, idx) => {
                const cfg = STATUS_CONFIG[recruiter.status];
                const StatusIcon = cfg.icon;
                const offline = isOffline(recruiter.status);
                const toggling = togglingUserId === recruiter.userId;

                return (
                  <div
                    key={recruiter.userId}
                    className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] items-center gap-4 px-6 py-3 text-sm ${
                      idx !== statuses.length - 1 ? 'border-b' : ''
                    } hover:bg-muted/50 transition-colors`}
                  >
                    {/* Recruiter name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${cfg.bgClass} ${cfg.textClass}`}
                        >
                          {recruiter.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 text-[10px] leading-none">
                          {cfg.emoji}
                        </span>
                      </div>
                      <span className="font-medium truncate">{recruiter.name}</span>
                    </div>

                    {/* Status badge */}
                    <div>
                      <Badge
                        variant={getStatusBadgeVariant(recruiter.status)}
                        className={`${cfg.bgClass} ${cfg.textClass} border-0 gap-1`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {cfg.label}
                      </Badge>
                    </div>

                    {/* Login time */}
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      {formatLoginTime(recruiter.loginTime)}
                    </span>

                    {/* Hours today */}
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <Timer className="h-3.5 w-3.5 shrink-0" />
                      {formatHours(recruiter.totalHoursToday)}
                    </span>

                    {/* Last activity */}
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <Activity className="h-3.5 w-3.5 shrink-0" />
                      {relativeTime(recruiter.lastActivity)}
                    </span>

                    {/* Action button */}
                    <div className="text-right">
                      {!offline ? (
                        <Button
                          size="sm"
                          variant={recruiter.status === 'ON_BREAK' ? 'default' : 'outline'}
                          onClick={() => handleToggleBreak(recruiter)}
                          disabled={toggling}
                          className={
                            recruiter.status === 'ON_BREAK'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : ''
                          }
                        >
                          {toggling ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : recruiter.status === 'ON_BREAK' ? (
                            <>
                              <Play className="h-3.5 w-3.5 mr-1" />
                              Resume
                            </>
                          ) : (
                            <>
                              <Pause className="h-3.5 w-3.5 mr-1" />
                              Break
                            </>
                          )}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      </>}
    </div>
  );
}
