import { Search, Server } from 'lucide-react'
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
          <h1>主机</h1>
          <p className="page-detail">
            {hosts.length} 台已登记，{groups.length} 个分组，SSH 指纹全部固定
          </p>
        </div>
        <div className="heading-actions">
          <label className="command-trigger" style={{ cursor: 'text' }}>
            <Search size={14} aria-hidden="true" />
            <input
              aria-label="筛选主机"
              type="search"
              placeholder="筛选主机"
              autoComplete="off"
              value={query}
              onChange={(event) => onQuery(event.currentTarget.value)}
              style={{
                flex: 1,
                minInlineSize: 0,
                border: 0,
                background: 'transparent',
                outline: 'none',
                color: 'inherit',
                fontSize: 12,
              }}
            />
          </label>
        </div>
      </div>

      <section aria-labelledby="all-hosts-title">
        <div className="section-title">
          <h2 id="all-hosts-title">全部主机</h2>
          <span className="count">{hosts.length} 台</span>
        </div>

        <div className="rack">
          <div className="rack-head" aria-hidden="true">
            <span>主机</span>
            <span>状态</span>
            <span>平均负载</span>
            <span>资源</span>
            <span />
          </div>

          {hosts.map((host) => (
            <div className="rack-row" key={host.hostId}>
              <span className="rack-lamp" data-state={host.status} aria-hidden="true" />
              <span className="rack-name">
                <b>{host.label}</b>
                <small>{host.address} · {host.role}</small>
              </span>
              <span className="rack-state" data-state={host.status}>
                {host.status === 'online' ? '在线' : host.status === 'error' ? '连接失败' : '离线'}
              </span>
              <span className="rack-load">{host.load ? host.load[0].toFixed(2) : '—'}</span>
              <div className="gauges">
                <Gauge label="CPU" value={host.cpuPercent} />
                <Gauge label="内存" value={host.memoryPercent} />
                <Gauge label="磁盘" value={host.diskPercent} />
              </div>
              <button className="rack-open" type="button" onClick={() => onOpenConsole(host.hostId, 'terminal')}>
                打开
              </button>
            </div>
          ))}

          {hosts.length === 0 && (
            <div className="term-empty" style={{ minBlockSize: 200 }}>
              <Server size={20} aria-hidden="true" />
              <span>{query ? '没有匹配的主机' : '还没有登记主机'}</span>
            </div>
          )}
        </div>

        <p className="note">
          <Server size={13} aria-hidden="true" />
          <span>
            分组：{groups.join('、') || '未分组'}。所有连接经服务端发起，SSH 主机密钥与登记指纹逐一比对。
          </span>
        </p>
      </section>
    </>
  )
}

function Gauge({ label, value }: { label: string; value?: number }) {
  const safe = value ?? 0
  const tone = safe > 88 ? 'fail' : safe > 72 ? 'warn' : undefined
  return (
    <span className="gauge">
      <span className="gauge-top">
        {label}
        <b>{value === undefined ? '—' : `${safe}%`}</b>
      </span>
      <span className="gauge-rail" data-tone={tone} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safe}>
        <i style={{ inlineSize: `${safe}%` }} />
      </span>
    </span>
  )
}
