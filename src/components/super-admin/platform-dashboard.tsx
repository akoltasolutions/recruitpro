'use client'

import { StatsCard } from '@/components/shared/stats-card'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  LayoutDashboard, Building2, Users, CreditCard, IndianRupee,
} from 'lucide-react'

// ─── Placeholder Data ─────────────────────────────────────────────────────

interface RecentOrg {
  id: string
  name: string
  email: string
  plan: string
  status: string
  usersCount: number
  createdAt: string
}

const placeholderOrgs: RecentOrg[] = [
  {
    id: '1',
    name: 'TechCorp Solutions',
    email: 'admin@techcorp.com',
    plan: 'Business',
    status: 'ACTIVE',
    usersCount: 32,
    createdAt: '2025-01-15',
  },
  {
    id: '2',
    name: 'HireFast Inc.',
    email: 'info@hirefast.io',
    plan: 'Enterprise',
    status: 'ACTIVE',
    usersCount: 87,
    createdAt: '2024-11-20',
  },
  {
    id: '3',
    name: 'RecruitNow Services',
    email: 'hello@recruitnow.com',
    plan: 'Starter',
    status: 'TRIAL',
    usersCount: 6,
    createdAt: '2025-03-02',
  },
  {
    id: '4',
    name: 'PeopleFirst HR',
    email: 'contact@peoplefirst.co',
    plan: 'Business',
    status: 'ACTIVE',
    usersCount: 45,
    createdAt: '2024-09-10',
  },
  {
    id: '5',
    name: 'StaffWise Agency',
    email: 'ops@staffwise.com',
    plan: 'Free',
    status: 'ACTIVE',
    usersCount: 2,
    createdAt: '2025-02-28',
  },
  {
    id: '6',
    name: 'GlobalTalent Partners',
    email: 'admin@globaltalent.com',
    plan: 'Enterprise',
    status: 'SUSPENDED',
    usersCount: 120,
    createdAt: '2024-06-15',
  },
]

// ─── Badge Helpers ──────────────────────────────────────────────────────────

function OrgStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'ACTIVE':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
          Active
        </Badge>
      )
    case 'TRIAL':
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800">
          Trial
        </Badge>
      )
    case 'SUSPENDED':
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:border-red-800">
          Suspended
        </Badge>
      )
    case 'CANCELLED':
      return (
        <Badge className="bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
          Cancelled
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PlatformDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Dashboard"
        description="Overview of all organizations and platform metrics"
        icon={LayoutDashboard}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Organizations"
          value={156}
          icon={Building2}
          description="Registered organizations"
          iconColor="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
        />
        <StatsCard
          title="Total Users"
          value={2_847}
          icon={Users}
          description="Across all organizations"
          iconColor="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
        />
        <StatsCard
          title="Active Subscriptions"
          value={134}
          icon={CreditCard}
          description="Paying organizations"
          iconColor="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400"
        />
        <StatsCard
          title="Monthly Revenue"
          value="₹4,52,300"
          icon={IndianRupee}
          description="This month"
          iconColor="bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400"
        />
      </div>

      {/* Recent Organizations Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Recent Organizations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Desktop Table */}
          <div className="hidden md:block rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {placeholderOrgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell className="text-muted-foreground">{org.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{org.plan}</Badge>
                    </TableCell>
                    <TableCell>
                      <OrgStatusBadge status={org.status} />
                    </TableCell>
                    <TableCell className="text-right font-medium">{org.usersCount}</TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell">
                      {new Date(org.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {placeholderOrgs.map((org) => (
              <div key={org.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium text-sm">{org.name}</p>
                    <p className="text-xs text-muted-foreground">{org.email}</p>
                  </div>
                  <OrgStatusBadge status={org.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
                  <span><Badge variant="outline" className="text-xs">{org.plan}</Badge></span>
                  <span>{org.usersCount} users</span>
                  <span>{new Date(org.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
