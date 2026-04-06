'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from '@/components/ui/sidebar'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard, Tag, PhoneCall, MessageSquare, Building2, Users, LogOut,
  Menu, Headphones, BarChart3, UserCheck, Activity, Settings, Megaphone,
} from 'lucide-react'

const menuItems = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'team-performance', label: 'Team Performance', icon: BarChart3 },
  { key: 'team-monitoring', label: 'Team Monitoring', icon: Activity },
  { key: 'dispositions', label: 'Disposition', icon: Tag },
  { key: 'call-lists', label: 'Call List', icon: PhoneCall },
  { key: 'templates', label: 'Message Templates', icon: MessageSquare },
  { key: 'clients', label: 'Client Name', icon: Building2 },
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
  { key: 'users', label: 'User Management', icon: Users },
  { key: 'approvals', label: 'Approval Requests', icon: UserCheck },
  { key: 'settings', label: 'Settings', icon: Settings },
]

interface AdminLayoutProps {
  activePage: string
  onNavigate: (page: string) => void
  onLogout: () => void
  children: React.ReactNode
}

export function AdminLayout({ activePage, onNavigate, onLogout, children }: AdminLayoutProps) {
  const { user } = useAuthStore()
  const isMobile = useIsMobile()

  const sidebarContent = (
    <>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-emerald-600 text-white shrink-0">
            <Headphones className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-sm truncate">RecruitPro</h2>
            <p className="text-xs text-muted-foreground">Admin Panel</p>
          </div>
        </div>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
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
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Separator />
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-sm font-semibold">
                {user?.name?.charAt(0)?.toUpperCase() || 'A'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user?.name || 'Admin'}</p>
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

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 flex items-center gap-2 border-b bg-background px-4 py-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="flex flex-col h-full pt-4">
                {sidebarContent}
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-600 text-white">
              <Headphones className="h-4 w-4" />
            </div>
            <span className="font-semibold text-sm">RecruitPro</span>
          </div>
        </header>
        <main className="p-4 pb-24">{children}</main>
        <nav className="fixed bottom-0 left-0 right-0 z-[10000] border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-around px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {menuItems.slice(0, 5).map((item) => (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 min-w-[52px] min-h-[44px] transition-colors text-[10px] font-medium leading-none',
                  activePage === item.key ? 'text-emerald-600' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="truncate max-w-[56px]">{item.label.split(' ')[0]}</span>
              </button>
            ))}
            <button
              onClick={() => onNavigate('users')}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 min-w-[52px] min-h-[44px] transition-colors text-[10px] font-medium leading-none',
                activePage === 'users' ? 'text-emerald-600' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Users className="h-5 w-5" />
              <span>Users</span>
            </button>
            <button
              onClick={() => onNavigate('approvals')}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 min-w-[52px] min-h-[44px] transition-colors text-[10px] font-medium leading-none',
                activePage === 'approvals' ? 'text-emerald-600' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <UserCheck className="h-5 w-5" />
              <span>Approvals</span>
            </button>
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
        <header className="flex items-center gap-2 border-b px-6 py-3">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-7 w-7 rounded-md bg-emerald-600 text-white">
              <Headphones className="h-3.5 w-3.5" />
            </div>
            <span className="font-semibold text-sm">RecruitPro Admin</span>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
