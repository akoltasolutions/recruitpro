'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  Phone,
  PhoneOff,
  PhoneCall,
  SkipForward,
  ChevronRight,
  ChevronLeft,
  Clock,
  MapPin,
  Briefcase,
  User,
  ListChecks,
  MessageSquare,
  CalendarClock,
  Send,
  Check,
  Loader2,
  AlertCircle,
  Mic,
  MicOff,
  ArrowRight,
  PhoneIncoming,
  ClipboardCheck,
  X,
  ChevronDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
// Select replaced with native <select> for Android WebView compatibility
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
// Calendar replaced with native <input type="date"> for Android WebView compatibility
// Popover replaced with CSS bottom-sheet for Android WebView compatibility
import { toast } from 'sonner'
import { authFetch } from '@/stores/auth-store'
import { cn, formatPhoneForWhatsApp } from '@/lib/utils'
import { recordCallActivity } from '@/lib/call-activity-tracker'
// format removed — scheduledDate is now a YYYY-MM-DD string, formatted natively

interface AutoDialerProps {
  userId: string
  onNavigate: (page: string) => void
}

/* ---------- Types ---------- */
interface Candidate {
  id: string
  name: string
  phone: string
  role: string | null
  location: string | null
  company: string | null
  status: string
}

interface CallListInfo {
  id: string
  name: string
  description: string | null
  candidates: Candidate[]
  assignments: { id: string; recruiterId: string; callListId: string }[]
}

interface Disposition {
  id: string
  heading: string
  type: string
  isActive: boolean
}

interface MessageTemplate {
  id: string
  name: string
  type: string
  content: string
  isActive: boolean
}

interface Client {
  id: string
  name: string
}

type DialerScreen = 'select-list' | 'list-summary' | 'calling'

/* ---------- Helper ---------- */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function cleanPhone(phone: string): string {
  // Keep only digits
  return phone.replace(/[^0-9]/g, '')
}

