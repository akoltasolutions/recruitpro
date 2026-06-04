'use client'

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { LoginPage } from '@/components/auth/login-page'
import { SignupPage } from '@/components/auth/signup-page'
import { RegisterPage } from '@/components/auth/register-page'
import { ForgotPasswordPage } from '@/components/auth/forgot-password-page'
import { AdminLayout } from '@/components/admin/admin-layout'
import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { UserManagement } from '@/components/admin/user-management'
import { ApprovalRequests } from '@/components/admin/approval-requests'
import { ClientManagement } from '@/components/admin/client-management'
import { DispositionManagement } from '@/components/admin/disposition-management'
import { CallListManagement } from '@/components/admin/call-list-management'
import { MessageTemplates } from '@/components/admin/message-templates'
import { TeamPerformance } from '@/components/admin/team-performance'
import { TeamMonitoring } from '@/components/admin/team-monitoring'
import { AdminSettings } from '@/components/admin/admin-settings'
import { AnnouncementsManagement } from '@/components/admin/announcements-management'
import { TeamManagementEnhanced } from '@/components/admin/team-management-enhanced'
import { OrganizationSettings } from '@/components/admin/organization-settings'
import { DynamicFieldBuilder } from '@/components/admin/dynamic-field-builder'
import { DispositionBuilder } from '@/components/admin/disposition-builder'
import { ShiftManagement } from '@/components/admin/shift-management'
import { SuperAdminLayout } from '@/components/super-admin/super-admin-layout'
import { PlatformDashboard } from '@/components/super-admin/platform-dashboard'
import { OrganizationManagement } from '@/components/super-admin/organization-management'
import { PlanManagement } from '@/components/super-admin/plan-management'
import { PlatformSettingsPage } from '@/components/super-admin/platform-settings'
import { BackupRestorePage } from '@/components/admin/backup-restore'
import { AdminPipeline } from '@/components/admin/admin-pipeline'
import { RecruiterLayout } from '@/components/recruiter/recruiter-layout'
import { RecruiterDashboard } from '@/components/recruiter/recruiter-dashboard'
import { AutoDialer } from '@/components/recruiter/auto-dialer'
import { CallHistory } from '@/components/recruiter/call-history'
import { ScheduledCalls } from '@/components/recruiter/scheduled-calls'
import { Settings } from '@/components/recruiter/settings'
import { CandidatePipeline } from '@/components/recruiter/candidate-pipeline'
import { CreateCallingList } from '@/components/recruiter/create-calling-list'
import { CallingListView } from '@/components/recruiter/calling-list-view'
import { Loader2, Headphones } from 'lucide-react'
import { AppErrorBoundary, OfflineOverlay, useNetworkStatus } from '@/components/shared/error-handling'

// Auth route paths (used for clean URL routing)
const AUTH_ROUTES = ['login', 'signup', 'register', 'forgot-password'] as const
type AuthView = typeof AUTH_ROUTES[number]

type AdminPage = 'dashboard' | 'team-performance' | 'team-monitoring' | 'shift-management' | 'dispositions' | 'call-lists' | 'templates' | 'clients' | 'users' | 'team-management' | 'approvals' | 'settings' | 'organization-settings' | 'announcements' | 'field-builder' | 'disposition-builder'
type SuperAdminPage = 'platform-dashboard' | 'organizations' | 'plans' | 'platform-settings' | 'backup-restore' | 'admin-dashboard' | 'team-performance' | 'team-monitoring' | 'shift-management' | 'dispositions' | 'call-lists' | 'templates' | 'clients' | 'users' | 'team-management' | 'approvals' | 'admin-settings' | 'organization-settings' | 'announcements' | 'field-builder' | 'disposition-builder'
type RecruiterPage = 'home' | 'calling-list' | 'create-list' | 'pending' | 'history' | 'scheduled' | 'pipeline' | 'settings'

