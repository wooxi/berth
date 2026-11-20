import { Activity, Box, Cpu, Folder, HardDrive, MemoryStick, Pencil, Plus, Server, ScrollText, Terminal, type LucideIcon } from 'lucide-react'
import type { AuditEvent, HostSnapshot } from '@/api'
import { EmptyState, Meter, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

type Tab = 'terminal' | 'files' | 'containers' | 'logs'

type Props = {
  hosts: HostSnapshot[]
  audit: AuditEvent[]
  error: string
  loading: boolean
  onOpenConsole: (hostId: string, tab?: Tab) => void
  onOpenAccess: () => void
  onAddHost: () => void
  onEditHost: (hostId: string) => void
}

export function OverviewView({ hosts, audit, error, loading, onOpenConsole, onOpenAccess, onAddHost, onEditHost }: Props) {
  const online = hosts.filter((host) => host.status === 'online')
  const mean = (pick: (host: HostSnapshot) => number | undefined) =>
    online.length ? Math.round(online.reduce((sum, host) => sum + (pick(host) ?? 0), 0) / online.length) : 0

  const avgCpu = mean((host) => host.cpuPercent)
  const avgMem = mean((host) => host.memoryPercent)
  const avgDisk = mean((host) => host.diskPercent)
  const issues = hosts.length - online.length
  const hot = online.filter((host) => (host.diskPercent ?? 0) >= 88 || (host.memoryPercent ?? 0) >= 88 || (host.cpuPercent ?? 0) >= 88)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">概览</h1>
          <p className="mt-0.5 text-muted-foreground">{error || `${hosts.length} 台服务器 · ${online.length} 台在线${loading ? ' · 采集中…' : ''}`}</p>
        </div>
      </div>

      {/* KPI：通栏 4 列 */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi icon={Server} label="在线主机" value={online.length} suffix={`/ ${hosts.length}`} note={issues ? `${issues} 台待查` : '全部正常'} tone={issues ? 'warn' : undefined} />
        <Kpi icon={Cpu} label="平均 CPU" value={avgCpu} suffix="%" bar={avgCpu} note="在线主机均值" />
        <Kpi icon={MemoryStick} label="平均内存" value={avgMem} suffix="%" bar={avgMem} note="在线主机均值" />
        <Kpi icon={HardDrive} label="平均磁盘" value={avgDisk} suffix="%" bar={avgDisk} note="根分区" />
      </div>

      {/* 主体：主机网格 + 右侧动态栏，铺满全宽 */}
      <div className="mt-4 grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-labelledby="roster-title">
          <div className="mb-3 flex items-center gap-2">
            <h2 id="roster-title" className="text-sm font-semibold">服务器</h2>
            <span className="font-mono text-xs text-muted-foreground">{hosts.length}</span>
            <Button variant="secondary" size="sm" className="ml-auto" onClick={onAddHost}>
              <Plus />登记服务器
            </Button>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-4">
            {hosts.map((host) => (
              <HostCard key={host.hostId} host={host} onOpen={onOpenConsole} onEdit={onEditHost} />
            ))}
          </div>
          {hosts.length === 0 && (
            <Card><EmptyState icon={Server}>{loading ? '正在采集…' : error || '还没有登记主机'}</EmptyState></Card>
          )}
        </section>

        <aside className="grid gap-4">
          {(issues > 0 || hot.length > 0) && (
            <Card className="border-warning/30">
              <CardHeader><Activity className="size-4 text-warning" aria-hidden="true" /><CardTitle>需要关注</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-[13px]">
                {hosts.filter((host) => host.status !== 'online').map((host) => (
                  <button key={host.hostId} type="button" onClick={() => onOpenConsole(host.hostId)} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted">
                    <span className="font-medium">{host.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{host.error ?? (host.status === 'error' ? '连接失败' : '离线')}</span>
                  </button>
                ))}
                {hot.map((host) => (
                  <button key={host.hostId} type="button" onClick={() => onOpenConsole(host.hostId)} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted">
                    <span className="font-medium">{host.label}</span>
                    <span className="text-xs text-warning">资源使用率偏高</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>最近操作</CardTitle>
              <span className="font-mono text-xs text-muted-foreground">{audit.length}</span>
              <Button variant="ghost" size="xs" className="ml-auto" onClick={onOpenAccess}>权限</Button>
            </CardHeader>
            <CardContent className="pt-2">
              <ul className="divide-y divide-border">
                {audit.slice(0, 12).map((event, index) => (
                  <li key={`${event.at}-${index}`} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 py-2.5">
                    <span aria-hidden="true" className={cn('mt-1.5 size-2 rounded-full', event.outcome === 'allow' ? 'bg-primary' : 'bg-destructive')} />
                    <span className="min-w-0">
                      <b className="block truncate text-[13px] font-medium">{event.action}</b>
                      <small className="block truncate text-xs text-muted-foreground">{event.hostId ?? '会话'}{event.detail ? ` · ${event.detail}` : ''}</small>
                    </span>
                    <time className="font-mono text-xs text-muted-foreground">{new Date(event.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
                  </li>
                ))}
              </ul>
              {audit.length === 0 && <EmptyState icon={Activity} className="min-h-28">还没有操作记录</EmptyState>}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, suffix, note, bar, tone }: { icon: LucideIcon; label: string; value: number; suffix?: string; note: string; bar?: number; tone?: 'warn' }) {
  return (
    <Card>
      <CardContent className="grid gap-1.5 p-5">
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Icon className="size-4" aria-hidden="true" />{label}</div>
        <div className={cn('flex items-baseline gap-1 text-4xl font-semibold tracking-tight tabular-nums', tone === 'warn' && 'text-warning')}>
          {value}
          {suffix && <span className="text-base font-medium text-muted-foreground">{suffix}</span>}
        </div>
        {bar !== undefined ? <Progress value={bar} aria-label={label} className="mt-1" /> : <div className="mt-1 h-1.5" />}
        <div className="text-xs text-muted-foreground">{note}</div>
      </CardContent>
    </Card>
  )
}

const ACTIONS: { tab: Tab; label: string; icon: typeof Terminal }[] = [
  { tab: 'terminal', label: '终端', icon: Terminal },
  { tab: 'files', label: '文件', icon: Folder },
  { tab: 'containers', label: '容器', icon: Box },
  { tab: 'logs', label: '日志', icon: ScrollText },
]

function HostCard({ host, onOpen, onEdit }: { host: HostSnapshot; onOpen: (hostId: string, tab?: Tab) => void; onEdit: (hostId: string) => void }) {
  const live = host.status === 'online'
  return (
    <Card className="flex flex-col transition-colors hover:border-input">
      <CardContent className="grid flex-1 gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Server className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <b className="block truncate text-[15px] font-semibold">{host.label}</b>
            <span className="block truncate font-mono text-xs text-muted-foreground">{host.address}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={`编辑 ${host.label} 的登记信息`}
            onClick={() => onEdit(host.hostId)}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </Button>
          <StatusBadge status={host.status} />
        </div>

        {live ? (
          <>
            <div className="grid gap-2.5">
              <Meter label="CPU" value={host.cpuPercent} />
              <Meter label="内存" value={host.memoryPercent} />
              <Meter label="磁盘" value={host.diskPercent} />
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <Fact label="负载" value={host.load ? host.load[0].toFixed(2) : '—'} />
              <Fact label="核心" value={host.cores ? String(host.cores) : '—'} />
              <Fact label="运行" value={host.uptime || '—'} />
            </dl>
          </>
        ) : (
          <p className="min-h-24 rounded-md bg-muted/60 p-3 text-[13px] text-muted-foreground">{host.error ?? (host.status === 'error' ? '连接失败，请检查网络或主机指纹' : '主机离线')}</p>
        )}

        <div className="flex gap-1.5 border-t border-border pt-3">
          {ACTIONS.map((action) => (
            <Button
              key={action.tab}
              variant={action.tab === 'terminal' ? 'default' : 'secondary'}
              size="xs"
              className="flex-1"
              disabled={action.tab === 'containers' && host.runtime === 'none'}
              onClick={() => onOpen(host.hostId, action.tab)}
            >
              <action.icon className="size-3.5" />{action.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/60 px-2.5 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono font-medium text-foreground">{value}</dd>
    </div>
  )
}
