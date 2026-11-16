import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Box,
  ChevronRight,
  Folder,
  LayoutDashboard,
  LogOut,
  Network,
  ScrollText,
  Server,
  ShieldCheck,
  Terminal,
  type LucideIcon,
} from 'lucide-react'
import { api, type AuditEvent, type HostSnapshot } from './api'
import { CommandPalette, type PaletteTarget } from './components/CommandPalette'
import { OverviewView } from './views/Overview'
import { HostsView } from './views/Hosts'
import { ConsoleView, type ConsoleTab } from './views/Console'
import { AccessView } from './views/Access'
import { LoginView } from './views/Login'

type View = 'overview' | 'hosts' | 'console' | 'access'

type NavEntry = { id: string; label: string; icon: LucideIcon; run: () => void; badge?: number }

const HISTORY_LIMIT = 24
const POLL_MS = 30000

function App() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [view, setView] = useState<View>('overview')
  const [consoleHostId, setConsoleHostId] = useState<string | null>(null)
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>('terminal')
  const [hosts, setHosts] = useState<HostSnapshot[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())

  const histories = useRef<Map<string, number[]>>(new Map())
  const [historyVersion, setHistoryVersion] = useState(0)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.getHosts()
      setHosts(result.hosts)
      setError('')
      for (const host of result.hosts) {
        if (host.cpuPercent === undefined) continue
        const series = histories.current.get(host.hostId) ?? []
        series.push(host.cpuPercent)
        if (series.length > HISTORY_LIMIT) series.shift()
        histories.current.set(host.hostId, series)
      }
      setHistoryVersion((current) => current + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '采集失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    api.getSession().then(() => setAuthed(true)).catch(() => setAuthed(false))
  }, [])

  useEffect(() => {
    if (authed !== true) return
    void refresh()
    api.getAudit(30).then((result) => setAudit(result.events)).catch(() => {})
    const timer = window.setInterval(() => { void refresh() }, POLL_MS)
    const clock = window.setInterval(() => setNow(new Date()), 60000)
    return () => {
      window.clearInterval(timer)
      window.clearInterval(clock)
    }
  }, [authed, refresh])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (authed !== true) return
    const title = view === 'console'
      ? `${hosts.find((host) => host.hostId === consoleHostId)?.label ?? '主机'} · Yard`
      : view === 'overview' ? '概览 · Yard' : view === 'hosts' ? '主机 · Yard' : '凭据与权限 · Yard'
    document.title = title
  }, [view, consoleHostId, hosts, authed])

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

  const openConsole = useCallback((hostId: string, tab: ConsoleTab) => {
    setConsoleHostId(hostId)
    setConsoleTab(tab)
    setView('console')
  }, [])

  const navigate = useCallback((target: PaletteTarget) => {
    if ('view' in target) setView(target.view)
    else openConsole(target.hostId, target.tab)
  }, [openConsole])

  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    setAuthed(false)
    setHosts([])
    histories.current.clear()
  }, [])

  const onlineCount = hosts.filter((host) => host.status === 'online').length
  const issues = hosts.length - onlineCount
  const activeHost = hosts.find((host) => host.hostId === consoleHostId) ?? hosts[0] ?? null

  const openTab = useCallback((tab: ConsoleTab) => {
    if (!activeHost) {
      setToast('尚未登记任何主机')
      return
    }
    openConsole(activeHost.hostId, tab)
  }, [activeHost, openConsole])

  const navGroups = useMemo<{ label: string; items: NavEntry[] }[]>(() => [
    {
      label: 'WORKSPACE',
      items: [
        { id: 'overview', label: '概览', icon: LayoutDashboard, run: () => setView('overview') },
        { id: 'hosts', label: '主机', icon: Server, run: () => setView('hosts'), badge: issues || undefined },
      ],
    },
    {
      label: 'OPERATE',
      items: [
        { id: 'terminal', label: '终端', icon: Terminal, run: () => openTab('terminal') },
        { id: 'files', label: '文件', icon: Folder, run: () => openTab('files') },
        { id: 'containers', label: '容器', icon: Box, run: () => openTab('containers') },
        { id: 'logs', label: '日志', icon: ScrollText, run: () => openTab('logs') },
      ],
    },
  ], [issues, openTab])

  const activeNavId = view === 'console' ? consoleTab : view

  if (authed === null) {
    return (
      <div className="login-shell">
        <p className="page-detail">加载中…</p>
      </div>
    )
  }

  if (authed === false) {
    return <LoginView onLogin={() => setAuthed(true)} />
  }

  const visibleHosts = query.trim()
    ? hosts.filter((host) => `${host.label} ${host.address} ${host.group} ${host.role}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    : hosts

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="应用侧栏">
        <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); setView('overview') }}>
          <span className="brand-mark" aria-hidden="true"><Network size={16} strokeWidth={2.2} /></span>
          <span className="brand-copy"><strong>YARD</strong><small>SERVER CONTROL</small></span>
        </a>

        <button className="workspace-switcher" type="button" onClick={() => setView('hosts')}>
          <span className="workspace-avatar">H</span>
          <span className="workspace-copy">
            <strong>Home lab</strong>
            <small>{onlineCount}/{hosts.length} online</small>
          </span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>

        <nav className="primary-nav" aria-label="主导航">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-label">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = activeNavId === item.id && (view === 'overview' || view === 'hosts' || view === 'console')
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`nav-item ${isActive ? 'is-active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={item.run}
                  >
                    <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.badge ? <span className="nav-count">{item.badge}</span> : null}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-health">
            <span className="status-pip" />
            <span>Control plane</span>
            <strong>{loading ? '同步中' : issues ? `${onlineCount}/${hosts.length}` : '正常'}</strong>
          </div>
          <button
            type="button"
            className={`nav-item ${view === 'access' ? 'is-active' : ''}`}
            aria-current={view === 'access' ? 'page' : undefined}
            onClick={() => setView('access')}
          >
            <ShieldCheck size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>凭据与权限</span>
          </button>
          <button className="profile-button" type="button" onClick={() => void logout()}>
            <span className="profile-avatar">OW</span>
            <span className="profile-copy"><strong>Owner</strong><small>退出登录</small></span>
            <LogOut size={15} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            <button type="button" onClick={() => setView('overview')}>Home lab</button>
            <ChevronRight size={13} aria-hidden="true" />
            {view === 'console' && activeHost ? (
              <>
                <button type="button" onClick={() => setView('hosts')}>主机</button>
                <ChevronRight size={13} aria-hidden="true" />
                <strong>{activeHost.label}</strong>
                <ChevronRight size={13} aria-hidden="true" />
                <strong>{consoleTab === 'terminal' ? '终端' : consoleTab === 'files' ? '文件' : consoleTab === 'containers' ? '容器' : '日志'}</strong>
              </>
            ) : (
              <strong>{view === 'overview' ? '概览' : view === 'hosts' ? '主机' : '凭据与权限'}</strong>
            )}
          </div>

          <div className="topbar-actions">
            <button className="command-trigger" type="button" onClick={() => setPaletteOpen(true)} aria-keyshortcuts="Meta+K Control+K">
              <Terminal size={14} aria-hidden="true" />
              <span>搜索主机或命令…</span>
              <kbd>⌘K</kbd>
            </button>
            <span className="live-pill"><span aria-hidden="true" />LIVE</span>
            <button
              className="icon-button notification-button"
              type="button"
              aria-label={`异常主机 ${issues} 台`}
              onClick={() => setView('hosts')}
            >
              <Activity size={16} aria-hidden="true" />
              {issues > 0 && <i />}
            </button>
          </div>
        </header>

        <div className="page-content">
          {view === 'overview' && (
            <OverviewView
              hosts={hosts}
              histories={histories.current}
              audit={audit}
              error={error}
              loading={loading}
              onOpenConsole={openConsole}
              onOpenHosts={() => setView('hosts')}
              onOpenAccess={() => setView('access')}
            />
          )}

          {view === 'hosts' && (
            <HostsView
              hosts={visibleHosts}
              query={query}
              onQuery={setQuery}
              onOpenConsole={openConsole}
            />
          )}

          {view === 'console' && activeHost && (
            <ConsoleView
              key={activeHost.hostId}
              host={activeHost}
              tab={consoleTab}
              onTabChange={setConsoleTab}
              notify={setToast}
            />
          )}

          {view === 'console' && !activeHost && (
            <div className="term-empty">
              <Server size={22} aria-hidden="true" />
              <span>没有可用的主机</span>
            </div>
          )}

          {view === 'access' && (
            <AccessView hosts={hosts} onAction={setToast} onLogout={() => void logout()} />
          )}
        </div>

        <span className="sr-only" aria-live="polite">
          {`${onlineCount} 台主机在线，${issues} 台异常`}
        </span>
        <span className="sr-only" data-history={historyVersion} />
      </main>

      <CommandPalette
        open={paletteOpen}
        hosts={hosts}
        onClose={() => setPaletteOpen(false)}
        onNavigate={navigate}
        onRefresh={() => void refresh()}
        onLogout={() => void logout()}
      />

      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
        </div>
      )}
      <span className="sr-only">{now.getMinutes()}</span>
    </div>
  )
}

export default App
