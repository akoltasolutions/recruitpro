'use client'

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { LoginPage } from '@/components/auth/login-page'
import { SignupPage } from '@/components/auth/signup-page'
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
import { RecruiterLayout } from '@/components/recruiter/recruiter-layout'
import { RecruiterDashboard } from '@/components/recruiter/recruiter-dashboard'
import { AutoDialer } from '@/components/recruiter/auto-dialer'
import { CallHistory } from '@/components/recruiter/call-history'
import { ScheduledCalls } from '@/components/recruiter/scheduled-calls'
import { Settings } from '@/components/recruiter/settings'
import { CandidatePipeline } from '@/components/recruiter/candidate-pipeline'
import { CreateCallingList } from '@/components/recruiter/create-calling-list'
import { Loader2, Headphones } from 'lucide-react'
import { AppErrorBoundary, OfflineOverlay, useNetworkStatus } from '@/components/shared/error-handling'

type AuthView = 'login' | 'signup' | 'forgot-password'
type AdminPage = 'dashboard' | 'team-performance' | 'team-monitoring' | 'dispositions' | 'call-lists' | 'templates' | 'clients' | 'users' | 'approvals' | 'settings'
type RecruiterPage = 'home' | 'create-list' | 'pending' | 'history' | 'scheduled' | 'pipeline' | 'settings'

export default function Home() {
  const isOnline = useNetworkStatus()
  const [retrying, setRetrying] = useState(false)

  // Offline retry handler
  const handleRetry = useCallback(() => {
    setRetrying(true)
    setTimeout(() => {
      if (navigator.onLine) {
        setRetrying(false)
        window.location.reload()
      } else {
        setRetrying(false)
      }
    }, 1500)
  }, [])

  return (
    <AppErrorBoundary onReset={() => window.location.reload()}>
      <OfflineOverlay isOnline={isOnline} onRetry={handleRetry} retrying={retrying} />
      <AppContent />
    </AppErrorBoundary>
  )
}

// Inner content component (separated to allow hooks before early returns)
function AppContent() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const [authView, setAuthView] = useState<AuthView>('login')
  const [adminPage, setAdminPage] = useState<AdminPage>('dashboard')
  const [recruiterPage, setRecruiterPage] = useState<RecruiterPage>('home')
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const handleLogout = () => {
    logout()
    setAuthView('login')
    setAdminPage('dashboard')
    setRecruiterPage('home')
  }

  // ==================== GLOBAL ANDROID WEBVIEW BRIDGE ====================
  useEffect(() => {
    const handleShowDisposition = (e: Event) => {
      console.log('[GlobalBridge] __show_disposition event received:', (e as CustomEvent).detail)
      const detail = (e as CustomEvent).detail || {}
      sessionStorage.setItem('__trigger_disposition', JSON.stringify(detail))
      window.dispatchEvent(new CustomEvent('show-disposition-from-dialer', { detail }))
    }

    window.addEventListener('__show_disposition', handleShowDisposition)

    const showPostCallDisposition = (phoneNumber: string) => {
      console.log('[GlobalBridge] showPostCallDisposition called:', phoneNumber)
      const data = { phone: phoneNumber, timestamp: Date.now() }
      sessionStorage.setItem('__trigger_disposition', JSON.stringify(data))
      window.dispatchEvent(new CustomEvent('show-disposition-from-dialer', { detail: data }))
    }

    ;(window as unknown as Record<string, unknown>).showPostCallDisposition = showPostCallDisposition

    const handlePopState = () => {
      console.log('[GlobalBridge] Back button pressed — dispatching close-all-modals')
      window.dispatchEvent(new CustomEvent('close-all-modals'))
    }
    window.addEventListener('popstate', handlePopState)

    ;(window as unknown as Record<string, unknown>).__pushModalHistory = () => {
      try {
        window.history.pushState({ modal: true }, '')
        console.log('[GlobalBridge] Pushed modal history entry')
      } catch { /* ignore */ }
    }

    return () => {
      window.removeEventListener('__show_disposition', handleShowDisposition)
      delete (window as unknown as Record<string, unknown>).showPostCallDisposition
      window.removeEventListener('popstate', handlePopState)
      delete (window as unknown as Record<string, unknown>).__pushModalHistory
    }
  }, [])

  // Validate stored token on mount
  useEffect(() => {
    if (isAuthenticated && user) {
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${useAuthStore.getState().token}` }
      }).then((res) => {
        if (!res.ok) {
          logout()
        }
      }).catch(() => {
        logout()
      })
    }
  }, [])

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
            console.log('[Page] Detected return from dialer, navigating to pending page')
            setRecruiterPage('pending')
          }
        } catch { /* ignore */ }
      }
    }
    checkAndNavigate()
    const handler = () => checkAndNavigate()
    window.addEventListener('show-disposition-from-dialer', handler)
    return () => window.removeEventListener('show-disposition-from-dialer', handler)
  }, [mounted, isAuthenticated, user?.role])

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

  // Auth screens
  if (!isAuthenticated || !user) {
    if (authView === 'signup') {
      return <SignupPage onSwitch={() => setAuthView('login')} />
    }
    if (authView === 'forgot-password') {
      return <ForgotPasswordPage onBack={() => setAuthView('login')} />
    }
    return <LoginPage onSwitch={() => setAuthView('signup')} onForgotPassword={() => setAuthView('forgot-password')} />
  }

  // Admin Panel
  if (user.role === 'ADMIN') {
    const renderAdminPage = () => {
      switch (adminPage) {
        case 'dashboard': return <AdminDashboard />
        case 'team-performance': return <TeamPerformance />
        case 'team-monitoring': return <TeamMonitoring />
        case 'dispositions': return <DispositionManagement />
        case 'call-lists': return <CallListManagement userId={user.id} />
        case 'templates': return <MessageTemplates />
        case 'clients': return <ClientManagement />
        case 'users': return <UserManagement />
        case 'approvals': return <ApprovalRequests />
        case 'settings': return <AdminSettings userId={user.id} />
        default: return <AdminDashboard />
      }
    }

    return (
      <AdminLayout activePage={adminPage} onNavigate={(page) => setAdminPage(page as AdminPage)} onLogout={handleLogout}>
        {renderAdminPage()}
      </AdminLayout>
    )
  }

  // Recruiter Panel
  const renderRecruiterPage = () => {
    switch (recruiterPage) {
      case 'home': return <RecruiterDashboard userId={user.id} onNavigate={(page) => setRecruiterPage(page as RecruiterPage)} />
      case 'create-list': return <CreateCallingList userId={user.id} onNavigate={(page) => setRecruiterPage(page as RecruiterPage)} />
      case 'pending': return <AutoDialer userId={user.id} onNavigate={(page) => setRecruiterPage(page as RecruiterPage)} />
      case 'history': return <CallHistory userId={user.id} />
      case 'scheduled': return <ScheduledCalls userId={user.id} onNavigate={(page) => setRecruiterPage(page as RecruiterPage)} />
      case 'pipeline': return <CandidatePipeline />
      case 'settings': return <Settings userId={user.id} onLogout={handleLogout} />
      default: return <RecruiterDashboard userId={user.id} onNavigate={(page) => setRecruiterPage(page as RecruiterPage)} />
    }
  }

  return (
    <RecruiterLayout activePage={recruiterPage} onNavigate={(page) => setRecruiterPage(page as RecruiterPage)} onLogout={handleLogout}>
      {renderRecruiterPage()}
    </RecruiterLayout>
  )
}
