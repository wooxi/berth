import { useCallback, useEffect, useState } from 'react'
import {
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sun,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, type AuditEvent, type HostSnapshot } from './api'
import { BerthMark } from './components/BerthMark'
import { CommandPalette, type PaletteTarget } from './components/CommandPalette'
import { StatusDot, Spinner } from './components/common'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Toaster } from './components/ui/sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import { useTheme } from './lib/theme'
import { cn } from './lib/utils'
import { OverviewView } from './views/Overview'
import { ConsoleView, type ConsoleTab } from './views/Console'
import { AccessView } from './views/Access'
import { LoginView } from './views/Login'
import { HostFormDialog, type HostFormTarget } from './components/HostFormDialog'

type View = 'overview' | 'console' | 'access'

const POLL_MS = 30000

const TAB_LABEL: Record<ConsoleTab, string> = {
  terminal: '终端',
  files: '文件',
  containers: '容器',
  logs: '日志',
}

export default function App() {
  const { theme, toggle } = useTheme()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [view, setView] = useState<View>('overview')
  const [consoleHostId, setConsoleHostId] = useState<string | null>(null)
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>('terminal')
  const [hosts, setHosts] = useState<HostSnapshot[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [hostForm, setHostForm] = useState<HostFormTarget | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const notify = useCallback((message: string) => { toast(message) }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [hostsResult, auditResult] = await Promise.all([
        api.getHosts(),
        api.getAudit(30).catch(() => null),
      ])
      setHosts(hostsResult.hosts)
      if (auditResult) setAudit(auditResult.events)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '采集失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    api.getSession()
      .then((session) => setAuthed(session.authenticated ?? Boolean(session.subjectId)))
      .catch(() => setAuthed(false))
  }, [])

  useEffect(() => {
    if (authed !== true) return
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [authed, refresh])

  const activeHost = hosts.find((host) => host.hostId === consoleHostId) ?? null

  useEffect(() => {
    if (authed !== true) return
    const base = activeHost && view === 'console' ? `${activeHost.label} · ${TAB_LABEL[consoleTab]}` : view === 'overview' ? '概览' : '凭据与权限'
    document.title = `${base} — Berth`
  }, [view, consoleTab, activeHost, authed])

  useEffect(() => {
    if (authed !== true) return
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [authed])

  const openHost = useCallback((hostId: string, tab?: ConsoleTab) => {
    setConsoleHostId(hostId)
    if (tab) setConsoleTab(tab)
    setView('console')
    setSidebarOpen(false)
  }, [])

  const navigate = useCallback((target: PaletteTarget) => {
    if ('view' in target) setView(target.view)
    else openHost(target.hostId, target.tab)
  }, [openHost])

  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    setAuthed(false)
    setHosts([])
  }, [])

  const onlineCount = hosts.filter((host) => host.status === 'online').length
  const issues = hosts.length - onlineCount

  if (authed === null) {
    return <div className="grid h-full place-items-center text-muted-foreground"><Spinner className="size-5" /></div>
  }
  if (authed === false) {
    return (
      <>
        <LoginView onLogin={() => setAuthed(true)} />
        <Toaster />
      </>
    )
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="relative flex h-full">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            aria-hidden="true"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* ============ 侧栏 ============ */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 flex w-[264px] shrink-0 flex-col border-r border-border bg-sidebar transition-transform duration-200 md:static md:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          aria-label="导航"
        >
          <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
            <button type="button" className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60" onClick={() => { setView('overview'); setSidebarOpen(false) }}>
              <BerthMark size={28} />
              <span className="text-[17px] font-semibold tracking-tight">Berth</span>
            </button>
          </div>

          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-keyshortcuts="Meta+K Control+K"
              className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 text-[13px] text-muted-foreground transition-colors hover:border-input hover:text-foreground"
            >
              <Search className="size-4" aria-hidden="true" />
              <span className="flex-1 text-left">搜索主机或命令</span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
            </button>
          </div>

          <nav className="grid gap-0.5 px-3 pb-3">
            <NavItem active={view === 'overview'} icon={LayoutDashboard} onClick={() => { setView('overview'); setSidebarOpen(false) }}>概览</NavItem>
            <NavItem active={view === 'access'} icon={KeyRound} onClick={() => { setView('access'); setSidebarOpen(false) }}>凭据与设置</NavItem>
          </nav>

          <div className="flex items-center justify-between px-5 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
            <span>服务器</span>
            <span className="font-mono tabular-nums">{onlineCount}/{hosts.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <div className="grid gap-0.5">
              {hosts.map((host) => {
                const active = view === 'console' && consoleHostId === host.hostId
                return (
                  <button
                    key={host.hostId}
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => openHost(host.hostId)}
                    title={`${host.label} · ${host.address}`}
                    className={cn(
                      'grid grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-md px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
                      active ? 'bg-primary/10' : 'hover:bg-muted',
                    )}
                  >
                    <StatusDot status={host.status} />
                    <span className="min-w-0">
                      <span className={cn('block truncate text-[13px] leading-tight', active ? 'font-semibold text-primary' : 'font-medium')}>{host.label}</span>
                      <span className="block truncate font-mono text-[11px] leading-tight text-muted-foreground">{host.address}</span>
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {host.status === 'online' ? `${host.cpuPercent ?? 0}%` : host.status === 'error' ? '失败' : '离线'}
                    </span>
                  </button>
                )
              })}
              {hosts.length === 0 && (
                <p className="px-2.5 py-2 text-xs text-muted-foreground">{loading ? '正在采集…' : '还没有登记主机'}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border p-3">
            <button
              type="button"
              onClick={() => void logout()}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden="true">OW</span>
              <span className="min-w-0 leading-tight">
                <b className="block text-[13px] font-medium">Owner</b>
                <small className="text-xs text-muted-foreground">退出登录</small>
              </span>
              <LogOut className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? '切换为浅色' : '切换为深色'}>
                  {theme === 'dark' ? <Sun /> : <Moon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{theme === 'dark' ? '浅色模式' : '深色模式'}</TooltipContent>
            </Tooltip>
          </div>
        </aside>

        {/* ============ 主区 ============ */}
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="打开导航"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu />
            </Button>
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <button type="button" className="hover:text-foreground" onClick={() => setView('overview')}>Berth</button>
              <span aria-hidden="true">/</span>
              {view === 'console' && activeHost ? (
                <>
                  <b className="font-semibold text-foreground">{activeHost.label}</b>
                  <span aria-hidden="true">/</span>
                  <b className="font-semibold text-foreground">{TAB_LABEL[consoleTab]}</b>
                </>
              ) : (
                <b className="font-semibold text-foreground">{view === 'overview' ? '概览' : '凭据与权限'}</b>
              )}
            </div>
            <span className="flex-1" />
            <Badge tone={issues > 0 ? 'warn' : 'ok'} dot>
              {issues > 0 ? `${onlineCount}/${hosts.length} 在线 · ${issues} 待查` : `${onlineCount}/${hosts.length} 全部在线`}
            </Badge>
            <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={loading ? 'spin' : ''} />刷新
            </Button>
            {view === 'console' && (
              <Button size="sm" onClick={() => setView('overview')} variant="ghost"><LayoutDashboard />概览</Button>
            )}
          </header>

          <div className="min-h-0 flex-1">
            {view === 'overview' && (
              <OverviewView
                hosts={hosts}
                audit={audit}
                error={error}
                loading={loading}
                onOpenConsole={openHost}
                onOpenAccess={() => setView('access')}
                onAddHost={() => setHostForm({ mode: 'create' })}
                onEditHost={(hostId) => setHostForm({ mode: 'edit', hostId })}
              />
            )}
            {view === 'console' && activeHost && (
              <ConsoleView key={activeHost.hostId} host={activeHost} tab={consoleTab} onTabChange={setConsoleTab} notify={notify} />
            )}
            {view === 'console' && !activeHost && (
              <div className="grid h-full place-items-center text-muted-foreground"><span className="flex items-center gap-2"><Plus className="size-4" />从左侧选择一台服务器</span></div>
            )}
            {view === 'access' && (
              <AccessView
                hosts={hosts}
                onAddHost={() => setHostForm({ mode: 'create' })}
                onEditHost={(hostId) => setHostForm({ mode: 'edit', hostId })}
                onLogout={() => void logout()}
              />
            )}
          </div>
          <span className="sr-only" aria-live="polite">{`${onlineCount} 台在线，${issues} 台待查`}</span>
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        hosts={hosts}
        onOpenChange={setPaletteOpen}
        onNavigate={navigate}
        onRefresh={() => void refresh()}
        onLogout={() => void logout()}
      />
      <HostFormDialog
        target={hostForm}
        onClose={() => setHostForm(null)}
        onSaved={(message) => {
          notify(message)
          void refresh()
        }}
      />
      <Toaster />
    </TooltipProvider>
  )
}

function NavItem({ active, icon: Icon, onClick, children }: { active: boolean; icon: typeof KeyRound; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </button>
  )
}

