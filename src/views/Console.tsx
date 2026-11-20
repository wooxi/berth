import { Box, Folder, ScrollText, Server, Terminal } from 'lucide-react'
import type { HostSnapshot } from '@/api'
import { Meter, StatusBadge } from '@/components/common'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TerminalTab } from './tabs/TerminalTab'
import { FilesTab } from './tabs/FilesTab'
import { ContainersTab } from './tabs/ContainersTab'
import { LogsTab } from './tabs/LogsTab'

export type ConsoleTab = 'terminal' | 'files' | 'containers' | 'logs'

const TABS: { id: ConsoleTab; label: string; icon: typeof Terminal }[] = [
  { id: 'terminal', label: '终端', icon: Terminal },
  { id: 'files', label: '文件', icon: Folder },
  { id: 'containers', label: '容器', icon: Box },
  { id: 'logs', label: '日志', icon: ScrollText },
]

export function ConsoleView({
  host,
  tab,
  onTabChange,
  notify,
}: {
  host: HostSnapshot
  tab: ConsoleTab
  onTabChange: (tab: ConsoleTab) => void
  notify: (message: string) => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 身份条：主机信息 + 实时指标 */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-b border-border px-5 py-3" aria-label={`${host.label} 身份信息`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Server className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0 leading-tight">
            <b className="block truncate text-[15px] font-semibold">{host.label}</b>
            <small className="block truncate font-mono text-xs text-muted-foreground">{host.address} · {host.role}</small>
          </div>
          <StatusBadge status={host.status} label={host.status === 'online' ? '已连接' : undefined} />
        </div>

        <dl className="hidden items-center gap-6 text-xs lg:flex">
          <Info label="OS" value={host.os ?? '—'} />
          <Info label="UPTIME" value={host.uptime || '—'} />
          <Info label="LOAD" value={host.load ? host.load.map((n) => n.toFixed(2)).join(' ') : '—'} />
        </dl>

        {host.status === 'online' && (
          <div className="ml-auto hidden w-[300px] gap-1.5 xl:grid">
            <Meter label="CPU" value={host.cpuPercent} />
            <Meter label="内存" value={host.memoryPercent} />
          </div>
        )}
      </header>

      <Tabs value={tab} onValueChange={(value) => onTabChange(value as ConsoleTab)} className="shrink-0 border-b border-border px-4 py-1.5">
        <TabsList aria-label="服务器工作区">
          {TABS.map((item) => {
            const disabled = item.id === 'containers' && host.runtime === 'none'
            return (
              <TabsTrigger key={item.id} value={item.id}>
                <item.icon aria-hidden="true" />
                {item.label}
                {disabled && <span aria-label="不可用" className="text-muted-foreground">—</span>}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      <div className="flex min-h-0 flex-1 flex-col" role="tabpanel" aria-label={TABS.find((item) => item.id === tab)?.label}>
        <div className={tab === 'terminal' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <TerminalTab host={host} notify={notify} visible={tab === 'terminal'} />
        </div>
        {tab === 'files' && <FilesTab host={host} notify={notify} />}
        {tab === 'containers' && <ContainersTab host={host} notify={notify} />}
        {tab === 'logs' && <LogsTab host={host} />}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <dt className="text-[10px] font-medium tracking-wider text-muted-foreground">{label}</dt>
      <dd className="max-w-48 truncate font-mono font-medium">{value}</dd>
    </div>
  )
}
