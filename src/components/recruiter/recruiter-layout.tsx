'use client'

import React, { useState } from 'react'
import {
  Home,
  Clock,
  History,
  Calendar,
  Settings,
  LogOut,
  Headphones,
  ListPlus,
  PhoneCall,
  GitBranch,
  MoreHorizontal,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useIsMobile } from '@/hooks/use-mobile'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
type RecruiterPage = 'home' | 'calling-list' | 'create-list' | 'pending' | 'history' | 'scheduled' | 'pipeline' | 'settings'

interface RecruiterLayoutProps {
  activePage: string
  onNavigate: (page: string) => void
  onLogout: () => void
  children: React.ReactNode
}

const menuItems: { id: RecruiterPage; label: string; icon: React.ElementType; permissionKey?: keyof NonNullable<ReturnType<typeof useAuthStore.getState>['user']> }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'calling-list', label: 'Calling List', icon: PhoneCall },
  { id: 'create-list', label: 'Create List', icon: ListPlus, permissionKey: 'createListPermission' },
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'pipeline', label: 'Pipeline', icon: GitBranch },
  { id: 'history', label: 'History', icon: History },
  { id: 'scheduled', label: 'Scheduled', icon: Calendar },
]

export function RecruiterLayout({ activePage, onNavigate, onLogout, children }: RecruiterLayoutProps) {
  const user = useAuthStore((s) => s.user)
  const isMobile = useIsMobile()
  const [moreOpen, setMoreOpen] = useState(false)

  const userName = user?.name || 'Recruiter'
  const userRole = user?.role || 'RECRUITER'
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const visibleMenuItems = menuItems.filter((item) => {
    if (!item.permissionKey) return true
    return !!user?.[item.permissionKey]
  })

  // First 4 items shown directly in bottom nav (fit 320px+ screens)
  const bottomNavItems = visibleMenuItems.slice(0, 4)
  // Remaining items shown in "More" popover
  const moreNavItems = visibleMenuItems.slice(4)

  return (
    <SidebarProvider>
      {/* Desktop Sidebar */}
      <Sidebar variant="inset" collapsible="icon" className="hidden md:block border-r border-border/50">
        <SidebarHeader className="px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-emerald-600 text-white shrink-0">
              <Headphones className="h-5 w-5" />
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <h2 className="text-sm font-bold text-sidebar-foreground truncate">RecruitPro</h2>
              <p className="text-[11px] text-muted-foreground truncate">Recruitment Manager</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleMenuItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activePage === item.id}
                      onClick={() => onNavigate(item.id)}
                      tooltip={item.label}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarSeparator />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activePage === 'settings'}
                onClick={() => onNavigate('settings')}
                tooltip="Settings"
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onLogout} tooltip="Logout">
                <LogOut className="h-4 w-4 text-red-500" />
                <span className="text-red-500">Logout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <div className="flex items-center gap-3 px-3 py-2 group-data-[collapsible=icon]:justify-center">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{userName}</p>
              <p className="text-[11px] text-muted-foreground truncate">{userRole}</p>
            </div>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      {/* Main content area */}
      <SidebarInset>
        <div className="flex flex-col min-h-screen">
          {/* Top bar for mobile */}
          {isMobile && (
            <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-600 text-white">
                <Headphones className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-foreground truncate">RecruitPro</h2>
                <p className="text-[11px] text-muted-foreground truncate">{userName} &middot; {userRole}</p>
              </div>
            </header>
          )}

          {/* Main content — bottom padding accounts for fixed nav + safe area */}
          <main className={cn('flex-1', isMobile ? 'p-4 pb-28' : 'p-6')}>
            {children}
          </main>

          {/* Mobile Bottom Navigation */}
          {isMobile && (
            <nav className="fixed bottom-0 left-0 right-0 z-[9999] border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex items-center justify-around px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                {bottomNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 min-w-[52px] min-h-[44px] transition-colors text-[10px] font-medium leading-none relative',
                      activePage === item.id ? 'text-emerald-600' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="truncate max-w-[56px]">{item.label.split(' ')[0]}</span>
                  </button>
                ))}

                {/* More menu for remaining items */}
                <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        'flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 min-w-[52px] min-h-[44px] transition-colors text-[10px] font-medium leading-none relative',
                        (moreNavItems.some(item => item.id === activePage) || activePage === 'settings')
                          ? 'text-emerald-600'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <MoreHorizontal className="h-5 w-5" />
                      <span>More</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="center" className="w-56 p-2 mb-2">
                    <div className="space-y-1">
                      {moreNavItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            onNavigate(item.id)
                            setMoreOpen(false)
                          }}
                          className={cn(
                            'flex items-center gap-3 w-full rounded-md px-3 py-2.5 text-sm transition-colors',
                            activePage === item.id
                              ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
                              : 'text-foreground hover:bg-muted'
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 text-left">{item.label}</span>
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          onNavigate('settings')
                          setMoreOpen(false)
                        }}
                        className={cn(
                          'flex items-center gap-3 w-full rounded-md px-3 py-2.5 text-sm transition-colors',
                          activePage === 'settings'
                            ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
                            : 'text-foreground hover:bg-muted'
                        )}
                      >
                        <Settings className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left">Settings</span>
                      </button>
                      <div className="border-t my-1" />
                      <button
                        onClick={() => {
                          onLogout()
                          setMoreOpen(false)
                        }}
                        className="flex items-center gap-3 w-full rounded-md px-3 py-2.5 text-sm transition-colors text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        <LogOut className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left">Logout</span>
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </nav>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
