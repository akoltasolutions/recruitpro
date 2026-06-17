'use client'

import { LucideIcon } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  icon?: LucideIcon
  children?: React.ReactNode
}

export function PageHeader({ title, description, icon: Icon, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight truncate">{title}</h1>
          {description && (
            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{description}</p>
          )}
        </div>
      </div>
      {children && (
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          {children}
        </div>
      )}
    </div>
  )
}
