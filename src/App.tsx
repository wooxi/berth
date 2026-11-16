import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Folder,
  Gauge,
  LayoutDashboard,
  ListFilter,
  LockKeyhole,
  LogOut,
  Network,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Terminal,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { api, type HostSnapshot, type HostStatus } from './api'
import { permissionLevels } from '../shared/access-control'
import { LoginView } from './views/Login'
import { TerminalView } from './views/Terminal'
import { FilesView } from './views/Files'
import { ContainersView } from './views/Containers'
import { LogsView } from './views/Logs'

type Page = 'overview' | 'hosts' | 'terminal' | 'files' | 'containers' | 'logs' | 'access'

const navigation: { label: string; items: { id: Page; label: string; icon: LucideIcon }[] }[] = [
  { label: 'WORKSPACE', items: [{ id: 'overview', label: '概览', icon: LayoutDashboard }, { id: 'hosts', label: '主机', icon: Server }] },
  { label: 'OPERATE', items: [{ id: 'terminal', label: '终端', icon: Terminal }, { id: 'files', label: '文件', icon: Folder }, { id: 'containers', label: '容器', icon: Box }] },
  { label: 'OBSERVE', items: [{ id: 'logs', label: '日志与审计', icon: Activity }] },
]

const pageNames: Record<Page, string> = {
  overview: '概览',
  hosts: '主机',
  terminal: '终端',
  files: '文件管理',
  containers: '容器',
  logs: '日志与审计',
  access: '凭据与权限',
}

function App() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [page, setPage] = useState<Page>('overview')
  const [hosts, setHosts] = useState<HostSnapshot[]>([])
  const [hostsError, setHostsError] = useState('')
  const [hostsLoading, setHostsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const refreshHosts = useCallback(async () => {
    setHostsLoading(true)
    try {
      const result = await api.getHosts()
      setHosts(result.hosts)
      setHostsError('')
    } catch (cause) {
      setHostsError(cause instanceof Error ? cause.message : '采集失败')
    } finally {
      setHostsLoading(false)
    }
  }, [])

  useEffect(() => {
    api.getSession()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
  }, [])

  useEffect(() => {
    if (authed !== true) return
    void refreshHosts()
    const timer = window.setInterval(() => { void refreshHosts() }, 30000)
    return () => window.clearInterval(timer)
  }, [authed, refreshHosts])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2800)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (authed !== true) return
    document.title = `${pageNames[page]} · Yard`
  }, [page, authed])

  useEffect(() => {
    if (authed !== true) return
    function focusSearch(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      event.preventDefault()
      searchInputRef.current?.focus()
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [authed])

  const onlineCount = hosts.filter((host) => host.status === 'online').length
  const issueCount = hosts.filter((host) => host.status !== 'online').length
  const visibleHosts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return hosts
    return hosts.filter((host) => `${host.label} ${host.address} ${host.group} ${host.role}`.toLocaleLowerCase().includes(query))
  }, [hosts, search])

  async function handleLogout() {
    await api.logout().catch(() => {})
    setAuthed(false)
    setHosts([])
  }

  if (authed === null) {
    return <div className="login-shell"><p className="page-detail">加载中…</p></div>
  }

  if (authed === false) {
    return <LoginView onLogin={() => setAuthed(true)} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="应用侧栏">
        <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); setPage('overview') }}>
          <span className="brand-mark" aria-hidden="true"><Network size={17} strokeWidth={2.2} /></span>
          <span className="brand-copy"><strong>YARD</strong><small>SERVER CONTROL</small></span>
        </a>

        <div className="workspace-switcher">
          <span className="workspace-avatar">H</span>
          <span className="workspace-copy"><strong>Home lab</strong><small>LAN only</small></span>
          <ChevronDown size={15} aria-hidden="true" />
        </div>

        <nav className="primary-nav" aria-label="主导航">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-label">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    className={`nav-item ${page === item.id ? 'is-active' : ''}`}
                    key={item.id}
                    type="button"
                    aria-current={page === item.id ? 'page' : undefined}
                    onClick={() => setPage(item.id)}
                  >
                    <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.id === 'logs' && issueCount > 0 && <span className="nav-count">{issueCount}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-health"><span className="status-pip" /><span>Control plane</span><strong>{hostsLoading ? '同步中' : onlineCount === hosts.length && hosts.length > 0 ? '正常' : `${onlineCount}/${hosts.length}`}</strong></div>
          <button className={`nav-item ${page === 'access' ? 'is-active' : ''}`} type="button" aria-current={page === 'access' ? 'page' : undefined} onClick={() => setPage('access')}>
            <ShieldCheck size={17} strokeWidth={1.8} aria-hidden="true" /><span>凭据与权限</span>
          </button>
          <button className="profile-button" type="button" onClick={handleLogout}>
            <span className="profile-avatar">OW</span>
            <span className="profile-copy"><strong>Owner</strong><small>退出登录</small></span>
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Home lab</span><ChevronRight size={14} aria-hidden="true" /><strong>{pageNames[page]}</strong></div>
          <div className="topbar-actions">
            <search className="global-search" aria-label="搜索主机">
              <Search size={15} aria-hidden="true" />
              <input ref={searchInputRef} aria-label="搜索主机、地址或分组" name="query" type="search" autoComplete="off" placeholder="搜索主机…" value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
              <kbd>/</kbd>
            </search>
            <span className="live-pill"><span /> LIVE</span>
            <button className="icon-button notification-button" type="button" aria-label={`异常主机，${issueCount} 台`} onClick={() => setPage('logs')}>
              <Bell size={17} aria-hidden="true" />{issueCount > 0 && <i />}
            </button>
            <button className="icon-button" type="button" aria-label="刷新主机数据" onClick={() => void refreshHosts()}><RefreshCw size={16} aria-hidden="true" className={hostsLoading ? 'spin' : ''} /></button>
          </div>
        </header>

        <div className="page-content">
          {page === 'overview' && <OverviewPage hosts={hosts} error={hostsError} onOpenPage={setPage} />}
          {page === 'hosts' && <HostsPage hosts={visibleHosts} query={search} onQuery={setSearch} />}
          {page === 'terminal' && <TerminalView hosts={hosts} notify={setToast} />}
          {page === 'files' && <FilesView hosts={hosts} notify={setToast} />}
          {page === 'containers' && <ContainersView hosts={hosts} notify={setToast} />}
          {page === 'logs' && <LogsView hosts={hosts} />}
          {page === 'access' && <AccessPage hosts={hosts} onAction={setToast} onLogout={handleLogout} />}
        </div>
      </main>

      {toast && <div className="toast" role="status"><Check size={15} aria-hidden="true" />{toast}</div>}
    </div>
  )
}

