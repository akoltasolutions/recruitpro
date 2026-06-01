"use client"

import { useEffect, useRef, useCallback } from "react"

/**
 * usePortalOverlayFix
 *
 * Fixes Radix UI portal overlap issue across the entire application.
 *
 * ROOT CAUSE: When a Radix Dialog/Sheet/AlertDialog opens with modal={true} (default),
 * the internal useHideOthers mechanism adds `inert` attribute to ALL sibling portals
 * on document.body — including Select, DropdownMenu, Popover, and Tooltip portals.
 * This makes them completely non-interactive, regardless of CSS pointer-events.
 *
 * This hook uses a MutationObserver to detect and remove `inert` from non-dialog portals,
 * allowing dropdowns/selects inside modals to function correctly.
 *
 * Usage: Call once in root layout or Dialog component.
 * The observer uses a ref-count so it only runs while at least one dialog is open.
 */

let observerCount = 0
let observer: MutationObserver | null = null

function startObserver() {
  if (observer) return

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Only process attribute changes
      if (mutation.type !== "attributes" || mutation.attributeName !== "inert") continue

      const target = mutation.target as HTMLElement
      if (!target.hasAttribute("inert")) continue

      // Skip dialog/sheet/alert-dialog portals — they SHOULD remain interactive
      const isDialogPortal =
        target.querySelector('[data-slot="dialog-overlay"]') ||
        target.querySelector('[data-slot="dialog-content"]') ||
        target.querySelector('[data-slot="sheet-overlay"]') ||
        target.querySelector('[data-slot="sheet-content"]') ||
        target.querySelector('[data-slot="alert-dialog-overlay"]') ||
        target.querySelector('[data-slot="alert-dialog-content"]')

      if (isDialogPortal) continue

      // Also skip if it IS a dialog-content wrapper (not a portal itself)
      if (target.hasAttribute("data-slot")) continue

      // This is a non-dialog portal (Select, Dropdown, Popover, Tooltip) — remove inert
      target.removeAttribute("inert")
    }
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
 * One-time bootstrap: Remove inert from any existing non-dialog portals.
 * Call this in root layout on mount.
 */
export function usePortalBootstrap() {
  const bootstrapped = useRef(false)

  const bootstrap = useCallback(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    // Clean up any existing inert on non-dialog portals
    const portals = document.querySelectorAll('[data-radix-portal][inert]')
    portals.forEach((portal) => {
      const el = portal as HTMLElement
      const isDialogPortal =
        el.querySelector('[data-slot="dialog-overlay"]') ||
        el.querySelector('[data-slot="dialog-content"]') ||
        el.querySelector('[data-slot="sheet-overlay"]') ||
        el.querySelector('[data-slot="sheet-content"]') ||
        el.querySelector('[data-slot="alert-dialog-overlay"]') ||
        el.querySelector('[data-slot="alert-dialog-content"]')

      if (!isDialogPortal) {
        el.removeAttribute("inert")
      }
    })
  }, [])

  useEffect(() => {
    bootstrap()

    // Also run on DOM changes as a safety net
    const cleanupObserver = new MutationObserver(() => {
      const portals = document.querySelectorAll('[data-radix-portal][inert]')
      portals.forEach((portal) => {
        const el = portal as HTMLElement
        const isDialogPortal =
          el.querySelector('[data-slot="dialog-overlay"]') ||
          el.querySelector('[data-slot="dialog-content"]') ||
          el.querySelector('[data-slot="sheet-overlay"]') ||
          el.querySelector('[data-slot="sheet-content"]') ||
          el.querySelector('[data-slot="alert-dialog-overlay"]') ||
          el.querySelector('[data-slot="alert-dialog-content"]')

        if (!isDialogPortal) {
          el.removeAttribute("inert")
        }
      })
    })

    cleanupObserver.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["inert"],
    })

    return () => {
      cleanupObserver.disconnect()
    }
  }, [bootstrap])
}
