import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Search,
  Server,
  ShieldCheck,
  Terminal,
} from 'lucide-react'
import { api, type AuditEvent, type HostSnapshot } from './api'
import { BerthMark } from './components/BerthMark'
import { CommandPalette, type PaletteTarget } from './components/CommandPalette'
import { OverviewView } from './views/Overview'
import { ConsoleView, type ConsoleTab } from './views/Console'
import { AccessView } from './views/Access'
import { LoginView } from './views/Login'

type View = 'overview' | 'console' | 'access'

const POLL_MS = 30000

const TAB_LABEL: Record<ConsoleTab, string> = {
  terminal: '终端',
  files: '文件',
  containers: '容器',
  logs: '日志',
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [view, setView] = useState<View>('overview')
  const [consoleHostId, setConsoleHostId] = useState<string | null>(null)
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>('terminal')
  const [hosts, setHosts] = useState<HostSnapshot[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.getHosts()
      setHosts(result.hosts)
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
    api.getAudit(30).then((result) => setAudit(result.events)).catch(() => {})
    const timer = window.setInterval(() => { void refresh() }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [authed, refresh])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

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
  }, [])

  const navigate = useCallback((target: PaletteTarget) => {
    if ('view' in target) {
      if (target.view === 'hosts') setView('overview')
      else setView(target.view === 'overview' ? 'overview' : 'access')
    } else {
      setConsoleHostId(target.hostId)
      setConsoleTab(target.tab)
      setView('console')
    }
  }, [])

  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    setAuthed(false)
    setHosts([])
  }, [])

  const onlineCount = hosts.filter((host) => host.status === 'online').length
  const issues = hosts.length - onlineCount

  if (authed === null) {
    return <div className="login-shell"><p className="page-sub">加载中…</p></div>
  }
  if (authed === false) {
    return <LoginView onLogin={() => setAuthed(true)} />
  }

  return (
    <div className="app-shell">
      <header className="topbar-brand">
        <button className="brand-lockup" type="button" onClick={() => setView('overview')}>
          <BerthMark size={26} title="Berth" />
          <span className="brand-name">Berth</span>
        </button>
        <span className="brand-tag">私有服务器</span>

        <span className="topbar-spacer" />

        <span className="topbar-stat">
          <span className="figure">{onlineCount}</span>/{hosts.length} 在线
        </span>
        {issues > 0 && (
          <span className="topbar-stat" style={{ color: 'var(--warn)' }}>
            <span className="figure">{issues}</span> 待查
          </span>
        )}

        <button className="command-trigger" type="button" onClick={() => setPaletteOpen(true)} aria-keyshortcuts="Meta+K Control+K">
          <Search size={14} aria-hidden="true" />
          <span>搜索主机</span>
          <kbd>⌘K</kbd>
        </button>

        <button className="icon-button notification-button" type="button" aria-label={`${issues} 台主机待查`} onClick={() => setView('overview')}>
          <Activity size={16} aria-hidden="true" />
          {issues > 0 && <i />}
        </button>
      </header>

      <aside className="rail" aria-label="导航">
        <button className="rail-search" type="button" onClick={() => setPaletteOpen(true)}>
          <Search size={14} aria-hidden="true" />
          <span>搜索</span>
          <kbd>⌘K</kbd>
        </button>

        <div className="rail-group">
          <p className="rail-group-title">
            <span>服务器</span>
            <span>{hosts.length}</span>
          </p>
          {hosts.map((host) => (
            <button
              key={host.hostId}
              type="button"
              className="host-item"
              aria-current={view === 'console' && consoleHostId === host.hostId ? 'true' : undefined}
              onClick={() => openHost(host.hostId)}
              title={`${host.label} · ${host.address}`}
            >
              <span className="host-dot" data-state={host.status} aria-hidden="true" />
              <span className="host-name">{host.label}</span>
              <span className="host-meta">
                {host.status === 'online'
                  ? `${host.cpuPercent ?? 0}%`
                  : host.status === 'error' ? '失败' : '离线'}
              </span>
            </button>
          ))}
          {hosts.length === 0 && (
            <p className="rail-group-title" style={{ margin: '2px 8px' }}>
              <span>{loading ? '正在采集…' : '还没有登记主机'}</span>
            </p>
          )}
        </div>

        <div className="rail-group">
          <button
            type="button"
            className="nav-item"
            aria-current={view === 'overview' ? 'page' : undefined}
            onClick={() => setView('overview')}
          >
            <LayoutDashboard size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>概览</span>
          </button>
          <button
            type="button"
            className="nav-item"
            aria-current={view === 'access' ? 'page' : undefined}
            onClick={() => setView('access')}
          >
            <ShieldCheck size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>凭据与权限</span>
          </button>
        </div>

        <div className="rail-foot">
          <button className="owner-button" type="button" onClick={() => void logout()}>
            <span className="owner-avatar" aria-hidden="true">OW</span>
            <span className="owner-copy">
              <b>Owner</b>
              <small>退出登录</small>
            </span>
            <LogOut size={14} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <main className="canvas-card">
        <div className="crumbbar">
          <div className="crumbs">
            <button type="button" onClick={() => setView('overview')}>Berth</button>
            <ChevronRight size={12} aria-hidden="true" />
            {view === 'console' && activeHost ? (
              <>
                <b>{activeHost.label}</b>
                <ChevronRight size={12} aria-hidden="true" />
                <b>{TAB_LABEL[consoleTab]}</b>
              </>
            ) : (
              <b>{view === 'overview' ? '概览' : '凭据与权限'}</b>
            )}
          </div>
          <div className="crumbbar-actions">
            {view === 'console' && (
              <button className="button button-quiet compact-button" type="button" onClick={() => setView('overview')}>
                <LayoutDashboard size={14} aria-hidden="true" />
                概览
              </button>
            )}
            <span className="live-pill"><span aria-hidden="true" />实时</span>
          </div>
        </div>

        <div className="page">
          {view === 'overview' && (
            <OverviewView
              hosts={hosts}
              audit={audit}
              error={error}
              loading={loading}
              onOpenConsole={openHost}
              onOpenAccess={() => setView('access')}
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
              <Server size={20} aria-hidden="true" />
              <span>从左侧选择一台服务器</span>
            </div>
          )}

          {view === 'access' && (
            <AccessView hosts={hosts} onAction={setToast} onLogout={() => void logout()} />
          )}
        </div>

        <span className="sr-only" aria-live="polite">{`${onlineCount} 台在线，${issues} 台待查`}</span>
      </main>

      <CommandPalette
        open={paletteOpen}
        hosts={hosts}
        onClose={() => setPaletteOpen(false)}
        onNavigate={navigate}
        onRefresh={() => void refresh()}
        onLogout={() => void logout()}
      />

      {toast && <div className="toast" role="status"><Terminal size={13} aria-hidden="true" />{toast}</div>}
    </div>
  )
}