function PageHeading({ eyebrow, title, detail, children }: { eyebrow: string; title: string; detail: string; children?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-detail">{detail}</p></div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  )
}

function StatusBadge({ status }: { status: HostStatus }) {
  const labels: Record<HostStatus, string> = { online: '在线', offline: '离线', error: '错误' }
  return <span className={`status-badge status-${status}`}><span className="status-dot" />{labels[status]}</span>
}

function Meter({ value, label, tone }: { value?: number; label: string; tone?: 'warn' | 'critical' }) {
  const safe = value ?? 0
  return (
    <div className={`meter meter-${tone ?? 'default'}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safe}>
      <span style={{ inlineSize: `${safe}%` }} />
    </div>
  )
}

function OverviewPage({ hosts, error, onOpenPage }: { hosts: HostSnapshot[]; error: string; onOpenPage: (page: Page) => void }) {
  const date = new Intl.DateTimeFormat('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
  const online = hosts.filter((host) => host.status === 'online')
  const avgCpu = online.length ? Math.round(online.reduce((sum, host) => sum + (host.cpuPercent ?? 0), 0) / online.length) : 0
  const avgMemory = online.length ? Math.round(online.reduce((sum, host) => sum + (host.memoryPercent ?? 0), 0) / online.length) : 0

  return (
    <>
      <PageHeading eyebrow={`HOME LAB  /  ${date.toUpperCase()}`} title="服务器概览" detail={error || '所有已登记主机的实时状态。'}>
        <button className="button button-secondary" type="button" onClick={() => onOpenPage('hosts')}><ListFilter size={16} aria-hidden="true" />主机列表</button>
        <button className="button button-secondary" type="button" onClick={() => onOpenPage('terminal')}><Terminal size={16} aria-hidden="true" />打开终端</button>
      </PageHeading>

      <section className="stat-grid" aria-label="总体状态">
        <StatCard icon={Server} label="已登记主机" value={hosts.length.toString().padStart(2, '0')} detail={`${online.length} 台在线`} tone={online.length === hosts.length ? 'green' : 'amber'} />
        <StatCard icon={Gauge} label="平均 CPU" value={avgCpu.toString()} suffix="%" detail="在线主机均值" tone={avgCpu > 70 ? 'amber' : 'neutral'} />
        <StatCard icon={Gauge} label="平均内存" value={avgMemory.toString()} suffix="%" detail="在线主机均值" tone={avgMemory > 80 ? 'amber' : 'neutral'} />
        <StatCard icon={AlertTriangle} label="异常主机" value={(hosts.length - online.length).toString().padStart(2, '0')} detail={hosts.length - online.length ? '需要检查' : '一切正常'} tone={hosts.length - online.length ? 'amber' : 'green'} />
      </section>

      <div className="dashboard-grid">
        <section className="panel host-panel" aria-labelledby="host-overview-title">
          <div className="panel-header">
            <div><div className="panel-title-line"><h2 id="host-overview-title">主机状态</h2><span className="subtle-count">{hosts.length} HOSTS</span></div><p>每 30 秒自动采集</p></div>
            <button className="text-action" type="button" onClick={() => onOpenPage('hosts')}>全部主机 <ArrowUpRight size={14} aria-hidden="true" /></button>
          </div>
          <HostTable hosts={hosts.slice(0, 6)} />
          <div className="panel-footer"><span><span className="status-pip" />实时采集</span><button className="text-action" type="button" onClick={() => onOpenPage('hosts')}>查看主机详情 <ArrowUpRight size={14} aria-hidden="true" /></button></div>
        </section>

        <section className="panel" aria-labelledby="resource-title">
          <div className="panel-header">
            <div><div className="panel-title-line"><h2 id="resource-title">资源分布</h2><span className="subtle-count">PER HOST</span></div><p>CPU 与内存使用</p></div>
          </div>
          <div className="resource-breakdown">
            {online.map((host) => (
              <div className="resource-row" key={host.hostId}>
                <div className="resource-row-head"><strong>{host.label}</strong><span>{host.cpuPercent ?? 0}% CPU · {host.memoryPercent ?? 0}% MEM</span></div>
                <Meter value={host.cpuPercent} label={`${host.label} CPU`} tone={(host.cpuPercent ?? 0) > 70 ? 'warn' : undefined} />
                <Meter value={host.memoryPercent} label={`${host.label} 内存`} tone={(host.memoryPercent ?? 0) > 80 ? 'warn' : undefined} />
              </div>
            ))}
            {online.length === 0 && <div className="empty-state"><Server size={22} aria-hidden="true" /><span>没有在线主机</span></div>}
          </div>
        </section>
      </div>
    </>
  )
}

function HostsPage({ hosts, query, onQuery }: { hosts: HostSnapshot[]; query: string; onQuery: (query: string) => void }) {
  return (
    <>
      <PageHeading eyebrow="INVENTORY  /  FLEET" title="主机" detail={`${hosts.length} 台已登记主机`}>
        <label className="inline-search"><Search size={15} aria-hidden="true" /><span className="sr-only">筛选主机</span><input type="search" name="host-filter" autoComplete="off" placeholder="筛选主机" value={query} onChange={(event) => onQuery(event.currentTarget.value)} /></label>
      </PageHeading>
      <section className="panel" aria-labelledby="directory-title">
        <div className="host-table-heading"><h2 id="directory-title">所有主机</h2><span>实时采集</span></div>
        <HostTable hosts={hosts} />
        <div className="directory-footer"><span>显示 {hosts.length} 台主机</span><span>指纹均已固定验证</span></div>
      </section>
    </>
  )
}

function HostTable({ hosts }: { hosts: HostSnapshot[] }) {
  return (
    <div className="table-scroll" role="region" aria-label="主机运行状态表" tabIndex={0}>
      <table className="host-table">
        <caption className="sr-only">主机名称、状态、资源使用和系统信息</caption>
        <thead><tr><th scope="col">主机</th><th scope="col">状态</th><th scope="col">CPU</th><th scope="col">内存</th><th scope="col">磁盘</th><th scope="col">系统</th></tr></thead>
        <tbody>
          {hosts.length === 0 && <tr><td className="empty-table" colSpan={6}>没有匹配的主机</td></tr>}
          {hosts.map((host) => (
            <tr key={host.hostId}>
              <td><span className="host-cell-button"><span className={`host-glyph glyph-${host.status === 'online' ? 'online' : host.status}`}><Server size={15} aria-hidden="true" /></span><span className="host-cell-copy"><strong>{host.label}</strong><small>{host.address} · {host.role}</small></span></span></td>
              <td><StatusBadge status={host.status} /></td>
              <td><div className="table-meter-cell"><Meter value={host.cpuPercent} label={`${host.label} CPU`} tone={(host.cpuPercent ?? 0) > 70 ? 'warn' : undefined} /><span>{host.status === 'online' ? `${host.cpuPercent ?? 0}%` : '—'}</span></div></td>
              <td><div className="table-meter-cell"><Meter value={host.memoryPercent} label={`${host.label} 内存`} tone={(host.memoryPercent ?? 0) > 80 ? 'warn' : undefined} /><span>{host.status === 'online' ? `${host.memoryPercent ?? 0}%` : '—'}</span></div></td>
              <td><div className="table-meter-cell"><Meter value={host.diskPercent} label={`${host.label} 磁盘`} tone={(host.diskPercent ?? 0) > 85 ? 'warn' : undefined} /><span>{host.status === 'online' ? `${host.diskPercent ?? 0}%` : '—'}</span></div></td>
              <td className="latency-cell">{host.os ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, suffix, detail, tone }: { icon: LucideIcon; label: string; value: string; suffix?: string; detail: string; tone: 'green' | 'amber' | 'neutral' }) {
  return (
    <article className="stat-card">
      <div className="stat-top"><span className={`stat-icon icon-${tone}`}><Icon size={17} strokeWidth={1.8} aria-hidden="true" /></span><span className="stat-label">{label}</span></div>
      <div className="stat-value">{value}{suffix && <span>{suffix}</span>}</div>
      <div className="stat-detail">{tone === 'green' && <CheckCircle2 size={13} aria-hidden="true" />}{tone === 'amber' && <AlertTriangle size={13} aria-hidden="true" />}{detail}</div>
    </article>
  )
}

function AccessPage({ hosts, onAction, onLogout }: { hosts: HostSnapshot[]; onAction: (message: string) => void; onLogout: () => void }) {
  return (
    <>
      <PageHeading eyebrow="SECURITY  /  LOCAL WORKSPACE" title="凭据与权限" detail="单管理员模式 · SSH 密钥仅由服务端持有">
        <button className="button button-secondary" type="button" onClick={onLogout}><LogOut size={15} aria-hidden="true" />退出登录</button>
      </PageHeading>
      <div className="access-grid">
        <section className="panel access-panel" aria-labelledby="identity-title">
          <div className="panel-header"><div><div className="panel-title-line"><h2 id="identity-title">当前身份</h2><span className="subtle-count">SESSION</span></div><p>工作区访问状态</p></div><span className="role-pill role-owner">OWNER</span></div>
          <div className="identity-card"><span className="identity-avatar">OW</span><span><strong>Owner</strong><small>本机部署 · 仅内网可达</small></span><span className="identity-online"><span />已登录</span></div>
          <div className="identity-facts">
            <div><span>已登记主机</span><strong>{hosts.length} 台</strong></div>
            <div><span>SSH 凭据</span><strong>服务端只读挂载</strong></div>
            <div><span>审计</span><strong>全部操作留痕</strong></div>
          </div>
        </section>

        <section className="panel access-panel" aria-labelledby="credential-title">
          <div className="panel-header"><div><div className="panel-title-line"><h2 id="credential-title">凭据配置档</h2><span className="subtle-count">NO SECRETS IN UI</span></div><p>凭据永不进入浏览器</p></div><button className="icon-button" type="button" aria-label="添加凭据配置档" onClick={() => onAction('当前为单凭据模式，多凭据后续开放')}><Plus size={17} aria-hidden="true" /></button></div>
          <div className="credential-list">
            {hosts.slice(0, 4).map((host) => (
              <div className="credential-row" key={host.hostId}>
                <span className="credential-icon"><Server size={16} aria-hidden="true" /></span>
                <span><strong>{host.label}</strong><small>{host.address} · 指纹已固定</small></span>
                <span className="credential-row-status">已关联</span>
              </div>
            ))}
          </div>
          <div className="secure-note"><LockKeyhole size={15} aria-hidden="true" /><span>SSH 私钥通过只读挂载注入服务端，界面与浏览器不可见。</span></div>
        </section>

        <section className="panel permissions-panel" aria-labelledby="permissions-title">
          <div className="panel-header"><div><div className="panel-title-line"><h2 id="permissions-title">权限级别</h2><span className="subtle-count">PREVIEW</span></div><p>Connect / View / Edit / Manage · 按主机与资源分别授权</p></div><Users size={18} aria-hidden="true" /></div>
          <div className="permission-table-scroll" role="region" aria-label="Yard 权限级别说明" tabIndex={0}>
            <table className="permission-table"><caption className="sr-only">Yard 的四个权限级别及其计划授权范围</caption><thead><tr><th scope="col">级别</th><th scope="col">计划授权范围</th></tr></thead><tbody>
              {permissionLevels.map((level) => <tr key={level.id}><th scope="row"><span className="permission-role"><span className={`permission-mark mark-${level.id}`} />{level.label}</span></th><td>{level.summary}</td></tr>)}
            </tbody></table>
          </div>
        </section>
      </div>
    </>
  )
}

export default App