/* ---------- Component ---------- */
export function AutoDialer({ userId, onNavigate }: AutoDialerProps) {
  const [screen, setScreen] = useState<DialerScreen>('select-list')
  const [callLists, setCallLists] = useState<CallListInfo[]>([])
  const [selectedList, setSelectedList] = useState<CallListInfo | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentCandidate, setCurrentCandidate] = useState<Candidate | null>(null)
  const [dispositions, setDispositions] = useState<Disposition[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)
  const [callTimer, setCallTimer] = useState(0)
  const [callInitiated, setCallInitiated] = useState(false)
  const [callGap, setCallGap] = useState(() => {
    if (typeof window === 'undefined') return 3
    const saved = localStorage.getItem('recruiter-call-delay')
    return saved ? parseInt(saved, 10) || 3 : 3
  })
  const [callGapCountdown, setCallGapCountdown] = useState<number | null>(null)
  const [preCallCountdown, setPreCallCountdown] = useState<number | null>(null)
  const [completedCount, setCompletedCount] = useState(0)

  // Post-call disposition modal state
  const [isDispositionModalOpen, setIsDispositionModalOpen] = useState(false)
  const [selectedDisposition, setSelectedDisposition] = useState('')
  const [selectedClient, setSelectedClient] = useState('')
  const [customClientName, setCustomClientName] = useState('')
  const [notes, setNotes] = useState('')
  const [scheduledDate, setScheduledDate] = useState<string>('') // YYYY-MM-DD for native input
  const [f2fInterviewDate, setF2fInterviewDate] = useState<string>('') // YYYY-MM-DD
  const [savingRecord, setSavingRecord] = useState(false)

  // Template state
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [templateSheetOpen, setTemplateSheetOpen] = useState<'sms' | 'whatsapp' | null>(null)
  const [selectedSmsTemplate, setSelectedSmsTemplate] = useState('')
  const [selectedWaTemplate, setSelectedWaTemplate] = useState('')
  const [selectedSmsText, setSelectedSmsText] = useState('')
  const [selectedWaText, setSelectedWaText] = useState('')

  // Voice input state
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const gapTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const preCallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const callInitiatedRef = useRef(false)

  // Dynamically measure the actual viewport height for the bottom-sheet.
  // CSS dvh/vh units are UNRELIABLE in Android WebView — they don't account for
  // the status bar, navigation bar, or browser chrome. window.innerHeight gives
  // the real pixel count of the visible area.
  const isMobile = useIsMobile()
  const [sheetHeight, setSheetHeight] = useState(0)
  useEffect(() => {
    const measure = () => {
      const h = window.innerHeight || window.visualViewport?.height || 600
      // Use 85% of actual visible height, leave 15% for the overlay to show behind
      setSheetHeight(Math.round(h * 0.85))
    }
    measure()
    // Re-measure when viewport changes (keyboard open, rotation, etc.)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

  // Fetch call lists assigned to this user
  const fetchCallLists = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/api/call-lists')
      if (!res.ok) throw new Error()
      const data = await res.json()
      const all: CallListInfo[] = data.callLists || []
      const assigned = all.filter((l) => l.assignments.some((a) => a.recruiterId === userId))
      setCallLists(assigned)
    } catch {
      toast.error('Failed to load call lists')
    }
    setLoading(false)
  }, [userId])

  // Fetch dispositions, clients & templates
  const fetchDispositions = useCallback(async () => {
    try {
      const [dispRes, cliRes, tmplRes] = await Promise.all([
        authFetch('/api/dispositions'),
        authFetch('/api/clients'),
        authFetch('/api/message-templates'),
      ])
      if (dispRes.ok) {
        const d = await dispRes.json()
        const active = (d.dispositions || []).filter((disp: Disposition) => disp.isActive)
        // Deduplicate by heading (case-insensitive) — keep first occurrence
        const seen = new Set<string>()
        const unique = active.filter((disp: Disposition) => {
          const key = disp.heading.toLowerCase().trim()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        setDispositions(unique)
      }
      if (cliRes.ok) {
        const c = await cliRes.json()
        setClients(c.clients || [])
      }
      if (tmplRes.ok) {
        const t = await tmplRes.json()
        const activeTemplates = (t.templates || []).filter((tmpl: MessageTemplate) => tmpl.isActive)
        setTemplates(activeTemplates)
        console.log('[AutoDialer] Loaded', activeTemplates.length, 'message templates')
      } else {
        console.error('[AutoDialer] Failed to fetch templates:', tmplRes.status)
      }
    } catch (err) {
      console.error('[AutoDialer] fetchDispositions error:', err)
    }
  }, [])

  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    fetchCallLists()
    fetchDispositions()
    // Sync current status from API to localStorage (in case user navigated here directly)
    authFetch('/api/user-status')
      .then((res) => {
        if (res.ok) return res.json()
      })
      .then((data) => {
        if (data?.status) {
          try { localStorage.setItem('recruiter_current_status', data.status) } catch { /* ignore */ }
        }
      })
      .catch(() => { /* non-blocking */ })
  }, [fetchCallLists, fetchDispositions])

  // Cleanup timers & voice recognition
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (gapTimerRef.current) clearInterval(gapTimerRef.current)
      if (preCallTimerRef.current) clearInterval(preCallTimerRef.current)
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch { /* ignore */ }
      }
    }
  }, [])

  /* ==================== DETECT RETURN FROM PHONE DIALER ==================== */
  // Uses sessionStorage to persist call state across page reloads (Android WebView may reload)
  // Also listens to visibilitychange, focus, and pageshow events
  // Exposes window.showPostCallDisposition() for Android evaluateJavascript

  const CALL_STATE_KEY = 'recruiter_call_in_progress'

  const saveCallState = useCallback((candidate: Candidate) => {
    try {
      sessionStorage.setItem(CALL_STATE_KEY, JSON.stringify({
        phone: candidate.phone,
        name: candidate.name,
        candidateId: candidate.id,
        role: candidate.role,
        location: candidate.location,
        company: candidate.company,
        timestamp: Date.now(),
      }))
      console.log('[AutoDialer] Call state saved to sessionStorage')
    } catch (e) {
      console.error('[AutoDialer] Failed to save call state:', e)
    }
  }, [])

  const clearCallState = useCallback(() => {
    try {
      sessionStorage.removeItem(CALL_STATE_KEY)
    } catch (e) { /* ignore */ }
  }, [])

  const checkPendingCall = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(CALL_STATE_KEY)
      if (!raw) return false
      const data = JSON.parse(raw)
      // Only trigger if call was initiated in the last 30 minutes
      if (Date.now() - data.timestamp > 30 * 60 * 1000) {
        sessionStorage.removeItem(CALL_STATE_KEY)
        return false
      }
      // Found a pending call — user returned from dialer
      console.log('[AutoDialer] Pending call detected on return:', data.phone)
      sessionStorage.removeItem(CALL_STATE_KEY)
      return data
    } catch {
      return false
    }
  }, [])

  // Guard flag to prevent duplicate disposition popup triggers from multiple events
  // firing at once (visibilitychange + focus + pageshow)
  const dispositionShownRef = useRef(false)

  // Restore call state and show disposition when returning from dialer
  const handleReturnFromDialer = useCallback((storedData?: { candidateId: string; phone: string; name: string; role: string | null; location: string | null; company: string | null; timestamp: number }) => {
    // Prevent duplicate triggers from multiple simultaneous events
    if (dispositionShownRef.current) {
      console.log('[AutoDialer] Disposition already shown, skipping duplicate trigger')
      return
    }
    dispositionShownRef.current = true

    if (storedData) {
      // Restore candidate info from sessionStorage if we lost it on reload
      const restored: Candidate = {
        id: storedData.candidateId,
        phone: storedData.phone,
        name: storedData.name,
        role: storedData.role,
        location: storedData.location,
        company: storedData.company,
        status: 'PENDING',
      }
      setCurrentCandidate(restored)
      setCurrentIndex((prev) => {
        // Use functional update to avoid stale closure on candidates array
        return prev // Keep current index for now — will be corrected below
      })
    }
    callInitiatedRef.current = false
    setCallInitiated(false)
    stopCallTimer()
    // Small delay to ensure UI is ready before showing the popup
    setTimeout(() => {
      setIsDispositionModalOpen(true)
      console.log('[AutoDialer] Disposition popup shown')
    }, 500)
  }, []) // Empty deps — uses refs and functional state updates to avoid stale closures

  useEffect(() => {
    // Listen for visibility change (tab/WebView becomes visible again)
    const handleVisibilityChange = () => {
      console.log('[AutoDialer] visibilitychange:', document.visibilityState, 'callInitiated:', callInitiatedRef.current)
      if (document.visibilityState === 'visible') {
        if (callInitiatedRef.current) {
          handleReturnFromDialer()
        } else {
          // Also check sessionStorage in case ref was lost (page reload)
          const pendingData = checkPendingCall()
          if (pendingData) {
            handleReturnFromDialer(pendingData)
          }
        }
      }
    }

    // Listen for window focus (WebView regains focus)
    const handleFocus = () => {
      console.log('[AutoDialer] window focus event, callInitiated:', callInitiatedRef.current)
      if (callInitiatedRef.current) {
        handleReturnFromDialer()
      } else {
        const pendingData = checkPendingCall()
        if (pendingData) {
          handleReturnFromDialer(pendingData)
        }
      }
    }

    // Listen for pageshow (page restored from bfcache or back navigation)
    const handlePageShow = (e: PageTransitionEvent) => {
      console.log('[AutoDialer] pageshow, persisted:', e.persisted)
      if (e.persisted) {
        const pendingData = checkPendingCall()
        if (pendingData) {
          handleReturnFromDialer(pendingData)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handlePageShow as EventListener)

    // Listen for global event dispatched by Android bridge (from page.tsx)
    const handleGlobalDisposition = (e: Event) => {
      console.log('[AutoDialer] Global disposition event received')
      handleReturnFromDialer()
    }
    window.addEventListener('show-disposition-from-dialer', handleGlobalDisposition)

    // Also check on mount — in case we navigated here via page.tsx auto-redirect
    const pendingData = checkPendingCall()
    if (pendingData) {
      setTimeout(() => handleReturnFromDialer(pendingData), 800)
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageShow as EventListener)
      window.removeEventListener('show-disposition-from-dialer', handleGlobalDisposition)
    }
  }, [checkPendingCall, handleReturnFromDialer])

  // Expose global function for Android evaluateJavascript
  // Android WebView can call: webView.evaluateJavascript("showPostCallDisposition('7458898305')", null)
  useEffect(() => {
    (window as unknown as Record<string, unknown>).showPostCallDisposition = (phoneNumber: string) => {
      console.log('[AutoDialer] showPostCallDisposition called from Android:', phoneNumber)
      // Prevent duplicate triggers
      if (dispositionShownRef.current) {
        console.log('[AutoDialer] Disposition already shown, skipping Android bridge trigger')
        return
      }
      callInitiatedRef.current = false
      setCallInitiated(false)
      stopCallTimer()
      // Read and restore candidate from sessionStorage BEFORE clearing
      const stored = checkPendingCall()
      clearCallState()
      if (stored) {
        // handleReturnFromDialer will set the guard
        handleReturnFromDialer(stored)
      } else {
        // No stored data — open the modal directly (set guard manually)
        dispositionShownRef.current = true
        setTimeout(() => {
          setIsDispositionModalOpen(true)
        }, 500)
      }
    }
    return () => {
      delete (window as unknown as Record<string, unknown>).showPostCallDisposition
    }
  }, [clearCallState, checkPendingCall, handleReturnFromDialer])

  // ==================== CALL TIMER HELPERS ====================
  const startCallTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setCallTimer(0)
    timerRef.current = setInterval(() => {
      setCallTimer((prev) => prev + 1)
    }, 1000)
  }

  const stopCallTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // ==================== PRE-CALL DELAY TIMER ====================
  // Shows a countdown overlay before automatically placing the call.
  // When countdown reaches 0, it programmatically opens the phone dialer.
  const cancelPreCallTimer = () => {
    if (preCallTimerRef.current) {
      clearInterval(preCallTimerRef.current)
      preCallTimerRef.current = null
    }
    setPreCallCountdown(null)
  }

  // Execute the actual call — programmatically trigger tel: link
  // First tries Android native bridge (ACTION_CALL = direct dial), falls back to tel: link (ACTION_DIAL = open dialer)
  const executeCall = () => {
    if (!currentCandidate?.phone) {
      toast.error('No phone number available')
      return
    }
    const phone = cleanPhone(currentCandidate.phone)
    if (!phone || phone.length < 7) {
      toast.error('Invalid phone number')
      return
    }

    // ===== STATUS CHECK: Only allow calls when status is ACTIVE or LUNCH =====
    try {
      const rawStatus = localStorage.getItem('recruiter_current_status')
      const allowedStatuses = ['ACTIVE', 'LUNCH']
      if (!rawStatus || !allowedStatuses.includes(rawStatus)) {
        const statusLabel = rawStatus || 'not set'
        toast.error(`⚠️ Status is ${statusLabel}. Please set your status to Active or Lunch before making calls.`, { duration: 4000 })
        stopCallTimer()
        callInitiatedRef.current = false
        setCallInitiated(false)
        clearCallState()
        return
      }
    } catch {
      // If localStorage read fails, block the call (safer default)
      toast.error('⚠️ Could not verify your status. Please go to Dashboard and set your status to Active or Lunch.', { duration: 4000 })
      stopCallTimer()
      callInitiatedRef.current = false
      setCallInitiated(false)
      clearCallState()
      return
    }

    // Mark call as initiated
    callInitiatedRef.current = true
    setCallInitiated(true)
    startCallTimer()
    recordCallActivity() // Reset auto-idle timer on call initiation

    // Persist to sessionStorage — survives if WebView reloads the page
    saveCallState(currentCandidate!)

    console.log('[AutoDialer] executeCall for:', phone)

    // ===== ANDROID WEBVIEW: Use native bridge to place call directly (ACTION_CALL) =====
    // This bypasses the phone dialer UI and calls the number directly.
    // The Android app must implement: AndroidBridge.makeCall(phoneNumber)
    //   → Intent(Intent.ACTION_CALL, Uri.parse("tel:" + phoneNumber))
    //   → Requires CALL_PHONE permission in AndroidManifest.xml
    try {
      const bridge = (window as unknown as Record<string, unknown>).AndroidBridge as
        { makeCall: (phoneNumber: string) => void } | undefined
      if (bridge?.makeCall) {
        console.log('[AutoDialer] Using AndroidBridge.makeCall for direct dial:', phone)
        bridge.makeCall(phone)
        return
      }
    } catch {
      // Bridge not available — fall through to tel: link
    }

    // ===== ENHANCED: Try window._autoDial bridge (custom WebView injection) =====
    // Some WebView implementations inject a custom global function for direct calling
    try {
      const autoDial = (window as unknown as Record<string, unknown>)._autoDial as
        ((phoneNumber: string) => void) | undefined
      if (typeof autoDial === 'function') {
        console.log('[AutoDialer] Using window._autoDial for direct dial:', phone)
        autoDial(phone)
        return
      }
    } catch {
      // Not available — fall through
    }

    // ===== FALLBACK: tel: link (ACTION_DIAL) — opens phone dialer with number pasted =====
    // This is the standard web behavior; requires user to press Call in the dialer.
    console.log('[AutoDialer] AndroidBridge.makeCall not available, falling back to tel: link')
    triggerNativeLink(`tel:${phone}`)
    toast.info('Opening dialer... Please press Call to connect.', { duration: 2000 })
  }

  // Helper: check if current status allows calling
  const canMakeCalls = (): boolean => {
    try {
      const rawStatus = localStorage.getItem('recruiter_current_status')
      return !!rawStatus && (rawStatus === 'ACTIVE' || rawStatus === 'LUNCH')
    } catch {
      return false
    }
  }

  // Start pre-call countdown — when it reaches 0, executeCall is called
  const startPreCallTimer = () => {
    if (!currentCandidate?.phone) {
      toast.error('No phone number available')
      return
    }
    const phone = cleanPhone(currentCandidate.phone)
    if (!phone || phone.length < 7) {
      toast.error('Invalid phone number')
      return
    }

    // Status check BEFORE starting countdown
    if (!canMakeCalls()) {
      toast.error('⚠️ Please set your status to Active or Lunch before making calls.', { duration: 4000 })
      return
    }

    setPreCallCountdown(callGap)
    if (preCallTimerRef.current) clearInterval(preCallTimerRef.current)
    preCallTimerRef.current = setInterval(() => {
      setPreCallCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (preCallTimerRef.current) clearInterval(preCallTimerRef.current)
          preCallTimerRef.current = null
          setPreCallCountdown(null)
          // Automatically place the call
          executeCall()
          return null
        }
        return prev - 1
      })
    }, 1000)
  }

  // Skip pre-call countdown and call immediately
  const skipPreCallAndDial = () => {
    // Status check before calling
    if (!canMakeCalls()) {
      cancelPreCallTimer()
      toast.error('⚠️ Please set your status to Active or Lunch before making calls.', { duration: 4000 })
      return
    }
    cancelPreCallTimer()
    executeCall()
  }

  // ==================== ANDROID BACK BUTTON + CLOSE ALL MODALS ====================
  // Listen for 'close-all-modals' event (dispatched by page.tsx on back button)
  // Also push a history entry when disposition opens so back button works
  useEffect(() => {
    const handleCloseAllModals = () => {
      console.log('[AutoDialer] close-all-modals event received')
      if (isDispositionModalOpen && !savingRecord) {
        setIsDispositionModalOpen(false)
        clearCallState()
        setCallInitiated(false)
        callInitiatedRef.current = false
        stopCallTimer()
      }
      // Close gap timer if open
      if (callGapCountdown !== null && gapTimerRef.current) {
        clearInterval(gapTimerRef.current)
        gapTimerRef.current = null
        setCallGapCountdown(null)
      }
      // Cancel pre-call timer if open
      cancelPreCallTimer()
      // Close client/template sheets
      setTemplateSheetOpen(null)
    }
    window.addEventListener('close-all-modals', handleCloseAllModals)

    return () => {
      window.removeEventListener('close-all-modals', handleCloseAllModals)
    }
  }, [isDispositionModalOpen, savingRecord, clearCallState, stopCallTimer, templateSheetOpen])

  // Push history entry when disposition opens (enables Android back button)
  useEffect(() => {
    if (isDispositionModalOpen) {
      try {
        const pushHistory = (window as unknown as Record<string, unknown>).__pushModalHistory
        if (typeof pushHistory === 'function') pushHistory()
      } catch { /* ignore */ }
    }
  }, [isDispositionModalOpen])

  // Web Speech API helper — also checks for Android WebView support
  const createRecognition = () => {
    if (typeof window === 'undefined') return null
    const hasSupport = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
    if (!hasSupport) return null
    const SpeechRecognitionCtor = (window as unknown as Record<string, unknown>).webkitSpeechRecognition || (window as unknown as Record<string, unknown>).SpeechRecognition
    const recognition = new (SpeechRecognitionCtor as new () => unknown)() as {
      lang: string; continuous: boolean; interimResults: boolean
      onresult: ((event: { results: { [0]: { [0]: { transcript: string } } } }) => void) | null
      onerror: ((event: { error: string }) => void) | null
      onend: (() => void) | null; onaudiostart: (() => void) | null
      start: () => void; stop: () => void
    }
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = false
    return recognition
  }

  // Detect Android bridge on mount — poll for it since WebView injects bridge after page load.
  // The voice button is always shown; the toggleVoiceInput function re-checks at click-time.
  useEffect(() => {
    let attempts = 0
    const maxAttempts = 10 // 500ms × 10 = 5 seconds
    const pollInterval = setInterval(() => {
      attempts++
      const bridgeFound = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).AndroidBridge
      if (bridgeFound) {
        clearInterval(pollInterval)
      } else if (attempts >= maxAttempts) {
        clearInterval(pollInterval)
      }
    }, 500)
    return () => clearInterval(pollInterval)
  }, [])

  // Cleanup Android bridge callback on unmount
  useEffect(() => {
    return () => {
      try { delete (window as unknown as Record<string, unknown>).__onSpeechResult } catch { /* ignore */ }
    }
  }, [])

  const toggleVoiceInput = async () => {
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch { /* ignore */ }
      }
      recognitionRef.current = null
      setIsListening(false)
      return
    }

    // ===== ANDROID WEBVIEW: Native speech recognition via Java bridge =====
    // Web Speech API (webkitSpeechRecognition) is NOT available inside Android WebView.
    // Instead, we call the Android Java bridge which launches the system SpeechRecognizer
    // and returns results via window.__onSpeechResult callback.
    // Re-check bridge at click-time (it may have loaded after mount)
    const bridge = (window as unknown as Record<string, unknown>).AndroidBridge as
      { startSpeechRecognition: () => void } | undefined
    if (bridge?.startSpeechRecognition) {
      ;(window as unknown as Record<string, unknown>).__onSpeechResult = (
        transcript: string | null, error: string | null
      ) => {
        if (error === 'not_available') {
          toast.error('Speech recognition not available on this device')
        }
        // error === 'cancelled' means user dismissed — silent
        if (transcript) {
          setNotes((prev) => (prev ? prev + ' ' : '') + transcript)
          toast.success('Voice added to notes')
        }
        setIsListening(false)
      }
      setIsListening(true)
      bridge.startSpeechRecognition()
      return
    }

    // ===== BROWSER: Web Speech API fallback (Chrome desktop, etc.) =====
    // Re-check at click-time in case Web Speech API became available
    const recognition = createRecognition()
    if (!recognition) {
      toast.error('Voice input is not supported in this app. Use the Android app for voice features.')
      return
    }

    // Request mic permission via getUserMedia (needed for SpeechRecognition to work in some browsers)
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Release the mic stream immediately — we only needed the permission grant
      micStream.getTracks().forEach(t => t.stop())
    } catch (micErr) {
      console.warn('[Voice] getUserMedia failed (mic may still work):', micErr)
    }

    recognitionRef.current = recognition

    recognition.onresult = (event: { results: { [0]: { [0]: { transcript: string } } } }) => {
      const transcript = event.results[0]?.[0]?.transcript || ''
      if (transcript) {
        setNotes((prev) => (prev ? prev + ' ' : '') + transcript)
        toast.success('Voice added to notes')
      }
      setIsListening(false)
      recognitionRef.current = null
    }

    recognition.onerror = (event: { error: string }) => {
      console.error('[AutoDialer] Speech recognition error:', event?.error)
      if (event?.error === 'not-allowed') {
        toast.error('Microphone permission denied. Please allow microphone access in your device settings.')
      } else {
        toast.error('Voice input failed. Please try again.')
      }
      setIsListening(false)
      recognitionRef.current = null
    }

    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    try {
      recognition.start()
      setIsListening(true)
    } catch (recErr) {
      console.error('[Voice] Failed to start recognition:', recErr)
      toast.error('Failed to start voice input')
    }
  }

  // Template helper: replace placeholders
  const fillTemplate = (content: string) => {
    if (!currentCandidate) return content
    return content
      .replace(/\{\{candidate_name\}\}/g, currentCandidate.name)
      .replace(/\{\{phone\}\}/g, currentCandidate.phone)
      .replace(/\{\{role\}\}/g, currentCandidate.role || '')
      .replace(/\{\{location\}\}/g, currentCandidate.location || '')
      .replace(/\{\{company\}\}/g, currentCandidate.company || '')
      .replace(/\{\{recruiter_name\}\}/g, user?.name || 'Recruiter')
  }

  // All templates are available for both SMS and WhatsApp sending
  // DB type values: NOT_ANSWERED, SHORTLISTED, CUSTOM (not SMS/WHATSAPP)

  // Helper: programmatically trigger a native link click.
  // This is the MOST reliable way to open tel:/sms:/https: links in Android WebView
  // because it simulates a real user tap — which always fires shouldOverrideUrlLoading.
  // window.open() does NOT reliably trigger it (especially with _blank target).
  const triggerNativeLink = (url: string) => {
    // Method 1: Hidden anchor click (triggers WebView shouldOverrideUrlLoading)
    try {
      const a = document.createElement('a')
      a.href = url
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => { try { document.body.removeChild(a) } catch { /* ignore */ } }, 300)
    } catch {
      // Method 2: Direct navigation fallback
      try { window.location.href = url } catch { /* ignore */ }
    }
  }

  const handleSendSms = () => {
    const tmpl = templates.find((t) => t.id === selectedSmsTemplate)
    const msg = tmpl ? fillTemplate(tmpl.content) : ''
    if (!msg) { toast.error('No message to send'); return }
    const phone = cleanPhone(currentCandidate?.phone || '')
    setSelectedSmsText(msg)
    try { window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}` } catch { triggerNativeLink(`sms:${phone}?body=${encodeURIComponent(msg)}`) }
    setTemplateSheetOpen(null)
    toast.success('Opening SMS app...')
  }

  const handleSendWhatsApp = () => {
    const tmpl = templates.find((t) => t.id === selectedWaTemplate)
    const msg = tmpl ? fillTemplate(tmpl.content) : ''
    if (!msg) { toast.error('No message to send'); return }
    const phone = formatPhoneForWhatsApp(currentCandidate?.phone || '')
    setSelectedWaText(msg)
    try { window.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` } catch { triggerNativeLink(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`) }
    setTemplateSheetOpen(null)
    toast.success('Opening WhatsApp...')
  }

  // Load candidates for a list
  const loadCandidates = useCallback(async (listId: string) => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/call-lists/${listId}/candidates`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const pending = (data.candidates || []).filter(
        (c: Candidate) => c.status === 'PENDING' || c.status === 'SCHEDULED'
      )
      setCandidates(pending)
    } catch {
      toast.error('Failed to load candidates')
    }
    setLoading(false)
  }, [])

  // Select a call list and go to summary
  const handleSelectList = (list: CallListInfo) => {
    setSelectedList(list)
    loadCandidates(list.id)
    setScreen('list-summary')
  }

  // Start calling
  const handleStartCalling = () => {
    if (candidates.length === 0) {
      toast.error('No candidates to call')
      return
    }
    // Status check before entering calling mode
    if (!canMakeCalls()) {
      toast.error('⚠️ Please set your status to Active or Lunch on the Dashboard before making calls.', { duration: 4000 })
      return
    }
    setCurrentIndex(0)
    setCompletedCount(0)
    setScreen('calling')
    advanceToCandidate(0)
  }

  /* ==================== PREPARE CALL STATE (before native tel: link activates) ====================
   * IMPORTANT: The Call button is a REAL <a href="tel:..."> link.
   * This is the ONLY method that reliably triggers Android WebView's shouldOverrideUrlLoading.
   * This function runs on onTouchStart/onMouseDown — BEFORE the native click completes.
   * The native <a> click then sends the tel: URL to Android, which opens the phone dialer.
   */
  const prepareCall = (e: React.TouchEvent | React.MouseEvent) => {
    if (!currentCandidate?.phone) {
      e.preventDefault()
      toast.error('No phone number available')
      return
    }
    const phone = cleanPhone(currentCandidate.phone)
    if (!phone || phone.length < 7) {
      e.preventDefault()
      toast.error('Invalid phone number')
      return
    }

    // Mark call as initiated — these run BEFORE the native <a> click navigates
    callInitiatedRef.current = true
    setCallInitiated(true)
    startCallTimer()
    recordCallActivity() // Reset auto-idle timer on call initiation

    // Persist to sessionStorage — survives if WebView reloads the page
    saveCallState(currentCandidate!)

    console.log('[AutoDialer] prepareCall ready for:', phone, '— native tel: link will handle the rest')

    // Do NOT call e.preventDefault() here!
    // Let the native <a href="tel:..."> click proceed so Android WebView intercepts it.
  }

  // Advance to a specific candidate index
  const advanceToCandidate = (idx: number) => {
    if (idx >= candidates.length) {
      toast.success('All calls completed!')
      setScreen('select-list')
      return
    }
    const candidate = candidates[idx]
    setCurrentCandidate(candidate)
    setCurrentIndex(idx)
    setCallTimer(0)
    setCallInitiated(false)
    callInitiatedRef.current = false
    setSelectedDisposition('')
    setSelectedClient('')
    setCustomClientName('')
    setNotes('')
    setScheduledDate('')
    setF2fInterviewDate('')
    setSelectedSmsTemplate('')
    setSelectedWaTemplate('')
    setSelectedSmsText('')
    setSelectedWaText('')
    setTemplateSheetOpen(null)
    setIsListening(false)
    setIsDispositionModalOpen(false)
    // Reset the disposition shown guard for the next call
    dispositionShownRef.current = false
    // Clear pre-call timer
    cancelPreCallTimer()
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // Cancel current call
  const handleCancelCall = () => {
    stopCallTimer()
    cancelPreCallTimer()
    callInitiatedRef.current = false
    setCallInitiated(false)
    clearCallState()
    toast.info('Call cancelled')
    setScreen('list-summary')
  }

  // Skip current candidate
  const handleSkip = () => {
    stopCallTimer()
    cancelPreCallTimer()
    callInitiatedRef.current = false
    setCallInitiated(false)
    clearCallState()
    toast.info('Candidate skipped')
    setCompletedCount((prev) => prev + 1)
    startGapTimer(currentIndex + 1)
  }

  // Manually open disposition (user clicks "End Call & Log" button)
  const handleManualEndCall = () => {
    stopCallTimer()
    callInitiatedRef.current = false
    setCallInitiated(false)
    clearCallState()
    setIsDispositionModalOpen(true)
  }

  // Gap timer between calls
  const startGapTimer = (nextIdx: number) => {
    setCallGapCountdown(callGap)
    if (gapTimerRef.current) clearInterval(gapTimerRef.current)
    gapTimerRef.current = setInterval(() => {
      setCallGapCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (gapTimerRef.current) clearInterval(gapTimerRef.current)
          gapTimerRef.current = null
          setCallGapCountdown(null)
          advanceToCandidate(nextIdx)
          setScreen('calling')
          return null
        }
        return prev - 1
      })
    }, 1000)
  }

  /* ==================== SAVE HELPERS ==================== */
  const buildSaveBody = () => {
    const isScheduled = !!scheduledDate

    const body: Record<string, unknown> = {
      candidateId: currentCandidate!.id,
      recruiterId: userId,
      dispositionId: selectedDisposition,
      notes: notes || null,
      callDuration: callTimer,
      callStatus: isScheduled ? 'SCHEDULED' : 'COMPLETED',
      scheduledAt: isScheduled ? new Date(scheduledDate).toISOString() : null,
      f2fInterviewDate: f2fInterviewDate ? new Date(f2fInterviewDate).toISOString() : null,
    }

    // Always save client if selected (not just for shortlisted)
    if (selectedClient === '__other__') {
      body.customClientName = customClientName || null
    } else if (selectedClient) {
      body.clientId = selectedClient
    }

    return { body }
  }

  const validateSave = (): string | null => {
    if (!currentCandidate || !selectedDisposition) {
      return 'Please select a disposition'
    }
    // Client is optional for all dispositions — no mandatory check
    return null
  }

  /* ==================== SAVE & NEXT CALL ==================== */
  const handleSaveAndNext = async () => {
    const validationError = validateSave()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setSavingRecord(true)
    try {
      const { body } = buildSaveBody()
      console.log('[AutoDialer] Saving call record:', JSON.stringify(body))

      const res = await authFetch('/api/call-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        // Read the actual error message from the API
        let errorMsg = 'Failed to save call record'
        try {
          const errData = await res.json()
          errorMsg = errData.error || errorMsg
          console.error('[AutoDialer] Save failed:', res.status, errData)
        } catch {
          console.error('[AutoDialer] Save failed:', res.status, '(could not parse error body)')
        }
        toast.error(errorMsg)
        return
      }

      const result = await res.json()
      console.log('[AutoDialer] Call record saved successfully:', result.callRecord?.id)
      recordCallActivity() // Reset auto-idle timer on call record save

      toast.success('Call record saved! Moving to next contact...')
      setIsDispositionModalOpen(false)
      clearCallState()
      // Reset the duplicate trigger guard for the next call
      dispositionShownRef.current = false
      setCompletedCount((prev) => prev + 1)

      // Check if there's a next candidate
      const nextIdx = currentIndex + 1
      if (nextIdx < candidates.length) {
        // Show gap timer then advance to next
        startGapTimer(nextIdx)
      } else {
        toast.success('All calls completed!')
        setScreen('select-list')
      }
    } catch (err) {
      console.error('[AutoDialer] Save error:', err)
      toast.error('Failed to save call record. Please try again.')
    }
    setSavingRecord(false)
  }

  // Save without advancing (just save current record)
  const handleSaveOnly = async () => {
    const validationError = validateSave()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setSavingRecord(true)
    try {
      const { body } = buildSaveBody()
      console.log('[AutoDialer] Saving call record:', JSON.stringify(body))

      const res = await authFetch('/api/call-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        // Read the actual error message from the API
        let errorMsg = 'Failed to save call record'
        try {
          const errData = await res.json()
          errorMsg = errData.error || errorMsg
          console.error('[AutoDialer] Save failed:', res.status, errData)
        } catch {
          console.error('[AutoDialer] Save failed:', res.status, '(could not parse error body)')
        }
        toast.error(errorMsg)
        return
      }

      const result = await res.json()
      console.log('[AutoDialer] Call record saved successfully:', result.callRecord?.id)
      recordCallActivity() // Reset auto-idle timer on call record save

      toast.success('Call record saved')
      setIsDispositionModalOpen(false)
      clearCallState()
      // Reset the duplicate trigger guard for the next call
      dispositionShownRef.current = false
      setCompletedCount((prev) => prev + 1)
      setScreen('select-list')
    } catch (err) {
      console.error('[AutoDialer] Save error:', err)
      toast.error('Failed to save call record. Please try again.')
    }
    setSavingRecord(false)
  }

  const pendingCandidates = candidates.length - completedCount

  /* ==================== SCREEN: Select Call List ==================== */
  if (screen === 'select-list') {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => onNavigate('home')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Auto Dialer</h1>
            <p className="text-sm text-muted-foreground">Select a call list to begin calling</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : callLists.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No Call Lists Assigned</p>
              <p className="text-sm text-muted-foreground mt-1">Contact your admin to get assigned a list.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {callLists.map((list) => {
              const total = list.candidates.length
              const pending = list.candidates.filter(
                (c) => c.status === 'PENDING' || c.status === 'SCHEDULED'
              ).length
              const done = list.candidates.filter((c) => c.status === 'DONE').length
              const progress = total > 0 ? Math.round((done / total) * 100) : 0
              return (
                <Card
                  key={list.id}
                  className="cursor-pointer transition-all hover:shadow-md hover:border-emerald-200"
                  onClick={() => handleSelectList(list)}
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-sm sm:text-base truncate">{list.name}</h3>
                        {list.description && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{list.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <ListChecks className="h-3 w-3" />
                            {total} total
                          </span>
                          <span className="text-amber-600 font-medium">{pending} pending</span>
                          <span className="text-emerald-600 font-medium">{done} done</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <Badge variant="secondary" className="text-[10px]">{progress}%</Badge>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                          Select
                          <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  /* ==================== SCREEN: List Summary ==================== */
  if (screen === 'list-summary') {
    const totalCandidates = candidates.length
    const estimatedMinutes = totalCandidates * 5 // rough estimate
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setScreen('select-list')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">List Summary</h1>
            <p className="text-sm text-muted-foreground">{selectedList?.name}</p>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50">
                  <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">{totalCandidates}</p>
                  <p className="text-sm text-emerald-600 mt-1 dark:text-emerald-400">Candidates to Call</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-blue-50 dark:bg-blue-950/50">
                  <p className="text-3xl font-bold text-blue-700 dark:text-blue-400">~{estimatedMinutes}m</p>
                  <p className="text-sm text-blue-600 mt-1 dark:text-blue-400">Est. Time</p>
                </div>
                <div className="text-center p-4 rounded-xl bg-purple-50 col-span-2 sm:col-span-1 dark:bg-purple-950/50">
                  <p className="text-3xl font-bold text-purple-700 dark:text-purple-400">{callGap}s</p>
                  <p className="text-sm text-purple-600 mt-1 dark:text-purple-400">Call Gap</p>
                </div>
              </div>

              {totalCandidates === 0 ? (
                <div className="text-center py-8">
                  <Check className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                  <p className="font-medium">All Done!</p>
                  <p className="text-sm text-muted-foreground mt-1">No pending candidates in this list.</p>
                </div>
              ) : (
                <>
                  {!canMakeCalls() && (
                    <div className="w-full p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800">
                      <p className="text-sm text-amber-700 dark:text-amber-400 font-medium flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        Calling is disabled — Please set your status to <strong>Active</strong> or <strong>Lunch</strong> on the Dashboard before making calls.
                      </p>
                    </div>
                  )}
                  <Button
                    size="lg"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-14 text-base"
                    onClick={handleStartCalling}
                  >
                    <Phone className="h-5 w-5 mr-2" />
                    Start Calling ({totalCandidates} candidates)
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  /* ==================== SCREEN: Calling (Candidate Card + Call Button) ==================== */
  if (screen === 'calling' && currentCandidate) {

    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-lg mx-auto">
        {/* ===== TOP HEADER: Back button + progress ===== */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-11 w-11 p-0 rounded-full shrink-0"
            onClick={() => {
              // Stop any in-progress call state
              stopCallTimer()
              callInitiatedRef.current = false
              setCallInitiated(false)
              clearCallState()
              setIsDispositionModalOpen(false)
              if (gapTimerRef.current) {
                clearInterval(gapTimerRef.current)
                gapTimerRef.current = null
                setCallGapCountdown(null)
              }
              setScreen('list-summary')
            }}
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground truncate">
                {completedCount}/{candidates.length} completed
              </span>
              <span className="font-medium shrink-0 ml-2">{pendingCandidates} left</span>
            </div>
            <Progress value={(completedCount / candidates.length) * 100} className="h-2 mt-1" />
          </div>
        </div>

        {/* Candidate info card */}
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-4">
            {/* Candidate details */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">
                  <User className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-lg truncate">{currentCandidate.name}</p>
                  {currentCandidate.company && (
                    <p className="text-sm text-muted-foreground truncate">{currentCandidate.company}</p>
                  )}
                </div>
                {callInitiated && (
                  <Badge variant="outline" className="text-[10px] shrink-0 text-emerald-600 border-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
                    {formatDuration(callTimer)}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                {currentCandidate.role && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {currentCandidate.role}
                  </span>
                )}
                {currentCandidate.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {currentCandidate.location}
                  </span>
                )}
              </div>
              <p className="text-xl font-mono font-bold tracking-wider text-foreground">
                {currentCandidate.phone}
              </p>
            </div>

            <Separator />

            {/* Call timer (only visible after Call button pressed) */}
            {callInitiated && (
              <div className="text-center py-1">
                <div className="flex items-center justify-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-2xl font-mono font-bold tabular-nums">
                    {formatDuration(callTimer)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Call in progress — return after finishing</p>
              </div>
            )}

            {/* ===== CALL BUTTON — starts pre-call delay timer ===== */}
            <Button
              onClick={startPreCallTimer}
              onTouchEnd={(e) => { e.preventDefault(); startPreCallTimer() }}
              disabled={callInitiated || preCallCountdown !== null}
              className={cn(
                'flex items-center justify-center gap-2 w-full h-16 rounded-lg text-white font-semibold text-base no-underline',
                'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800',
                (callInitiated || preCallCountdown !== null) && 'opacity-50 pointer-events-none'
              )}
              style={{ touchAction: 'manipulation' }}
            >
              <PhoneCall className="h-6 w-6" />
              <span>Call {currentCandidate.phone}</span>
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12 flex items-center justify-center gap-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-200"
                onClick={handleSkip}
              >
                <SkipForward className="h-4 w-4" />
                <span className="text-sm font-medium">Skip</span>
              </Button>
              <Button
                className="h-12 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleManualEndCall}
              >
                <ClipboardCheck className="h-4 w-4" />
                <span className="text-sm font-medium">End Call &amp; Log</span>
              </Button>
            </div>

            {/* Next Call + Cancel row */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-12 flex items-center justify-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                onClick={handleCancelCall}
              >
                <PhoneOff className="h-4 w-4" />
                <span className="text-sm font-medium">Cancel Session</span>
              </Button>
              <Button
                variant="outline"
                className="h-12 flex items-center justify-center gap-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                disabled={completedCount === 0 || callInitiated || callGapCountdown !== null || preCallCountdown !== null}
                onClick={() => {
                  // Next Call: skip gap timer, jump to the next pending candidate
                  if (gapTimerRef.current) {
                    clearInterval(gapTimerRef.current)
                    gapTimerRef.current = null
                    setCallGapCountdown(null)
                  }
                  cancelPreCallTimer()
                  const nextIdx = currentIndex + 1
                  if (nextIdx < candidates.length) {
                    advanceToCandidate(nextIdx)
                    setScreen('calling')
                    toast.success(`Moving to candidate ${nextIdx + 1}`)
                  } else {
                    toast.success('All calls completed!')
                    setScreen('select-list')
                  }
                }}
                title={completedCount === 0 ? 'Complete or skip current call first' : `Go to next call (${currentIndex + 2}/${candidates.length})`}
              >
                <ChevronRight className="h-4 w-4" />
                <span className="text-sm font-medium">Next Call</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ==================== PRE-CALL DELAY TIMER OVERLAY ==================== */}
        {preCallCountdown !== null && (
          <>
            {/* Mobile: Custom CSS overlay */}
            {isMobile && <div>
              <div
                className="fixed inset-0 bg-black/50 flex items-center justify-center"
                style={{ zIndex: 10003, touchAction: 'manipulation' }}
              >
                <div
                  className="bg-background rounded-2xl shadow-2xl p-6 mx-4 max-w-xs w-full text-center relative"
                  style={{ touchAction: 'manipulation', zIndex: 10003 }}
                >
                  {/* Close button */}
                  <button
                    type="button"
                    onClick={cancelPreCallTimer}
                    className="absolute -top-2 -right-2 h-11 w-11 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-red-100 hover:text-red-600 shadow-md"
                    style={{ touchAction: 'manipulation' }}
                    aria-label="Cancel"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <div className="py-4 space-y-3">
                    <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center mx-auto">
                      <PhoneCall className="h-7 w-7 animate-pulse" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Calling in...</p>
                    <p className="text-3xl font-mono font-bold">{preCallCountdown}s</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">{currentCandidate.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{currentCandidate.phone}</p>
                    <Button
                      className="mt-3 h-11 w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={skipPreCallAndDial}
                      style={{ touchAction: 'manipulation' }}
                    >
                      <Phone className="h-4 w-4 mr-1.5" />
                      Call Now
                    </Button>
                  </div>
                </div>
              </div>
            </div>}
            {/* Desktop: Dialog */}
            {!isMobile && (
              <Dialog open>
                <DialogContent className="sm:max-w-xs text-center" showCloseButton={false}>
                  <div className="py-6 space-y-3">
                    <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center mx-auto">
                      <PhoneCall className="h-7 w-7 animate-pulse" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Calling in...</p>
                    <p className="text-2xl font-mono font-bold">{preCallCountdown}s</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">{currentCandidate.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{currentCandidate.phone}</p>
                    <Button
                      className="mt-2 bg-emerald-600 hover:bg-emerald-700"
                      onClick={skipPreCallAndDial}
                    >
                      <Phone className="h-4 w-4 mr-1.5" />
                      Call Now
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </>
        )}

        {/* ==================== GAP TIMER OVERLAY ==================== */}
        {callGapCountdown !== null && (
          <>
            {/* Mobile: Custom CSS overlay — NO Radix Dialog Portal (freezes WebView) */}
            {isMobile && <div>
              <div
                className="fixed inset-0 bg-black/50 flex items-center justify-center"
                style={{ zIndex: 10003, touchAction: 'manipulation' }}
              >
                <div
                  className="bg-background rounded-2xl shadow-2xl p-6 mx-4 max-w-xs w-full text-center relative"
                  style={{ touchAction: 'manipulation', zIndex: 10003 }}
                >
                  {/* Close button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (gapTimerRef.current) clearInterval(gapTimerRef.current)
                      gapTimerRef.current = null
                      setCallGapCountdown(null)
                      setScreen('list-summary')
                    }}
                    className="absolute -top-2 -right-2 h-11 w-11 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-red-100 hover:text-red-600 transition-colors shadow-md"
                    style={{ touchAction: 'manipulation' }}
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <div className="py-4 space-y-3">
                    <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center mx-auto">
                      <Clock className="h-7 w-7 animate-pulse" />
                    </div>
                    <p className="text-3xl font-mono font-bold">{callGapCountdown}s</p>
                    <p className="text-sm text-muted-foreground">Next call starting...</p>
                    <p className="text-xs text-muted-foreground">
                      Up next: <span className="font-medium">{candidates[currentIndex + 1]?.name}</span>
                    </p>
                    <Button
                      variant="outline"
                      className="mt-3 h-11 w-full"
                      onClick={() => {
                        if (gapTimerRef.current) clearInterval(gapTimerRef.current)
                        gapTimerRef.current = null
                        setCallGapCountdown(null)
                        advanceToCandidate(currentIndex + 1)
                        setScreen('calling')
                      }}
                      style={{ touchAction: 'manipulation' }}
                    >
                      Call Now
                    </Button>
                  </div>
                </div>
              </div>
            </div>}
            {!isMobile && (
              <Dialog open>
                <DialogContent className="sm:max-w-xs text-center" showCloseButton={false}>
                  <div className="py-6 space-y-3">
                    <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center justify-center mx-auto">
                      <Clock className="h-7 w-7 animate-pulse" />
                    </div>
                    <p className="text-2xl font-mono font-bold">{callGapCountdown}s</p>
                    <p className="text-sm text-muted-foreground">Next call starting...</p>
                    <p className="text-xs text-muted-foreground">
                      Up next: <span className="font-medium">{candidates[currentIndex + 1]?.name}</span>
                    </p>
                    <Button
                      variant="outline"
                      className="mt-2"
                      onClick={() => {
                        if (gapTimerRef.current) clearInterval(gapTimerRef.current)
                        gapTimerRef.current = null
                        setCallGapCountdown(null)
                        advanceToCandidate(currentIndex + 1)
                        setScreen('calling')
                      }}
                    >
                      Call Now
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </>
        )}

        {/* ==================== POST-CALL DISPOSITION MODAL ==================== */}
        {/* Mobile: Simple CSS bottom-sheet (NO vaul Drawer — freezes Android WebView) */}
        {isDispositionModalOpen && isMobile && (
          <div>
            {/* Overlay — clickable to close popup */}
            <div
              className="fixed inset-0 bg-black/40"
              style={{ zIndex: 10000, touchAction: 'none' }}
              onClick={() => {
                if (!savingRecord) {
                  setIsDispositionModalOpen(false)
                  clearCallState()
                  setCallInitiated(false)
                  callInitiatedRef.current = false
                  stopCallTimer()
                }
              }}
              aria-hidden="true"
            />
            {/* Bottom sheet — pure CSS, no body scroll lock, no portal
                CRITICAL: Do NOT set touchAction: manipulation on this container!
                That kills scroll inside Android WebView. Only set it on buttons.
                Height is calculated from window.innerHeight (JS), NOT CSS dvh/vh units. */}
            <div
              className="fixed left-0 right-0 bg-background border-t border-border rounded-t-2xl shadow-2xl"
              style={{
                bottom: 0,
                zIndex: 10001,
                /* Use JS-measured height — reliable in all Android WebView versions */
                height: sheetHeight > 100 ? `${sheetHeight}px` : '85vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Header: drag handle + close button (44px touch target) */}
              <div
                className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0 relative"
                style={{ touchAction: 'manipulation' }}
              >
                <div className="h-1 w-8 rounded-full bg-muted-foreground/25 mx-auto absolute left-0 right-0 top-2" />
                <div className="w-11" />
                <button
                  type="button"
                  onClick={() => {
                    if (!savingRecord) {
                      setIsDispositionModalOpen(false)
                      clearCallState()
                      setCallInitiated(false)
                      callInitiatedRef.current = false
                      stopCallTimer()
                    }
                  }}
                  disabled={savingRecord}
                  className="h-11 w-11 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-red-100 hover:text-red-600 active:bg-red-200 active:opacity-70"
                  style={{ touchAction: 'manipulation', pointerEvents: 'auto', position: 'relative', zIndex: 10 }}
                  aria-label="Close disposition"
                >
                  <X className="h-5 w-5" strokeWidth={2.5} />
                  <span className="sr-only">Close</span>
                </button>
              </div>
              <div className="px-4 pb-2 shrink-0">
                <p className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <PhoneIncoming className="h-4 w-4 text-emerald-600" />
                  Post-Call Disposition
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Log the call outcome for {currentCandidate.name}
                </p>
              </div>

              {/* Scrollable body — MUST allow native scroll in Android WebView */}
              <div
                className="overflow-y-auto overflow-x-hidden flex-1 px-4"
                style={{
                  WebkitOverflowScrolling: 'touch',
                  overscrollBehavior: 'contain',
                  /* Restore default touch behavior so scroll works */
                  touchAction: 'pan-y',
                  minHeight: 0,
                }}
              >
                <div className="space-y-4 pb-4">
                  {/* Candidate summary — compact */}
                  <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{currentCandidate.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{currentCandidate.phone}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{formatDuration(callTimer)}</Badge>
                    </div>
                    <div className="flex gap-4 text-xs pl-10 text-muted-foreground">
                      {currentCandidate.role && (
                        <span className="flex items-center gap-1 truncate">
                          <Briefcase className="h-3 w-3 shrink-0 text-emerald-500" />
                          <span className="truncate">{currentCandidate.role}</span>
                        </span>
                      )}
                      {currentCandidate.location && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3 shrink-0 text-emerald-500" />
                          <span className="truncate">{currentCandidate.location}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Disposition selector */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Call Disposition <span className="text-red-500">*</span></Label>
                    <div className="grid grid-cols-2 gap-2">
                      {dispositions.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setSelectedDisposition(d.id)}
                          style={{ touchAction: 'manipulation' }}
                          className={cn(
                            'px-3 py-2.5 rounded-lg text-xs font-medium border text-left min-h-[44px] flex items-center',
                            selectedDisposition === d.id
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500'
                              : 'border-border text-muted-foreground'
                          )}
                        >
                          {d.heading}
                        </button>
                      ))}
                    </div>
                    {dispositions.length === 0 && (
                      <p className="text-xs text-muted-foreground">No dispositions configured. Ask your admin.</p>
                    )}
                  </div>

                  {/* Client dropdown — native <select> for Android WebView compatibility.
                      Position:absolute dropdowns get clipped by overflow:hidden parent
                      and break touch scroll in Android WebView. Native <select> renders as
                      a system dialog — immune to scroll and overflow issues. */}
                  <div className="space-y-2">
                      <Label className="text-sm font-medium">Client</Label>
                      <div className="relative">
                        <select
                          value={selectedClient || ''}
                          onChange={(e) => setSelectedClient(e.target.value)}
                          className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm appearance-none pr-10"
                          style={{ touchAction: 'manipulation' }}
                        >
                          <option value="">Select client...</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                          <option value="__other__">+ Other (enter manually)</option>
                        </select>
                        {/* Custom chevron icon overlaid on the native select */}
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </div>
                      </div>
                      {selectedClient === '__other__' && (
                        <input
                          type="text"
                          placeholder="Enter client name..."
                          value={customClientName}
                          onChange={(e) => setCustomClientName(e.target.value)}
                          className="w-full h-11 px-3 mt-2 rounded-lg border border-border bg-background text-sm"
                          style={{ touchAction: 'manipulation' }}
                        />
                      )}

                      {/* F2F Interview Date — always shown */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">F2F Interview Date</Label>
                        <input
                          type="date"
                          value={f2fInterviewDate}
                          onChange={(e) => setF2fInterviewDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
                          style={{ touchAction: 'manipulation' }}
                        />
                      </div>
                    </div>

                  {/* Notes with voice input */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Notes</Label>
                      <Button
                        type="button"
                        variant={isListening ? 'destructive' : 'outline'}
                        size="sm"
                        className={cn('h-10 text-xs gap-1.5 min-w-[88px]', isListening && 'animate-pulse')}
                        onClick={toggleVoiceInput}
                        style={{ touchAction: 'manipulation' }}
                      >
                        {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                        {isListening ? 'Stop' : 'Voice'}
                      </Button>
                    </div>
                    <div className="relative">
                      <Textarea
                        ref={notesRef}
                        placeholder={isListening ? 'Listening...' : 'Add call notes (optional)...'}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        className={cn('resize-none pr-10', isListening && 'ring-2 ring-red-300 border-red-300')}
                      />
                      {isListening && (
                        <div className="absolute top-2.5 right-2.5">
                          <div className="h-3 w-3 rounded-full bg-red-500 animate-ping" />
                        </div>
                      )}
                    </div>
                    {isListening && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <Mic className="h-3 w-3" /> Listening — speak now
                      </p>
                    )}
                  </div>

                  {/* Quick Actions: SMS, WhatsApp — show pre-filled text preview */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-11 min-w-[100px]"
                        style={{ touchAction: 'manipulation', flex: 1 }}
                        onClick={() => {
                          setSelectedSmsTemplate('')
                          setSelectedSmsText('')
                          setTemplateSheetOpen('sms')
                        }}
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        SMS
                        {templates.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{templates.length}</Badge>}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-11 min-w-[100px]"
                        style={{ touchAction: 'manipulation', flex: 1 }}
                        onClick={() => {
                          setSelectedWaTemplate('')
                          setSelectedWaText('')
                          setTemplateSheetOpen('whatsapp')
                        }}
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                        WhatsApp
                        {templates.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{templates.length}</Badge>}
                      </Button>
                    </div>
                    {/* Show selected template preview */}
                    {selectedSmsText && (
                      <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                        <Send className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">SMS: {selectedSmsText}</span>
                      </div>
                    )}
                    {selectedWaText && (
                      <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/30 text-xs text-green-700 dark:text-green-300 flex items-start gap-2">
                        <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">WhatsApp: {selectedWaText}</span>
                      </div>
                    )}
                  </div>

                  {/* Reschedule Call (native date input) */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Reschedule Call</Label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
                      style={{ touchAction: 'manipulation' }}
                    />
                    {scheduledDate && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        Scheduled for {scheduledDate}
                      </p>
                    )}
                  </div>

                </div>
              </div>

              {/* Sticky footer buttons — always visible at bottom */}
              <div
                className="shrink-0 border-t bg-background px-4 pt-3 pb-4 space-y-2"
                style={{ touchAction: 'manipulation' }}
              >
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12"
                  onClick={handleSaveAndNext}
                  disabled={savingRecord || !selectedDisposition}
                >
                  {savingRecord ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Save &amp; Next Call
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-12"
                  onClick={handleSaveOnly}
                  disabled={savingRecord || !selectedDisposition}
                >
                  {savingRecord ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Only'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TEMPLATE SELECTION SHEET (Mobile) ==================== */}
        {templateSheetOpen && isMobile && (
          <>
            <div
              className="fixed inset-0 bg-black/30"
              style={{ zIndex: 10004, touchAction: 'none' }}
              onClick={() => setTemplateSheetOpen(null)}
            />
            <div
              className="fixed left-0 right-0 bg-background border-t border-border rounded-t-2xl shadow-2xl"
              style={{ bottom: 0, zIndex: 10005, maxHeight: sheetHeight > 100 ? `${Math.round(sheetHeight * 0.65)}px` : '55vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >
              <div
                className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0"
                style={{ touchAction: 'manipulation' }}
              >
                <p className="text-sm font-semibold">
                  {templateSheetOpen === 'sms' ? 'Select SMS Template' : 'Select WhatsApp Template'}
                </p>
                <button
                  type="button"
                  onClick={() => setTemplateSheetOpen(null)}
                  className="h-10 w-10 rounded-full bg-muted flex items-center justify-center"
                  style={{ touchAction: 'manipulation' }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Scrollable template list — button is OUTSIDE this container (sticky footer) */}
              <div className="overflow-y-auto flex-1 px-4" style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', minHeight: 0 }}>
                <div className="space-y-2 pb-4">
                  {templates.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No templates available.</p>
                  ) : templates.map((tmpl) => {
                    const isSelected = templateSheetOpen === 'sms' ? selectedSmsTemplate === tmpl.id : selectedWaTemplate === tmpl.id
                    const handleSelect = () => {
                      if (templateSheetOpen === 'sms') setSelectedSmsTemplate(tmpl.id)
                      else setSelectedWaTemplate(tmpl.id)
                    }
                    return (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={handleSelect}
                        onTouchEnd={(e) => { e.preventDefault(); handleSelect() }}
                        className={cn(
                          'w-full text-left px-3 py-2.5 rounded-lg text-sm border flex items-start gap-2',
                          isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-border'
                        )}
                        style={{ touchAction: 'manipulation', minHeight: 44 }}
                      >
                        <div className="shrink-0 mt-0.5">
                          {isSelected ? (
                            <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
                              <Check className="h-3 w-3 text-white" strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('font-medium text-xs', isSelected && 'text-emerald-700')}>{tmpl.name}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{fillTemplate(tmpl.content)}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
              {/* Sticky footer — Send button always visible at bottom of template sheet */}
              <div
                className="shrink-0 border-t bg-background px-4 pt-3 pb-4"
                style={{ touchAction: 'manipulation' }}
              >
                <Button
                  size="sm"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 h-11"
                  onClick={() => templateSheetOpen === 'sms' ? handleSendSms() : handleSendWhatsApp()}
                  disabled={templateSheetOpen === 'sms' ? !selectedSmsTemplate : !selectedWaTemplate}
                  style={{ touchAction: 'manipulation' }}
                >
                  {templateSheetOpen === 'sms' ? (
                    <><Send className="h-3.5 w-3.5 mr-1.5" /> Send SMS</>
                  ) : (
                    <><MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Open WhatsApp</>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Desktop: centered Dialog — only render on non-mobile to avoid portal duplicate */}
        {!isMobile && (
          <Dialog open={isDispositionModalOpen} onOpenChange={(open) => {
            if (open || savingRecord) return
            setIsDispositionModalOpen(false)
            clearCallState()
            setCallInitiated(false)
            callInitiatedRef.current = false
            stopCallTimer()
          }}>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <PhoneIncoming className="h-4 w-4 text-emerald-600" />
                  Post-Call Disposition
                </DialogTitle>
                <DialogDescription>
                  Log the call outcome for {currentCandidate.name}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-2">
                {/* Candidate summary */}
                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{currentCandidate.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{currentCandidate.phone}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{formatDuration(callTimer)}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs pl-12">
                    <span className="flex items-center gap-1.5 text-muted-foreground truncate">
                      <Briefcase className="h-3 w-3 shrink-0 text-emerald-500" />
                      <span className="truncate">{currentCandidate.role || '—'}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground truncate">
                      <MapPin className="h-3 w-3 shrink-0 text-emerald-500" />
                      <span className="truncate">{currentCandidate.location || '—'}</span>
                    </span>
                  </div>
                </div>

                {/* Disposition selector */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Call Disposition <span className="text-red-500">*</span></Label>
                  <div className="grid grid-cols-2 gap-2">
                    {dispositions.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDisposition(d.id)}
                        className={cn(
                          'px-3 py-2.5 rounded-lg text-xs font-medium border text-left',
                          selectedDisposition === d.id
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500'
                            : 'border-border text-muted-foreground'
                        )}
                      >
                        {d.heading}
                      </button>
                    ))}
                  </div>
                  {dispositions.length === 0 && (
                    <p className="text-xs text-muted-foreground">No dispositions configured. Ask your admin.</p>
                  )}
                </div>

                {/* Client dropdown — always shown */}
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Client</Label>
                    <select
                      value={selectedClient}
                      onChange={(e) => { setSelectedClient(e.target.value); setCustomClientName('') }}
                      className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
                    >
                      <option value="">Select client...</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                      <option value="__other__">+ Other (enter manually)</option>
                    </select>
                    {selectedClient === '__other__' && (
                      <input
                        type="text"
                        placeholder="Enter client name..."
                        value={customClientName}
                        onChange={(e) => setCustomClientName(e.target.value)}
                        className="w-full h-11 px-3 mt-2 rounded-lg border border-border bg-background text-sm"
                      />
                    )}

                    {/* F2F Interview Date — always shown */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">F2F Interview Date</Label>
                      <input
                        type="date"
                        value={f2fInterviewDate}
                        onChange={(e) => setF2fInterviewDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
                      />
                    </div>
                  </div>

                {/* Notes with voice input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Notes</Label>
                    <Button
                      type="button"
                      variant={isListening ? 'destructive' : 'outline'}
                      size="sm"
                      className={cn('h-10 text-xs gap-1.5 min-w-[88px]', isListening && 'animate-pulse')}
                      onClick={toggleVoiceInput}
                    >
                      {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                      {isListening ? 'Stop' : 'Voice'}
                    </Button>
                  </div>
                  <div className="relative">
                    <Textarea
                      ref={notesRef}
                      placeholder={isListening ? 'Listening...' : 'Add call notes (optional)...'}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className={cn('resize-none pr-10', isListening && 'ring-2 ring-red-300 border-red-300')}
                    />
                    {isListening && (
                      <div className="absolute top-2.5 right-2.5">
                        <div className="h-3 w-3 rounded-full bg-red-500 animate-ping" />
                      </div>
                    )}
                  </div>
                  {isListening && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <Mic className="h-3 w-3" /> Listening — speak now
                    </p>
                  )}
                </div>

                {/* Quick Actions: SMS, WhatsApp — show pre-filled text preview */}
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10"
                      onClick={() => { setSelectedSmsTemplate(''); setSelectedSmsText(''); setTemplateSheetOpen('sms') }}
                    >
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      SMS
                      {templates.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{templates.length}</Badge>}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10"
                      onClick={() => { setSelectedWaTemplate(''); setSelectedWaText(''); setTemplateSheetOpen('whatsapp') }}
                    >
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                      WhatsApp
                      {templates.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{templates.length}</Badge>}
                    </Button>
                  </div>
                  {selectedSmsText && (
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                      <Send className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">SMS: {selectedSmsText}</span>
                    </div>
                  )}
                  {selectedWaText && (
                    <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/30 text-xs text-green-700 dark:text-green-300 flex items-start gap-2">
                      <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">WhatsApp: {selectedWaText}</span>
                    </div>
                  )}
                </div>

                {/* Reschedule Call (native date input) */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Reschedule Call</Label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
                  />
                  {scheduledDate && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      Scheduled for {scheduledDate}
                    </p>
                  )}
                </div>

                {/* Template selection bottom-sheet (desktop) */}
                {templateSheetOpen && (
                  <div>
                    <div className="fixed inset-0 bg-black/30" style={{ zIndex: 10004, touchAction: 'none' }}
                      onClick={() => setTemplateSheetOpen(null)} />
                    <div className="fixed left-0 right-0 bg-background border-t border-border rounded-t-2xl shadow-2xl"
                      style={{ bottom: 0, zIndex: 10005, maxHeight: sheetHeight > 100 ? `${Math.round(sheetHeight * 0.65)}px` : '55vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
                        <p className="text-sm font-semibold">
                          {templateSheetOpen === 'sms' ? 'Select SMS Template' : 'Select WhatsApp Template'}
                        </p>
                        <button type="button" onClick={() => setTemplateSheetOpen(null)}
                          className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {/* Scrollable template list — button is OUTSIDE this container (sticky footer) */}
                      <div className="overflow-y-auto flex-1 px-4" style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', minHeight: 0 }}>
                        <div className="space-y-2 pb-4">
                          {templates.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-4 text-center">No templates available.</p>
                          ) : templates.map((tmpl) => {
                            const isSelected = templateSheetOpen === 'sms' ? selectedSmsTemplate === tmpl.id : selectedWaTemplate === tmpl.id
                            const handleSelect = () => {
                              if (templateSheetOpen === 'sms') setSelectedSmsTemplate(tmpl.id)
                              else setSelectedWaTemplate(tmpl.id)
                            }
                            return (
                              <button key={tmpl.id} type="button" onClick={handleSelect} onTouchEnd={(e) => { e.preventDefault(); handleSelect() }}
                                className={cn('w-full text-left px-3 py-2.5 rounded-lg text-sm border flex items-start gap-2',
                                  isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-border hover:bg-muted/50')}
                                style={{ minHeight: 44 }}>
                                <div className="shrink-0 mt-0.5">
                                  {isSelected ? (
                                    <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                                    </div>
                                  ) : (
                                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={cn('font-medium text-xs', isSelected && 'text-emerald-700')}>{tmpl.name}</p>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">{fillTemplate(tmpl.content)}</p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      {/* Sticky footer — Send button always visible at bottom of template sheet */}
                      <div className="shrink-0 border-t bg-background px-4 pt-3 pb-4">
                        <Button
                          size="sm"
                          className="w-full bg-emerald-600 hover:bg-emerald-700 h-11"
                          onClick={() => templateSheetOpen === 'sms' ? handleSendSms() : handleSendWhatsApp()}
                          disabled={
                            templateSheetOpen === 'sms' ? !selectedSmsTemplate : !selectedWaTemplate
                          }
                        >
                          {templateSheetOpen === 'sms' ? (
                            <><Send className="h-3.5 w-3.5 mr-1.5" /> Send SMS</>
                          ) : (
                            <><MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Open WhatsApp</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action buttons: Save & Next Call / Save Only */}
                <Separator />
                <DialogFooter className="flex-col gap-2 sm:flex-col">
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12"
                    onClick={handleSaveAndNext}
                    disabled={savingRecord || !selectedDisposition}
                  >
                    {savingRecord ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Save &amp; Next Call
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full h-10"
                    onClick={handleSaveOnly}
                    disabled={savingRecord || !selectedDisposition}
                  >
                    {savingRecord ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Only'
                    )}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    )
  }

  return null
}
