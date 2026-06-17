"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { usePortalOverlayFix } from "@/hooks/usePortalOverlayFix"
import { DialogContainerProvider } from "@/hooks/useDialogContainer"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[10000] bg-black/50",
        className
      )}
      {...props}
    />
  )
}

/**
 * DialogContent — Two-Layer Architecture with Global Scroll Support
 *
 * OUTER LAYER (DialogPrimitive.Content):
 *   - fixed inset-0: covers the full viewport
 *   - flex centering: positions the inner dialog box
 *   - pointer-events-none: clicks pass through to the overlay behind
 *   - NO transform: avoids stacking context issues for portaled children
 *
 * INNER LAYER (visual dialog box):
 *   - pointer-events-auto: captures clicks inside the dialog
 *   - The actual visible dialog with border, shadow, background
 *   - flex flex-col: enables header/body/footer vertical layout
 *   - overflow-hidden: constrains content to max-h, enables body scroll
 *   - The ref and data-slot are on THIS element (the visible dialog)
 *   - Provided via DialogContainerContext to child Select/Dropdown portals
 *
 * GLOBAL SCROLL PATTERN:
 *   All dialogs automatically support the sticky header/footer scroll pattern:
 *   - DialogHeader: stays visible at the top (natural flex flow)
 *   - Body area: use className="flex-1 min-h-0 overflow-y-auto" to scroll
 *     (or use ScrollArea with className="flex-1 min-h-0")
 *   - DialogFooter: stays accessible at the bottom (natural flex flow)
 *
 * WHY NO TRANSFORM?
 * CSS spec: "If the containing block has a transform, the position: fixed
 * child is positioned relative to that containing block, not the viewport."
 * Radix Select/Dropdown use position:fixed for popper positioning.
 * If DialogContent had transform:translate(-50%,-50%), the dropdown would
 * be positioned relative to the dialog, causing offset errors.
 * By using flex centering instead of transform, position:fixed works correctly.
 *
 * DROPDOWN PORTAL STRATEGY:
 * Select/DropdownMenu components portal to document.body by default
 * (not inside the dialog container). This means overflow-hidden on the
 * dialog does NOT clip dropdowns. z-index hierarchy ensures layering:
 *   - Dialog overlay: z-[10000]
 *   - Dialog content: z-[10001]
 *   - Select/Dropdown content: z-[10002]
 * usePortalOverlayFix prevents Radix's useHideOthers from making them inert.
 */
const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }
>(({ className, children, showCloseButton = true, ...props }, ref) => {
  // Activates the global portal overlay fix while this dialog content is mounted.
  usePortalOverlayFix(true)

  // Track inner content element for DialogContainerContext.
  // Using useState (not ref) because the value is read during render
  // to pass to DialogContainerProvider. State updates trigger re-render
  // so children (Select/Dropdown) get the correct container element.
  const [innerEl, setInnerEl] = React.useState<HTMLDivElement | null>(null)

  // Merge refs: user's ref + our state setter
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      setInnerEl(node)
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    [ref]
  )

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-outer"
        className={cn(
          "fixed inset-0 z-[10001] flex items-center justify-center p-3 pointer-events-none"
        )}
        {...props}
      >
        {/* Inner visual dialog box — the actual dialog the user sees */}
        <div
          ref={setRefs}
          data-slot="dialog-content"
          className={cn(
            "bg-background pointer-events-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 w-full max-w-[calc(100%-1.5rem)] max-h-[90vh] flex flex-col overflow-hidden gap-4 rounded-lg border sm:p-6 p-4 shadow-lg duration-200 sm:max-w-lg",
            className
          )}
        >
          <DialogContainerProvider element={innerEl}>
            {children}
            {showCloseButton && (
              <DialogPrimitive.Close
                data-slot="dialog-close"
                className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            )}
          </DialogContainerProvider>
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = "DialogContent"

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
