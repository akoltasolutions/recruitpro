'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Download, Smartphone, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferredPromptRef = { current: null as BeforeInstallPromptEvent | null }

function getIsInstalled(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if ((window.navigator as unknown as { standalone?: boolean }).standalone === true) return true
  return false
}

function getIsIos(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  return /ipad|iphone|ipod/.test(ua.toLowerCase()) && !('MSStream' in window)
}

export function PwaInstallPrompt() {
  const [canInstall, setCanInstall] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const hasShownRef = useRef(false)

  const isInstalled = getIsInstalled()
  const isIos = getIsIos()

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    setShowDialog(false)
  }, [])

  const install = useCallback(async () => {
    const dp = deferredPromptRef.current
    if (!dp) return
    await dp.prompt()
    const { outcome } = await dp.userChoice
    if (outcome === 'accepted') {
      setCanInstall(false)
    }
    deferredPromptRef.current = null
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isInstalled) return
    if (dismissed) return

    const handler = (e: Event) => {
      e.preventDefault()
      deferredPromptRef.current = e as BeforeInstallPromptEvent
      setCanInstall(true)

      // Show dialog after a brief delay
      if (!hasShownRef.current) {
        hasShownRef.current = true
        const timer = setTimeout(() => setShowDialog(true), 15000)
        return () => clearTimeout(timer)
      }
    }

    window.addEventListener('beforeinstallprompt', handler)

    // For iOS users, show the instruction dialog
    if (isIos && !hasShownRef.current) {
      hasShownRef.current = true
      const timer = setTimeout(() => setShowDialog(true), 15000)
      return () => {
        clearTimeout(timer)
        window.removeEventListener('beforeinstallprompt', handler)
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [isInstalled, isIos, dismissed])

  if (isInstalled) return null
  if (!canInstall && !isIos) return null
  if (dismissed || !showDialog) return null

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={handleDismiss}>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950">
              <Smartphone className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <DialogTitle>Install RecruitPro App</DialogTitle>
              <DialogDescription className="text-sm mt-0.5">
                Get the full app experience on your device
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isIos ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              To install RecruitPro on your iPhone or iPad:
            </p>
            <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
              <li>
                Tap the <strong>Share</strong> button{' '}
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
                  </svg>
                </span>{' '}
                in Safari
              </li>
              <li>
                Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong>
              </li>
              <li>Tap <strong>&quot;Add&quot;</strong> to install</li>
            </ol>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Install the RecruitPro app for quick access, offline support, and a native-like experience.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={install}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Install App
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDismiss}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
