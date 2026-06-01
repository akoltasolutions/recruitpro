"use client"

import { usePortalBootstrap } from "@/hooks/usePortalOverlayFix"

/**
 * PortalOverlayProvider
 *
 * Client component that bootstraps the global portal overlay fix.
 * Must be placed in the root layout so the MutationObserver
 * is active for the entire application lifetime.
 *
 * This handles the case where inert attributes are set on
 * non-dialog portals by Radix Dialog/Sheet/AlertDialog modal behavior.
 */
export function PortalOverlayProvider({ children }: { children: React.ReactNode }) {
  usePortalBootstrap()
  return <>{children}</>
}
