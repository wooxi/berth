import { ChevronRight, Search, Server } from 'lucide-react'
import type { HostSnapshot } from '../api'

export function HostsView({
  hosts,
  query,
  onQuery,
  onOpenConsole,
}: {
  hosts: HostSnapshot[]
  query: string
  onQuery: (query: string) => void
  onOpenConsole: (hostId: string, tab: 'terminal' | 'files' | 'containers' | 'logs') => void
}) {
  const groups = Array.from(new Set(hosts.map((host) => host.group)))

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">INVENTORY / FLEET</p>
          <h1>主机</h1>
          <p className="page-detail">{hosts.length} 台已登记 · {groups.length} 个分组 · 指纹已固定</p>
        </div>
        <div className="heading-actions">
          <label className="command-trigger" style={{ cursor: 'text' }}>
            <Search size={14} aria-hidden="true" />
            <input
              aria-label="筛选主机"
              type="search"
              placeholder="筛选主机…"
              autoComplete="off"
              value={query}
              onChange={(event) => onQuery(event.currentTarget.value)}
              style={{ flex: 1, minInlineSize: 0, border: 0, background: 'transparent', outline: 'none', color: 'inherit', fontSize: 12 }}
            />
          </label>
        </div>
      </div>

      <div className="bento">
        <section className="tile" style={{ gridColumn: 'span 12' }} aria-labelledby="all-hosts-title">
          <div className="panel-title-line" style={{ marginBottom: 10 }}>
            <h2 id="all-hosts-title" style={{ margin: 0, fontSize: 12.5 }}>全部主机</h2>
            <span className="subtle-count">{hosts.length} HOSTS</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">主机名称、状态、资源使用与系统信息</caption>
              <thead>
                <tr>
                  <th scope="col" style={{ inlineSize: '26%' }}>主机</th>
                  <th scope="col" style={{ inlineSize: '12%' }}>状态</th>
                  <th scope="col" style={{ inlineSize: '14%' }}>CPU</th>
                  <th scope="col" style={{ inlineSize: '14%' }}>内存</th>
                  <th scope="col" style={{ inlineSize: '14%' }}>磁盘</th>
                  <th scope="col">系统</th>
                  <th scope="col"><span className="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                {hosts.map((host) => (
                  <tr key={host.hostId}>
                    <td>
                      <button
                        type="button"
                        className="host-quick"
                        style={{ marginInlineStart: 0 }}
                        onClick={() => onOpenConsole(host.hostId, 'terminal')}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: 0, padding: 0 }}>
                          <Server size={13} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
                          <span className="cell-mono" style={{ fontSize: 11.5 }}>{host.label}</span>
                          <span className="cell-dim" style={{ fontSize: 10 }}>{host.address}</span>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className={`status-badge status-${host.status}`}>
                        <span className="status-dot" />
                        {host.status === 'online' ? '在线' : host.status === 'error' ? '错误' : '离线'}
                      </span>
                    </td>
                    <td><MeterCell value={host.cpuPercent} /></td>
                    <td><MeterCell value={host.memoryPercent} /></td>
                    <td><MeterCell value={host.diskPercent} /></td>
                    <td className="cell-dim" style={{ fontSize: 10.5 }}>{host.os ?? '—'}</td>
                    <td>
                      <button className="button button-ghost compact-button" type="button" onClick={() => onOpenConsole(host.hostId, 'terminal')}>
                        打开 <ChevronRight size={13} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
                {hosts.length === 0 && <tr><td className="empty-table" colSpan={7}>没有匹配的主机</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  )
}

function MeterCell({ value }: { value?: number }) {
  if (value === undefined) return <span className="cell-dim">—</span>
  const tone = value > 85 ? 'tone-danger' : value > 70 ? 'tone-warn' : undefined
  return (
    <div className="table-meter">
      <span className={`track ${tone ?? ''}`}><span style={{ inlineSize: `${value}%` }} /></span>
      <span>{value}%</span>
    </div>
  )
}
