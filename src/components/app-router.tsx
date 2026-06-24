'use client'

import React, { useState, useEffect, useCallback, useSyncExternalStore, Suspense } from 'react'
import { useAuthStore, isWithinLoginGrace } from '@/stores/auth-store'
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
import { MessageTemplates } from '@/components/admin/message-templates'
import { AdminSettings } from '@/components/admin/admin-settings'
import { AnnouncementsManagement } from '@/components/admin/announcements-management'
import { OrganizationSettings } from '@/components/admin/organization-settings'
import { SuperAdminLayout } from '@/components/super-admin/super-admin-layout'
import { RecruiterLayout } from '@/components/recruiter/recruiter-layout'
import { RecruiterDashboard } from '@/components/recruiter/recruiter-dashboard'
import { Settings } from '@/components/recruiter/settings'
import { Loader2, Headphones } from 'lucide-react'
import { AppErrorBoundary, OfflineOverlay, useNetworkStatus } from '@/components/shared/error-handling'

// Lazy-loaded heavy components (code-split for faster initial load)
const CallListManagement = React.lazy(() => import('@/components/admin/call-list-management').then(m => ({ default: m.CallListManagement })))
const TeamPerformance = React.lazy(() => import('@/components/admin/team-performance').then(m => ({ default: m.TeamPerformance })))
const TeamMonitoring = React.lazy(() => import('@/components/admin/team-monitoring').then(m => ({ default: m.TeamMonitoring })))
const ShiftManagement = React.lazy(() => import('@/components/admin/shift-management').then(m => ({ default: m.ShiftManagement })))
const TeamManagementEnhanced = React.lazy(() => import('@/components/admin/team-management-enhanced').then(m => ({ default: m.TeamManagementEnhanced })))
const DynamicFieldBuilder = React.lazy(() => import('@/components/admin/dynamic-field-builder').then(m => ({ default: m.DynamicFieldBuilder })))
const DispositionBuilder = React.lazy(() => import('@/components/admin/disposition-builder').then(m => ({ default: m.DispositionBuilder })))
const AdminPipeline = React.lazy(() => import('@/components/admin/admin-pipeline').then(m => ({ default: m.AdminPipeline })))
const BackupRestorePage = React.lazy(() => import('@/components/admin/backup-restore').then(m => ({ default: m.BackupRestorePage })))
const PlatformDashboard = React.lazy(() => import('@/components/super-admin/platform-dashboard').then(m => ({ default: m.PlatformDashboard })))
const OrganizationManagement = React.lazy(() => import('@/components/super-admin/organization-management').then(m => ({ default: m.OrganizationManagement })))
const PlanManagement = React.lazy(() => import('@/components/super-admin/plan-management').then(m => ({ default: m.PlanManagement })))
const PlatformSettingsPage = React.lazy(() => import('@/components/super-admin/platform-settings').then(m => ({ default: m.PlatformSettingsPage })))
const AndroidAppPage = React.lazy(() => import('@/components/super-admin/android-app').then(m => ({ default: m.AndroidAppPage })))
const AutoDialer = React.lazy(() => import('@/components/recruiter/auto-dialer').then(m => ({ default: m.AutoDialer })))
const CallHistory = React.lazy(() => import('@/components/recruiter/call-history').then(m => ({ default: m.CallHistory })))
const ScheduledCalls = React.lazy(() => import('@/components/recruiter/scheduled-calls').then(m => ({ default: m.ScheduledCalls })))
const CandidatePipeline = React.lazy(() => import('@/components/recruiter/candidate-pipeline').then(m => ({ default: m.CandidatePipeline })))
const CreateCallingList = React.lazy(() => import('@/components/recruiter/create-calling-list').then(m => ({ default: m.CreateCallingList })))
const CallingListView = React.lazy(() => import('@/components/recruiter/calling-list-view').then(m => ({ default: m.CallingListView })))

// Reusable page-level loading skeleton
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

// Auth route paths (used for clean URL routing)
const AUTH_ROUTES = ['login', 'signup', 'register', 'forgot-password'] as const
type AuthView = typeof AUTH_ROUTES[number]

