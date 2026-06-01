'use client'

import { Card, CardContent } from '@/components/ui/card'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: string | number
  icon?: LucideIcon
  description?: string
  trend?: { value: number; label: string }
  className?: string
  iconColor?: string
}

export function StatsCard({ title, value, icon: Icon, description, trend, className, iconColor }: StatsCardProps) {
  return (
    <Card className={cn('', className)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col items-center text-center gap-2">
          {Icon && (
            <div className={cn(
              'flex items-center justify-center h-10 w-10 rounded-lg shrink-0',
              iconColor || 'bg-primary/10 text-primary'
            )}>
              <Icon className="h-5 w-5" />
            </div>
          )}
          <p className="text-2xl sm:text-3xl font-bold tracking-tight leading-none">{value}</p>
          <p className="text-xs sm:text-sm font-medium text-muted-foreground leading-tight">{title}</p>
          {(description || trend) && (
            <p className="text-[11px] sm:text-xs text-muted-foreground/70 leading-tight">
              {trend && (
                <span className={cn(
                  'font-medium',
                  trend.value >= 0 ? 'text-emerald-600' : 'text-red-600'
                )}>
                  {trend.value >= 0 ? '+' : ''}{trend.value}%{' '}
                </span>
              )}
              {description || trend?.label}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
