import type { ReactNode } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'
import type { HostStatus } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export const STATUS_LABEL: Record<HostStatus, string> = { online: '在线', error: '连接失败', offline: '离线' }

/** 主机状态徽标 */
export function StatusBadge({ status, label }: { status: HostStatus; label?: string }) {
  const tone = status === 'online' ? 'ok' : status === 'error' ? 'fail' : 'neutral'
  return (
    <Badge tone={tone} dot>
      {label ?? STATUS_LABEL[status]}
    </Badge>
  )
}

/** 状态点（侧栏用） */
export function StatusDot({ status, className }: { status: HostStatus; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-2 shrink-0 rounded-full',
        status === 'online' && 'bg-primary',
        status === 'error' && 'bg-destructive',
        status === 'offline' && 'bg-transparent ring-[1.5px] ring-muted-foreground/60 ring-inset',
        className,
      )}
    />
  )
}

/** 带标签与百分比的资源条 */
export function Meter({ label, value }: { label: string; value?: number }) {
  return (
    <div className="grid grid-cols-[2.25rem_1fr_2.5rem] items-center gap-2 text-xs text-muted-foreground">
      <span>{label}</span>
      <Progress value={value ?? 0} aria-label={label} />
      <span className="text-right font-mono tabular-nums text-foreground/80">{value === undefined ? '—' : `${value}%`}</span>
    </div>
  )
}

/** 空状态 */
export function EmptyState({ icon: Icon, children, className }: { icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-40 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground', className)}>
      <Icon className="size-5" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

/** 上下文工具栏：位于标签栏与内容之间，每个标签自带 */
export function Toolbar({ children, info }: { children?: ReactNode; info?: ReactNode }) {
  return (
    <div role="toolbar" aria-label="上下文操作" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
      {children}
      {info && <span className="ml-auto font-mono text-xs text-muted-foreground">{info}</span>}
    </div>
  )
}

export function ToolbarSep() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden="true" />
}
