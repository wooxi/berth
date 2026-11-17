import { Box, Folder, ScrollText, Server, Terminal } from 'lucide-react'
import type { HostSnapshot } from '../api'
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
    <div className="console">
      {/* Sticky identity bar: never loses context when switching tabs. */}
      <header className="identity" aria-label={`${host.label} 身份信息`}>
        <div className="identity-main">
          <span className="identity-glyph" aria-hidden="true"><Server size={17} /></span>
          <div className="identity-text">
            <b>{host.label}</b>
            <small>{host.address} · {host.role}</small>
          </div>
          <span className={`status-badge status-${host.status}`}>
            <span className="status-dot" />
            {host.status === 'online' ? 'SSH 已连接' : host.status === 'error' ? '连接失败' : '离线'}
          </span>
        </div>

        <div className="identity-facts">
          <div className="fact"><span>OS</span><b>{host.os ?? '—'}</b></div>
          <div className="fact"><span>UPTIME</span><b>{host.uptime || '—'}</b></div>
          <div className="fact"><span>LOAD</span><b>{host.load ? host.load.map((n) => n.toFixed(2)).join(' ') : '—'}</b></div>
          <span className="perm-chip" title="当前会话权限">
            <i aria-hidden="true" />
            View
          </span>
        </div>
      </header>

      <div className="console-body">
        <div className="tab-row" role="tablist" aria-label="服务器工作区">
          {TABS.map((item) => {
            const Icon = item.icon
            const disabled = item.id === 'containers' && host.runtime === 'none'
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`tab-${item.id}`}
                aria-selected={tab === item.id}
                aria-controls={`panel-${item.id}`}
                tabIndex={tab === item.id ? 0 : -1}
                className="tab"
                onClick={() => onTabChange(item.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
                  event.preventDefault()
                  const index = TABS.findIndex((entry) => entry.id === tab)
                  const next = event.key === 'ArrowRight'
                    ? TABS[(index + 1) % TABS.length]
                    : TABS[(index - 1 + TABS.length) % TABS.length]
                  onTabChange(next.id)
                  document.getElementById(`tab-${next.id}`)?.focus()
                }}
              >
                <Icon size={14} aria-hidden="true" />
                {item.label}
                {disabled && <span className="tab-badge" aria-label="不可用">—</span>}
              </button>
            )
          })}
        </div>

        <div
          className="tab-panel"
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          tabIndex={0}
        >
          {tab === 'terminal' && <TerminalTab host={host} notify={notify} />}
          {tab === 'files' && <FilesTab host={host} notify={notify} />}
          {tab === 'containers' && <ContainersTab host={host} notify={notify} />}
          {tab === 'logs' && <LogsTab host={host} />}
        </div>
      </div>
    </div>
  )
}
