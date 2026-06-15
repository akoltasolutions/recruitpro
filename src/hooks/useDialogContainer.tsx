"use client"

import { createContext, useContext } from "react"

/**
 * DialogContainerContext
 *
 * Provides the nearest Dialog/Sheet/AlertDialog content element ref
 * to child portal components (Select, DropdownMenu, Popover, etc.).
 *
 * When a SelectContent or DropdownMenuContent renders inside a Dialog,
 * it uses this context to get the dialog's DOM element and passes it
 * as the `container` prop to Radix Portal. This renders the dropdown
 * INSIDE the dialog's DOM instead of at document.body level.
 *
 * Benefits:
 * - Dropdown stays visually contained within the dialog boundary
 * - Dropdown is always interactive (no inert issues from Dialog's useHideOthers)
 * - Proper z-index stacking within the dialog
 * - Works on both mobile and desktop consistently
 */

const DialogContainerContext = createContext<HTMLElement | null>(null)

export function DialogContainerProvider({
  children,
  element,
}: {
  children: React.ReactNode
  element: HTMLElement | null
}) {
  return (
    <DialogContainerContext.Provider value={element}>
      {children}
    </DialogContainerContext.Provider>
  )
}

/**
 * Returns the nearest Dialog/Sheet/AlertDialog content element,
 * or null if not inside any dialog-like container.
 */
export function useDialogContainer(): HTMLElement | null {
  return useContext(DialogContainerContext)
}
