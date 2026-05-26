'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        {/* Close button — 44px touch target, top-right */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute top-3 right-3 h-11 w-11 flex items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors z-50"
          style={{ touchAction: 'manipulation', pointerEvents: 'auto' }}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <AlertDialogHeader>
          <AlertDialogTitle className="pr-8 text-base sm:text-lg">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row pt-2">
          <AlertDialogCancel className="h-11 w-full sm:w-auto">{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
              'h-11 w-full sm:w-auto',
              variant === 'destructive'
                ? 'bg-destructive text-white hover:bg-destructive/90'
                : ''
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