/**
 * Navigate to a clean URL path. Used for both page navigation and auth view switching.
 */
export function navigateTo(path: string) {
  window.history.pushState(null, '', `/${path}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/**
 * Redirect old hash URLs to clean URLs (client-side fallback).
 */
function redirectHashUrl() {
  if (typeof window === 'undefined') return
  const hash = window.location.hash
  if (hash && hash.startsWith('#/')) {
    const cleanPath = hash.replace(/^#\/?/, '')
    window.history.replaceState(null, '', `/${cleanPath}`)
  } else if (hash && hash !== '') {
    window.history.replaceState(null, '', window.location.pathname)
  }
}

// ==================== SPA Content Component ====================

export function AppContent() {
  const { user, isAuthenticated, logout } = useAuthStore()

  // Read the current path from the URL (SSR-safe: starts empty, syncs in useEffect)
  const [currentPath, setCurrentPath] = useState('')

  // Sync path from browser URL on mount and subscribe to popstate
  useEffect(() => {
    const readPath = () => {
      const path = window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, '')
      setCurrentPath(path)
    }
    readPath()
    const handlePopState = () => readPath()
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // On mount: redirect old hash URLs to clean URLs
  useEffect(() => {
    redirectHashUrl()
  }, [])

  // Helper to determine if the current path is an auth route
  const isAuthRoute = (view: AuthView): boolean => currentPath === view

  // Helper to navigate to a path
  const go = useCallback((path: string) => {
    navigateTo(path)
  }, [])

  // Determine admin/recruiter/super-admin page from the URL path
  // Handle team-performance sub-paths (e.g. team-performance/pipeline)
  const isAdmin = isAuthenticated && (user?.role === 'ORG_ADMIN' || user?.role === 'ADMIN')
  const isSuperAdmin = isAuthenticated && user?.role === 'SUPER_ADMIN'
  const isAdminOrSuperAdmin = isAdmin || isSuperAdmin

  // Parse base page from path (strip sub-paths for page matching)
  const basePath = currentPath.includes('/') ? currentPath.split('/')[0] : currentPath
  const subPath = currentPath.includes('/') ? currentPath.slice(currentPath.indexOf('/') + 1) : null
  const isPipelineSubPage = currentPath === 'team-performance/pipeline'

  const adminPage = isAdmin
    ? ((basePath || 'dashboard') as AdminPage)
    : 'dashboard'

  const recruiterPage = (isAuthenticated && user?.role === 'RECRUITER')
    ? (currentPath as RecruiterPage) || 'home'
    : 'home'

  const superAdminPage = isSuperAdmin
    ? ((basePath || 'platform-dashboard') as SuperAdminPage)
    : 'platform-dashboard'

  // Redirect old /pipeline URL to /team-performance/pipeline for admin/superadmin
  useEffect(() => {
    if (isAdminOrSuperAdmin && currentPath === 'pipeline') {
      navigateTo('team-performance/pipeline')
    }
  }, [currentPath, isAdminOrSuperAdmin])

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const handleLogout = () => {
    logout()
    navigateTo('login')
  }

  // ==================== GLOBAL ANDROID WEBVIEW BRIDGE ====================
  useEffect(() => {
    const handleShowDisposition = (e: Event) => {
      const detail = (e as CustomEvent).detail || {}
      sessionStorage.setItem('__trigger_disposition', JSON.stringify(detail))
      window.dispatchEvent(new CustomEvent('show-disposition-from-dialer', { detail }))
    }

    window.addEventListener('__show_disposition', handleShowDisposition)

    const showPostCallDisposition = (phoneNumber: string) => {
      const data = { phone: phoneNumber, timestamp: Date.now() }
      sessionStorage.setItem('__trigger_disposition', JSON.stringify(data))
      window.dispatchEvent(new CustomEvent('show-disposition-from-dialer', { detail: data }))
    }

    ;(window as unknown as Record<string, unknown>).showPostCallDisposition = showPostCallDisposition

    const handlePopState = () => {
      window.dispatchEvent(new CustomEvent('close-all-modals'))
    }
    window.addEventListener('popstate', handlePopState)

    ;(window as unknown as Record<string, unknown>).__pushModalHistory = () => {
      try {
        window.history.pushState({ modal: true }, '')
      } catch { /* ignore */ }
    }

    return () => {
      window.removeEventListener('__show_disposition', handleShowDisposition)
      delete (window as unknown as Record<string, unknown>).showPostCallDisposition
      window.removeEventListener('popstate', handlePopState)
      delete (window as unknown as Record<string, unknown>).__pushModalHistory
    }
  }, [])

  // Validate stored token on mount and when auth state changes
  useEffect(() => {
    if (isAuthenticated && user) {
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${useAuthStore.getState().token}` }
      }).then((res) => {
        if (!res.ok) {
          logout()
          navigateTo('login')
        }
      }).catch(() => {
        logout()
        navigateTo('login')
      })
    }
  }, [isAuthenticated, user?.id])

  // Auto-navigate to 'pending' page if there's a pending disposition
  useEffect(() => {
    if (!mounted || !isAuthenticated || !user || user.role !== 'RECRUITER') return
    const checkAndNavigate = () => {
      const raw = sessionStorage.getItem('__trigger_disposition')
      if (raw) {
        sessionStorage.removeItem('__trigger_disposition')
        try {
          const data = JSON.parse(raw)
          if (Date.now() - data.timestamp < 30 * 60 * 1000) {
            navigateTo('pending')
          }
        } catch { /* ignore */ }
      }
    }
    checkAndNavigate()
    const handler = () => checkAndNavigate()
    window.addEventListener('show-disposition-from-dialer', handler)
    return () => window.removeEventListener('show-disposition-from-dialer', handler)
  }, [mounted, isAuthenticated, user?.role])

  // Redirect authenticated users away from auth routes via useEffect (not during render)
  useEffect(() => {
    if (!user || !isAuthenticated) return
    if (AUTH_ROUTES.includes(currentPath as AuthView)) {
      if (user.role === 'SUPER_ADMIN') {
        navigateTo('platform-dashboard')
      } else if (user.role === 'ORG_ADMIN' || user.role === 'ADMIN') {
        navigateTo('dashboard')
      } else {
        navigateTo('home')
      }
    }
  }, [currentPath, user?.role, isAuthenticated])

  // Loading screen
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center animate-pulse">
            <Headphones className="h-6 w-6" />
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // Auth screens — use clean URL paths instead of state
  if (!isAuthenticated || !user) {
    if (isAuthRoute('register')) {
      return <RegisterPage onBack={() => navigateTo('login')} />
    }
    if (isAuthRoute('signup')) {
      return <SignupPage onSwitch={() => navigateTo('login')} />
    }
    if (isAuthRoute('forgot-password')) {
      return <ForgotPasswordPage onBack={() => navigateTo('login')} />
    }
    return (
      <LoginPage
        onSwitch={() => navigateTo('signup')}
        onForgotPassword={() => navigateTo('forgot-password')}
        onRegister={() => navigateTo('register')}
      />
    )
  }

  // Authenticated user on an auth route — will redirect via useEffect above
  if (AUTH_ROUTES.includes(currentPath as AuthView)) {
    return null
  }

  // Super Admin Panel
  if (user.role === 'SUPER_ADMIN') {
    const renderSuperAdminPage = () => {
      // If on old /pipeline URL, show nothing (redirect will happen via useEffect)
      if (currentPath === 'pipeline') return null
      switch (superAdminPage) {
        case 'platform-dashboard': return <PlatformDashboard />
        case 'organizations': return <OrganizationManagement />
        case 'plans': return <PlanManagement />
        case 'platform-settings': return <PlatformSettingsPage />
        case 'backup-restore': return <BackupRestorePage />
        case 'admin-dashboard': return <AdminDashboard />
        case 'team-performance': return isPipelineSubPage ? <AdminPipeline /> : <TeamPerformance />
        case 'team-monitoring': return <TeamMonitoring />
        case 'shift-management': return <ShiftManagement />
        case 'dispositions': return <DispositionManagement />
        case 'call-lists': return <CallListManagement userId={user.id} />
        case 'templates': return <MessageTemplates />
        case 'clients': return <ClientManagement />
        case 'announcements': return <AnnouncementsManagement />
        case 'users': return <UserManagement />
        case 'team-management': return <TeamManagementEnhanced />
        case 'approvals': return <ApprovalRequests />
        case 'field-builder': return <DynamicFieldBuilder />
        case 'disposition-builder': return <DispositionBuilder />
        case 'admin-settings': return <AdminSettings userId={user.id} />
        case 'organization-settings': return <OrganizationSettings />
        default: return <PlatformDashboard />
      }
    }

    return (
      <SuperAdminLayout activePage={currentPath || 'platform-dashboard'} onNavigate={(page) => go(page)} onLogout={handleLogout}>
        {renderSuperAdminPage()}
      </SuperAdminLayout>
    )
  }

  // Org Admin Panel
  if (user.role === 'ORG_ADMIN' || user.role === 'ADMIN') {
    const renderAdminPage = () => {
      // If on old /pipeline URL, show nothing (redirect will happen via useEffect)
      if (currentPath === 'pipeline') return null
      switch (adminPage) {
        case 'dashboard': return <AdminDashboard />
        case 'team-performance': return isPipelineSubPage ? <AdminPipeline /> : <TeamPerformance />
        case 'team-monitoring': return <TeamMonitoring />
        case 'shift-management': return <ShiftManagement />
        case 'dispositions': return <DispositionManagement />
        case 'call-lists': return <CallListManagement userId={user.id} />
        case 'templates': return <MessageTemplates />
        case 'clients': return <ClientManagement />
        case 'users': return <UserManagement />
        case 'approvals': return <ApprovalRequests />
        case 'settings': return <AdminSettings userId={user.id} />
        case 'announcements': return <AnnouncementsManagement />
        case 'team-management': return <TeamManagementEnhanced />
        case 'organization-settings': return <OrganizationSettings />
        case 'field-builder': return <DynamicFieldBuilder />
        case 'disposition-builder': return <DispositionBuilder />
        default: return <AdminDashboard />
      }
    }

    return (
      <AdminLayout activePage={currentPath || 'dashboard'} onNavigate={(page) => go(page)} onLogout={handleLogout}>
        {renderAdminPage()}
      </AdminLayout>
    )
  }

  // Recruiter Panel
  const renderRecruiterPage = () => {
    switch (recruiterPage) {
      case 'home': return <RecruiterDashboard userId={user.id} onNavigate={(page) => go(page)} />
      case 'calling-list': return <CallingListView userId={user.id} onNavigate={(page) => go(page)} />
      case 'create-list': return <CreateCallingList userId={user.id} onNavigate={(page) => go(page)} />
      case 'pending': return <AutoDialer userId={user.id} onNavigate={(page) => go(page)} />
      case 'history': return <CallHistory userId={user.id} />
      case 'scheduled': return <ScheduledCalls userId={user.id} onNavigate={(page) => go(page)} />
      case 'pipeline': return <CandidatePipeline />
      case 'settings': return <Settings userId={user.id} onLogout={handleLogout} />
      default: return <RecruiterDashboard userId={user.id} onNavigate={(page) => go(page)} />
    }
  }

  return (
    <RecruiterLayout activePage={recruiterPage} onNavigate={(page) => go(page)} onLogout={handleLogout}>
      {renderRecruiterPage()}
    </RecruiterLayout>
  )
}
