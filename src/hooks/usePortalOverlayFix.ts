"use client"

import { useEffect, useRef, useCallback } from "react"

/**
 * usePortalOverlayFix
 *
 * Fixes Radix UI portal overlay issue across the entire application.
 *
 * ROOT CAUSE: When Radix Dialog/Sheet/AlertDialog opens (modal=true),
 * the internal useHideOthers mechanism adds `inert` attribute to ALL
 * sibling portals on document.body — including Select, DropdownMenu,
 * Popover, and Tooltip portals. This makes them completely non-interactive.
 *
 * SOLUTION: MutationObserver watches for `inert` additions and immediately
 * removes them from non-dialog portals. Also does an initial sweep to catch
 * the race condition where inert is set before this hook mounts.
 */

let observerCount = 0
let observer: MutationObserver | null = null

function isDialogPortal(el: Element): boolean {
  return !!(
    el.querySelector('[data-slot="dialog-overlay"]') ||
    el.querySelector('[data-slot="dialog-content"]') ||
    el.querySelector('[data-slot="sheet-overlay"]') ||
    el.querySelector('[data-slot="sheet-content"]') ||
    el.querySelector('[data-slot="alert-dialog-overlay"]') ||
    el.querySelector('[data-slot="alert-dialog-content"]') ||
    el.querySelector('[data-slot="alert-dialog-title"]')
  )
}

/**
 * Sweep all portals on document.body right now and remove `inert`
 * from non-dialog portals. This is called both on observer start
 * and on every mutation to be thorough.
 */
function sweepInertFromPortals() {
  if (typeof document === "undefined") return
  const allElements = document.body.querySelectorAll("[inert]")
  allElements.forEach((el) => {
    // Skip elements that are part of a dialog/sheet/alert-dialog portal
    if (isDialogPortal(el)) return
    // Skip the dialog content/overlay themselves
    if (el.hasAttribute("data-slot")) return
    // Remove inert from everything else (Select/Dropdown/Popover portals)
    ;(el as HTMLElement).removeAttribute("inert")
  })
}

function startObserver() {
  if (observer) return

  // CRITICAL: Immediate sweep to catch race condition where inert
  // was set before this observer started (DialogContent mounts after
  // Radix has already hidden other portals)
  sweepInertFromPortals()

  observer = new MutationObserver(() => {
    // On every mutation, sweep all inert elements
    sweepInertFromPortals()
  })

  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["inert"],
  })
}

function stopObserver() {
  if (observer && observerCount <= 0) {
    observer.disconnect()
    observer = null
  }
}

/**
 * Use inside DialogContent / SheetContent / AlertDialogContent
 * to keep non-dialog portals interactive while the dialog is open.
 */
export function usePortalOverlayFix(isOpen: boolean) {
  const wasOpen = useRef(false)

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      wasOpen.current = true
      observerCount++
      startObserver()
    } else if (!isOpen && wasOpen.current) {
      wasOpen.current = false
      observerCount = Math.max(0, observerCount - 1)
      stopObserver()
    }

    return () => {
      if (wasOpen.current) {
        wasOpen.current = false
        observerCount = Math.max(0, observerCount - 1)
        stopObserver()
      }
    }
  }, [isOpen])
}

/**
 * Always-on observer that runs for the entire app lifetime.
 * Place in root layout via PortalOverlayProvider.
 * Catches any inert that slips through the dialog-level observer.
 */
export function usePortalBootstrap() {
  useEffect(() => {
    // Initial sweep
    sweepInertFromPortals()

    // Persistent observer — always active
    const persistentObserver = new MutationObserver(() => {
      sweepInertFromPortals()
    })

    persistentObserver.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["inert"],
    })

    return () => {
      persistentObserver.disconnect()
    }
  }, [])
}
