'use client'

import { useState, useEffect, useCallback } from 'react'
import { StatsCard } from '@/components/shared/stats-card'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  PhoneCall, Clock, CheckCircle, XCircle, MessageSquare, LayoutDashboard,
  TrendingUp, Trophy,
} from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'

function formatTime(seconds: number): string {
  if (seconds < 0) seconds = 0
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hrs > 0) return `${hrs}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

interface DashboardData {
  totalCalls: number
  totalCallDuration: number
  avgCallTime: number
  shortlistedCount: number
  notConnectedCount: number
  whatsappCount: number
  dailyData: { date: string; calls: number }[]
  shortlistedByClient: Record<string, number>
  recruiterAnalytics: Array<{
    id: string; name: string; totalCalls: number; totalDuration: number
    avgCallTime: number; activeTime: number; productivity: number; shortlistedCount: number
  }>
  leaderboard: Array<{
    id: string; name: string; totalCalls: number; totalDuration: number
    avgCallTime: number; activeTime: number; productivity: number
  }>
  period: { from: string; to: string }
}

export function AdminDashboard() {
  const [period, setPeriod] = useState('daily')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    try {
      let url = `/api/dashboard?period=${period}`
      if (period === 'custom' && customFrom && customTo) {
        url += `&from=${new Date(customFrom).toISOString()}&to=${new Date(customTo).toISOString()}`
      }
      const res = await authFetch(url)
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json)
    } catch {
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [period, customFrom, customTo])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const chartData = data?.dailyData?.map(d => ({ ...d, date: d.date })) || []

  return (
    <div>
      <PageHeader title="Dashboard" description="Analytics overview" icon={LayoutDashboard}>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-[130px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom</option>
          </select>
          {period === 'custom' && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button size="sm" onClick={fetchDashboard} disabled={!customFrom || !customTo}>Apply</Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={fetchDashboard}>
            <TrendingUp className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </PageHeader>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
            <StatsCard
              title="Total Calls"
              value={data?.totalCalls ?? 0}
              icon={PhoneCall}
              description="Completed calls"
              iconColor="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
            />
            <StatsCard
              title="Avg Call Time"
              value={formatTime(data?.avgCallTime ?? 0)}
              icon={Clock}
              description="Per call average"
              iconColor="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
            />
            <StatsCard
              title="Total Call Duration"
              value={formatTime(data?.totalCallDuration ?? 0)}
              icon={Clock}
              description="Cumulative time"
              iconColor="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400"
            />
            <StatsCard
              title="Shortlisted"
              value={data?.shortlistedCount ?? 0}
              icon={CheckCircle}
              description="Successful referrals"
              iconColor="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
            />
            <StatsCard
              title="Not Connected"
              value={data?.notConnectedCount ?? 0}
              icon={XCircle}
              description="Failed attempts"
              iconColor="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
            />
            <StatsCard
              title="WhatsApp Sent"
              value={data?.whatsappCount ?? 0}
              icon={MessageSquare}
              description="Messages delivered"
              iconColor="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Call Trend Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Call Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          color: 'hsl(var(--popover-foreground))',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="calls"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.15}
                        strokeWidth={2}
                        name="Calls"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Recruiter Performance Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Recruiter Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(data?.recruiterAnalytics || []).slice(0, 6)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          color: 'hsl(var(--popover-foreground))',
                        }}
                      />
                      <Legend />
                      <Bar dataKey="totalCalls" name="Calls" fill="#10b981" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="shortlistedCount" name="Shortlisted" fill="#059669" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Shortlisted by Client */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Shortlisted by Client</CardTitle>
              </CardHeader>
              <CardContent>
                {data?.shortlistedByClient && Object.keys(data.shortlistedByClient).length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(data.shortlistedByClient)
                      .sort(([, a], [, b]) => b - a)
                      .map(([client, count]) => {
                        const max = Math.max(...Object.values(data.shortlistedByClient))
                        const pct = max > 0 ? (count / max) * 100 : 0
                        return (
                          <div key={client} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">{client}</span>
                              <span className="text-muted-foreground">{count}</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">No shortlisted candidates yet</p>
                )}
              </CardContent>
            </Card>

            {/* Leaderboard */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" /> Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data?.leaderboard && data.leaderboard.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Recruiter</TableHead>
                        <TableHead className="text-right">Calls</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Duration</TableHead>
                        <TableHead className="text-right hidden md:table-cell">Productivity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.leaderboard.slice(0, 5).map((r, i) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <Badge variant={i === 0 ? 'default' : i === 1 ? 'secondary' : 'outline'} className="w-6 h-6 justify-center rounded-full p-0 text-xs">
                              {i + 1}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-right font-semibold">{r.totalCalls}</TableCell>
                          <TableCell className="text-right text-muted-foreground hidden sm:table-cell">{formatTime(r.totalDuration)}</TableCell>
                          <TableCell className="text-right hidden md:table-cell">
                            <Badge variant={r.productivity > 1 ? 'default' : 'secondary'} className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                              {r.productivity}/min
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">No recruiter data available</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
