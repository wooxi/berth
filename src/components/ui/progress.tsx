import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '@/lib/utils'

/** 资源进度条：value ≥ 88 显示危险色，≥ 72 显示警告色 */
function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const v = value ?? 0
  const tone = v >= 88 ? 'bg-destructive' : v >= 72 ? 'bg-warning' : 'bg-primary'
  return (
    <ProgressPrimitive.Root data-slot="progress" value={v} className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)} {...props}>
      <ProgressPrimitive.Indicator className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${v}%` }} />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