type AdminPage = 'dashboard' | 'team-performance' | 'team-monitoring' | 'shift-management' | 'dispositions' | 'call-lists' | 'templates' | 'clients' | 'users' | 'team-management' | 'approvals' | 'settings' | 'organization-settings' | 'announcements' | 'field-builder' | 'disposition-builder'
type SuperAdminPage = 'platform-dashboard' | 'organizations' | 'plans' | 'platform-settings' | 'backup-restore' | 'android-app' | 'admin-dashboard' | 'team-performance' | 'team-monitoring' | 'shift-management' | 'dispositions' | 'call-lists' | 'templates' | 'clients' | 'users' | 'team-management' | 'approvals' | 'admin-settings' | 'organization-settings' | 'announcements' | 'field-builder' | 'disposition-builder'
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

  // Validate stored token on mount and when auth state changes.
  // Skip right after login (grace period) — the login API already validated credentials.
  // Never logout on network errors — only on explicit 401 (invalid/stale token).
  useEffect(() => {
    if (isAuthenticated && user) {
      // Skip validation during login grace period (login already proved credentials)
      if (isWithinLoginGrace()) return

      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${useAuthStore.getState().token}` }
      }).then((res) => {
        if (res.status === 401) {
          logout()
          navigateTo('login')
        }
        // Any other non-200 status (500, 503, etc.) does NOT logout — just ignore
      }).catch(() => {
        // Network errors do NOT logout — the server might be temporarily unreachable
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
        case 'platform-dashboard': return <Suspense fallback={<PageLoader />}><PlatformDashboard /></Suspense>
        case 'organizations': return <Suspense fallback={<PageLoader />}><OrganizationManagement /></Suspense>
        case 'plans': return <Suspense fallback={<PageLoader />}><PlanManagement /></Suspense>
        case 'platform-settings': return <Suspense fallback={<PageLoader />}><PlatformSettingsPage /></Suspense>
        case 'backup-restore': return <Suspense fallback={<PageLoader />}><BackupRestorePage /></Suspense>
        case 'android-app': return <Suspense fallback={<PageLoader />}><AndroidAppPage /></Suspense>
        case 'admin-dashboard': return <AdminDashboard />
        case 'team-performance': return <Suspense fallback={<PageLoader />}>{isPipelineSubPage ? <AdminPipeline /> : <TeamPerformance />}</Suspense>
        case 'team-monitoring': return <Suspense fallback={<PageLoader />}><TeamMonitoring /></Suspense>
        case 'shift-management': return <Suspense fallback={<PageLoader />}><ShiftManagement /></Suspense>
        case 'dispositions': return <DispositionManagement />
        case 'call-lists': return <Suspense fallback={<PageLoader />}><CallListManagement userId={user.id} /></Suspense>
        case 'templates': return <MessageTemplates />
        case 'clients': return <ClientManagement />
        case 'announcements': return <AnnouncementsManagement />
        case 'users': return <UserManagement />
        case 'team-management': return <Suspense fallback={<PageLoader />}><TeamManagementEnhanced /></Suspense>
        case 'approvals': return <ApprovalRequests />
        case 'field-builder': return <Suspense fallback={<PageLoader />}><DynamicFieldBuilder /></Suspense>
        case 'disposition-builder': return <Suspense fallback={<PageLoader />}><DispositionBuilder /></Suspense>
        case 'admin-settings': return <AdminSettings userId={user.id} />
        case 'organization-settings': return <OrganizationSettings />
        default: return <Suspense fallback={<PageLoader />}><PlatformDashboard /></Suspense>
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
        case 'team-performance': return <Suspense fallback={<PageLoader />}>{isPipelineSubPage ? <AdminPipeline /> : <TeamPerformance />}</Suspense>
        case 'team-monitoring': return <Suspense fallback={<PageLoader />}><TeamMonitoring /></Suspense>
        case 'shift-management': return <Suspense fallback={<PageLoader />}><ShiftManagement /></Suspense>
        case 'dispositions': return <DispositionManagement />
        case 'call-lists': return <Suspense fallback={<PageLoader />}><CallListManagement userId={user.id} /></Suspense>
        case 'templates': return <MessageTemplates />
        case 'clients': return <ClientManagement />
        case 'users': return <UserManagement />
        case 'approvals': return <ApprovalRequests />
        case 'settings': return <AdminSettings userId={user.id} />
        case 'announcements': return <AnnouncementsManagement />
        case 'team-management': return <Suspense fallback={<PageLoader />}><TeamManagementEnhanced /></Suspense>
        case 'organization-settings': return <OrganizationSettings />
        case 'field-builder': return <Suspense fallback={<PageLoader />}><DynamicFieldBuilder /></Suspense>
        case 'disposition-builder': return <Suspense fallback={<PageLoader />}><DispositionBuilder /></Suspense>
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
      case 'calling-list': return <Suspense fallback={<PageLoader />}><CallingListView userId={user.id} onNavigate={(page) => go(page)} /></Suspense>
      case 'create-list': return <Suspense fallback={<PageLoader />}><CreateCallingList userId={user.id} onNavigate={(page) => go(page)} /></Suspense>
      case 'pending': return <Suspense fallback={<PageLoader />}><AutoDialer userId={user.id} onNavigate={(page) => go(page)} /></Suspense>
      case 'history': return <Suspense fallback={<PageLoader />}><CallHistory userId={user.id} /></Suspense>
      case 'scheduled': return <Suspense fallback={<PageLoader />}><ScheduledCalls userId={user.id} onNavigate={(page) => go(page)} /></Suspense>
      case 'pipeline': return <Suspense fallback={<PageLoader />}><CandidatePipeline /></Suspense>
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
