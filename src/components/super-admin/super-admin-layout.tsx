'use client'

import React, { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApprovalPendingCount } from '@/hooks/useApprovalPendingCount'
import { cn } from '@/lib/utils'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from '@/components/ui/sidebar'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, Building2, CreditCard, Settings,
  Menu, Shield, LogOut, MoreHorizontal,
  BarChart3, Activity, Tag, PhoneCall, MessageSquare,
  Users, UserCheck, Megaphone, Settings2, Palette, DatabaseBackup,
  ChevronRight, Clock, Bell, GitBranch,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface MenuItem {
  key: string
  label: string
  icon: LucideIcon
  section: 'platform' | 'company'
}

const platformMenuItems: MenuItem[] = [
  { key: 'platform-dashboard', label: 'Platform Dashboard', icon: LayoutDashboard, section: 'platform' },
  { key: 'organizations', label: 'Organizations', icon: Building2, section: 'platform' },
  { key: 'plans', label: 'Subscription Plans', icon: CreditCard, section: 'platform' },
  { key: 'platform-settings', label: 'Platform Settings', icon: Settings, section: 'platform' },
  { key: 'backup-restore', label: 'Backup & Restore', icon: DatabaseBackup, section: 'platform' },
]

const teamPerformanceChildren = [
  { key: 'team-performance', label: 'Call Reports', icon: BarChart3, section: 'company' as const },
  { key: 'team-performance/pipeline', label: 'Pipeline', icon: GitBranch, section: 'company' as const },
]

