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
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1 min-w-0">
            <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{title}</p>
            <p className="text-xl sm:text-3xl font-bold tracking-tight">{value}</p>
            {(description || trend) && (
              <div className="flex items-center gap-1">
                {trend && (
                  <span className={cn(
                    'text-xs font-medium',
                    trend.value >= 0 ? 'text-emerald-600' : 'text-red-600'
                  )}>
                    {trend.value >= 0 ? '+' : ''}{trend.value}%
                  </span>
                )}
                <p className="text-xs text-muted-foreground truncate">{description || trend?.label}</p>
              </div>
            )}
          </div>
          {Icon && (
            <div className={cn(
              'flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 rounded-lg shrink-0',
              iconColor || 'bg-primary/10 text-primary'
            )}>
              <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
