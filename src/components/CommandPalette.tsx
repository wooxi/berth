import { useMemo, useState } from 'react'
import { Box, Folder, KeyRound, LogOut, RefreshCw, ScrollText, Server, Terminal, LayoutDashboard } from 'lucide-react'
import type { HostSnapshot } from '@/api'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

export type PaletteTarget =
  | { hostId: string; tab: 'terminal' | 'files' | 'containers' | 'logs' }
  | { view: 'overview' | 'access' }

const TABS = [
  { id: 'terminal', label: '终端', icon: Terminal },
  { id: 'files', label: '文件', icon: Folder },
  { id: 'containers', label: '容器', icon: Box },
  { id: 'logs', label: '日志', icon: ScrollText },
] as const

/** 命令面板：基于 shadcn Command（cmdk），支持主机跳转、页面导航与操作 */
export function CommandPalette({
  open,
  hosts,
  onOpenChange,
  onNavigate,
  onRefresh,
  onLogout,
}: {
  open: boolean
  hosts: HostSnapshot[]
  onOpenChange: (open: boolean) => void
  onNavigate: (target: PaletteTarget) => void
  onRefresh: () => void
  onLogout: () => void
}) {
  const [query, setQuery] = useState('')
  const run = (fn: () => void) => () => {
    fn()
    onOpenChange(false)
    setQuery('')
  }

  const hostItems = useMemo(
    () =>
      hosts.flatMap((host) =>
        TABS.map((tab) => ({
          key: `${host.hostId}-${tab.id}`,
          value: `${host.label} ${tab.label} ${host.address}`,
          label: tab.id === 'terminal' ? host.label : `${host.label} · ${tab.label}`,
          hint: tab.id === 'terminal' ? `${host.address} · 打开工作台` : host.address,
          icon: tab.id === 'terminal' ? Server : tab.icon,
          go: () => onNavigate({ hostId: host.hostId, tab: tab.id }),
        })),
      ),
    [hosts, onNavigate],
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="搜索主机、跳转或执行命令…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>没有匹配项</CommandEmpty>
        <CommandGroup heading="主机">
          {hostItems.map((item) => (
            <CommandItem key={item.key} value={item.value} onSelect={run(item.go)}>
              <item.icon />
              <span className="flex-1">{item.label}</span>
              <span className="font-mono text-xs text-muted-foreground">{item.hint}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="导航">
          <CommandItem value="概览" onSelect={run(() => onNavigate({ view: 'overview' }))}>
            <LayoutDashboard />概览
          </CommandItem>
          <CommandItem value="凭据与权限" onSelect={run(() => onNavigate({ view: 'access' }))}>
            <KeyRound />凭据与权限
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="操作">
          <CommandItem value="刷新主机数据" onSelect={run(onRefresh)}>
            <RefreshCw />刷新主机数据
          </CommandItem>
          <CommandItem value="退出登录" onSelect={run(onLogout)}>
            <LogOut />退出登录
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
