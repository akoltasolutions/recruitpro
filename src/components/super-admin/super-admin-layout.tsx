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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, Building2, CreditCard, Settings,
  Menu, Shield, LogOut, MoreHorizontal,
} from 'lucide-react'

const menuItems = [
  { key: 'dashboard', label: 'Platform Dashboard', icon: LayoutDashboard },
  { key: 'organizations', label: 'Organizations', icon: Building2 },
  { key: 'plans', label: 'Subscription Plans', icon: CreditCard },
  { key: 'settings', label: 'Platform Settings', icon: Settings },
]

// All items shown in bottom nav (only 4 items)
const bottomNavItems = menuItems

interface SuperAdminLayoutProps {
  activePage: string
  onNavigate: (page: string) => void
  onLogout: () => void
  children: React.ReactNode
}

export function SuperAdminLayout({ activePage, onNavigate, onLogout, children }: SuperAdminLayoutProps) {
  const { user } = useAuthStore()
  const isMobile = useIsMobile()

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
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-violet-600 text-white">
              <Shield className="h-4 w-4" />
            </div>
            <span className="font-semibold text-sm">RecruitPro Platform</span>
          </div>
        </header>
        <main className="p-4 pb-24">
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
        <nav className="fixed bottom-0 left-0 right-0 z-[10000] border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-around px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {bottomNavItems.map((item) => (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 min-w-[52px] min-h-[44px] transition-colors text-[10px] font-medium leading-none',
                  activePage === item.key ? 'text-violet-600' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="truncate max-w-[64px]">{item.label.split(' ')[0]}</span>
              </button>
            ))}
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
            <div className="flex items-center justify-center h-7 w-7 rounded-md bg-violet-600 text-white">
              <Shield className="h-3.5 w-3.5" />
            </div>
            <span className="font-semibold text-sm">RecruitPro Platform</span>
          </div>
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