const companyMenuItems: MenuItem[] = [
  { key: 'admin-dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'company' },
  { key: 'approvals', label: 'Approval Requests', icon: UserCheck, section: 'company' },
  { key: 'team-performance', label: 'Team Performance', icon: BarChart3, section: 'company', isGroup: true },
  { key: 'team-monitoring', label: 'Team Monitoring', icon: Activity, section: 'company' },
  { key: 'shift-management', label: 'Shift Management', icon: Clock, section: 'company' },
  { key: 'dispositions', label: 'Disposition', icon: Tag, section: 'company' },
  { key: 'call-lists', label: 'Calling List', icon: PhoneCall, section: 'company' },
  { key: 'templates', label: 'Message Templates', icon: MessageSquare, section: 'company' },
  { key: 'clients', label: 'Client Name', icon: Building2, section: 'company' },
  { key: 'announcements', label: 'Announcements', icon: Megaphone, section: 'company' },
  { key: 'users', label: 'User Management', icon: Users, section: 'company' },
  { key: 'team-management', label: 'Team Management', icon: Users, section: 'company' },
  { key: 'field-builder', label: 'Field Builder', icon: Settings2, section: 'company' },
  { key: 'disposition-builder', label: 'Custom Dispositions', icon: Palette, section: 'company' },
  { key: 'admin-settings', label: 'Settings', icon: Settings, section: 'company' },
  { key: 'organization-settings', label: 'Organization Settings', icon: Building2, section: 'company' },
]

const allMenuItems = [...companyMenuItems, ...platformMenuItems]

// Flat list for mobile bottom nav (team-performance children are expanded)
const flatAllMenuItems: MenuItem[] = [
  ...companyMenuItems.filter(i => !('isGroup' in i)),
  ...teamPerformanceChildren,
  ...platformMenuItems,
]

// First 5 items shown directly in bottom nav
const bottomNavItems = flatAllMenuItems.slice(0, 5)
// Remaining items shown in "More" popover
const moreNavItems = flatAllMenuItems.slice(5)

interface SuperAdminLayoutProps {
  activePage: string
  onNavigate: (page: string) => void
  onLogout: () => void
  children: React.ReactNode
}

export function SuperAdminLayout({ activePage, onNavigate, onLogout, children }: SuperAdminLayoutProps) {
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const [moreOpen, setMoreOpen] = useState(false)
  const [platformSectionOpen, setPlatformSectionOpen] = useState(false)
  const [tpSectionOpen, setTpSectionOpen] = useState(activePage.startsWith('team-performance'))
  const approvalCount = useApprovalPendingCount()
  const hasApprovals = approvalCount !== null && approvalCount > 0

  const isTpActive = activePage.startsWith('team-performance')

  const sidebarContent = (
    <>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-violet-600 text-white shrink-0">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-sm truncate">RecruitPro Platform</h2>
            <p className="text-xs text-muted-foreground">Super Admin</p>
          </div>
        </div>
      </SidebarHeader>
      <Separator />
      <SidebarContent className="overflow-y-auto">
        {/* Company Management Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Company Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {companyMenuItems.map((item) => {
                // Handle Team Performance as a collapsible group
                if ('isGroup' in item && item.isGroup) {
                  return (
                    <React.Fragment key={item.key}>
                      <div
                        className="flex items-center h-8 rounded-md px-2 cursor-pointer select-none hover:bg-sidebar-accent transition-colors"
                        onClick={() => setTpSectionOpen(!tpSectionOpen)}
                      >
                        <ChevronRight
                          className={cn(
                            'h-4 w-4 mr-1 shrink-0 transition-transform duration-200 text-sidebar-foreground/70',
                            tpSectionOpen && 'rotate-90'
                          )}
                        />
                        <item.icon className={cn('h-4 w-4 mr-2 shrink-0', isTpActive && 'text-emerald-600')} />
                        <span className={cn('text-sm font-medium', isTpActive && 'text-emerald-700 dark:text-emerald-400')}>{item.label}</span>
                      </div>
                      <div
                        className={cn(
                          'overflow-hidden transition-all duration-200 ease-in-out',
                          tpSectionOpen ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0'
                        )}
                      >
                        <SidebarMenu>
                          {teamPerformanceChildren.map((child) => (
                            <SidebarMenuItem key={child.key}>
                              <SidebarMenuButton
                                isActive={activePage === child.key}
                                onClick={() => onNavigate(child.key)}
                                className={cn(
                                  'cursor-pointer pl-8',
                                  activePage === child.key && 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600/15'
                                )}
                              >
                                <child.icon className={cn('h-4 w-4', activePage === child.key && 'text-emerald-600')} />
                                <span>{child.label}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      </div>
                    </React.Fragment>
                  )
                }

                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={activePage === item.key}
                      onClick={() => onNavigate(item.key)}
                      className={cn(
                        'cursor-pointer',
                        activePage === item.key && 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600/15'
                      )}
                    >
                      <item.icon className={cn('h-4 w-4', activePage === item.key && 'text-emerald-600')} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.key === 'approvals' && hasApprovals && (
                      <SidebarMenuBadge className="bg-amber-500 text-white hover:bg-amber-500">
                        {approvalCount! > 99 ? '99+' : approvalCount}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="mx-4 w-auto" />

        {/* Platform Management Section - Collapsible */}
        <SidebarGroup>
          <div
            className="flex items-center h-8 rounded-md px-2 cursor-pointer select-none hover:bg-sidebar-accent transition-colors"
            onClick={() => setPlatformSectionOpen(!platformSectionOpen)}
          >
            <ChevronRight
              className={cn(
                'h-4 w-4 mr-1 shrink-0 transition-transform duration-200 text-sidebar-foreground/70',
                platformSectionOpen && 'rotate-90'
              )}
            />
            <span className="text-xs font-medium text-sidebar-foreground/70">Platform Management</span>
          </div>
          <div
            className={cn(
              'overflow-hidden transition-all duration-200 ease-in-out',
              platformSectionOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
            )}
          >
            <SidebarGroupContent>
              <SidebarMenu>
                {platformMenuItems.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={activePage === item.key}
                      onClick={() => onNavigate(item.key)}
                      className={cn(
                        'cursor-pointer',
                        activePage === item.key && 'bg-violet-600/10 text-violet-700 dark:text-violet-400 hover:bg-violet-600/15'
                      )}
                    >
                      <item.icon className={cn('h-4 w-4', activePage === item.key && 'text-violet-600')} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </div>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Separator />
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-sm font-semibold">
                {user?.name?.charAt(0)?.toUpperCase() || 'S'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user?.name || 'Super Admin'}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email || ''}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950" onClick={onLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </SidebarFooter>
    </>
  )

  // Shared header notification bell
  const headerRight = (
    <div className="flex items-center gap-1 ml-auto">
      <Button
        variant="ghost"
        size="icon"
        className="relative shrink-0"
        onClick={() => onNavigate('approvals')}
      >
        <Bell className="h-4 w-4" />
        {hasApprovals && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold leading-none px-1">
            {approvalCount! > 9 ? '9+' : approvalCount}
          </span>
        )}
      </Button>
    </div>
  )

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0 relative">
                <Menu className="h-5 w-5" />
                {hasApprovals && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-amber-500 text-white text-[8px] font-bold leading-none px-0.5">
                    {approvalCount! > 9 ? '9+' : approvalCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="flex flex-col h-full pt-4">
                {sidebarContent}
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2 flex-1">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-violet-600 text-white">
              <Shield className="h-4 w-4" />
            </div>
            <span className="font-semibold text-sm">RecruitPro Platform</span>
          </div>
          {headerRight}
        </header>
        <main className="p-4 pb-28">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
        <nav className="fixed bottom-0 left-0 right-0 z-[9999] border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-around px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {bottomNavItems.map((item) => (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 min-w-[52px] min-h-[44px] transition-colors text-[10px] font-medium leading-none relative',
                  activePage === item.key
                    ? item.section === 'platform' ? 'text-violet-600' : 'text-emerald-600'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="truncate max-w-[56px]">{item.label.split(' ')[0]}</span>
                {item.key === 'approvals' && hasApprovals && (
                  <span className="absolute top-1 right-1 flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-amber-500 text-white text-[8px] font-bold leading-none px-0.5">
                    {approvalCount! > 9 ? '9+' : approvalCount}
                  </span>
                )}
              </button>
            ))}
            {/* More menu for remaining items */}
            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 min-w-[52px] min-h-[44px] transition-colors text-[10px] font-medium leading-none relative',
                    moreNavItems.some(item => item.key === activePage)
                      ? 'text-emerald-600'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <MoreHorizontal className="h-5 w-5" />
                  <span>More</span>
                  {hasApprovals && (
                    <span className="absolute top-1 right-1 flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-amber-500 text-white text-[8px] font-bold leading-none px-0.5">
                      {approvalCount! > 9 ? '9+' : approvalCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="center" className="w-64 p-2 mb-2 max-h-80 overflow-y-auto">
                <div className="space-y-1">
                  {moreNavItems.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => {
                        onNavigate(item.key)
                        setMoreOpen(false)
                      }}
                      className={cn(
                        'flex items-center gap-3 w-full rounded-md px-3 py-2.5 text-sm transition-colors',
                        activePage === item.key
                          ? item.section === 'platform'
                            ? 'bg-violet-600/10 text-violet-700 dark:text-violet-400'
                            : 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
                          : 'text-foreground hover:bg-muted'
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.key === 'approvals' && hasApprovals && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none px-1.5 tabular-nums">
                          {approvalCount! > 99 ? '99+' : approvalCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </nav>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        {sidebarContent}
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 py-3">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-7 w-7 rounded-md bg-violet-600 text-white">
              <Shield className="h-3.5 w-3.5" />
            </div>
            <span className="font-semibold text-sm">RecruitPro Platform</span>
          </div>
          {headerRight}
        </header>
        <main className="flex-1 p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
