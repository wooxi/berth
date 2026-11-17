import { Activity, Cpu, MemoryStick, Server } from 'lucide-react'
import type { AuditEvent, HostSnapshot } from '../api'

type Props = {
  hosts: HostSnapshot[]
  audit: AuditEvent[]
  error: string
  loading: boolean
  onOpenConsole: (hostId: string, tab: 'terminal' | 'files' | 'containers' | 'logs') => void
  onOpenHosts: () => void
  onOpenAccess: () => void
}

export function OverviewView({ hosts, audit, error, loading, onOpenConsole, onOpenHosts, onOpenAccess }: Props) {
  const online = hosts.filter((host) => host.status === 'online')
  const mean = (pick: (host: HostSnapshot) => number | undefined) =>
    online.length ? Math.round(online.reduce((sum, host) => sum + (pick(host) ?? 0), 0) / online.length) : 0

  const avgCpu = mean((host) => host.cpuPercent)
  const avgMem = mean((host) => host.memoryPercent)
  const avgDisk = mean((host) => host.diskPercent)
  const issues = hosts.length - online.length

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>集群概览</h1>
          <p className="page-detail">
            {error
              ? error
              : `${online.length} 台在线，每 30 秒采集一次`}
          </p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" type="button" onClick={onOpenHosts}>
            全部主机
          </button>
        </div>
      </div>

      <dl className="summary-strip">
        <div className="summary-cell">
          <dt>在线</dt>
          <dd>{String(online.length).padStart(2, '0')}<small>/ {hosts.length}</small></dd>
        </div>
        <div className="summary-cell"><dt>平均 CPU</dt><dd>{avgCpu}<small>%</small></dd></div>
        <div className="summary-cell"><dt>平均内存</dt><dd>{avgMem}<small>%</small></dd></div>
        <div className="summary-cell"><dt>平均磁盘</dt><dd>{avgDisk}<small>%</small></dd></div>
      </dl>

      <div className="overview-grid">
        <section aria-labelledby="rack-title">
          <div className="section-title">
            <h2 id="rack-title">主机</h2>
            <small>按分组</small>
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
                  <small>{host.address}</small>
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
              <div className="term-empty" style={{ minBlockSize: 180 }}>
                <Server size={20} aria-hidden="true" />
                <span>{loading ? '正在采集…' : error || '没有已登记的主机'}</span>
              </div>
            )}
          </div>

          {issues > 0 && (
            <p className="note" data-tone="warn">
              <Activity size={13} aria-hidden="true" />
              <span>{issues} 台主机未响应。打开主机可查看连接错误。</span>
            </p>
          )}
        </section>

        <aside className="sidecol">
          <section aria-labelledby="belt-title">
            <div className="section-title">
              <h2 id="belt-title">资源</h2>
              <span className="count">{online.length} 台</span>
            </div>
            <div className="logbook">
              {online.map((host) => (
                <div className="logbook-row" key={host.hostId}>
                  <span className="logbook-flag" data-ok="true" aria-hidden="true" />
                  <span className="logbook-main">
                    <b>{host.label}</b>
                    <small>
                      <Cpu size={10} aria-hidden="true" style={{ verticalAlign: '-1px' }} /> {host.cpuPercent ?? '—'}%
                      {'  '}
                      <MemoryStick size={10} aria-hidden="true" style={{ verticalAlign: '-1px' }} /> {host.memoryPercent ?? '—'}%
                    </small>
                  </span>
                  <time>{host.load ? host.load[0].toFixed(2) : '—'}</time>
                </div>
              ))}
              {online.length === 0 && <div className="term-empty" style={{ minBlockSize: 110 }}><span>没有在线主机</span></div>}
            </div>
          </section>

          <section aria-labelledby="log-title">
            <div className="section-title">
              <h2 id="log-title">最近操作</h2>
              <span className="count">{audit.length}</span>
            </div>
            <div className="logbook">
              {audit.slice(0, 7).map((event, index) => (
                <div className="logbook-row" key={`${event.at}-${index}`}>
                  <span className="logbook-flag" data-ok={event.outcome === 'allow'} aria-hidden="true" />
                  <span className="logbook-main">
                    <b>{event.action}</b>
                    <small>{event.hostId ?? '会话'}{event.detail ? `：${event.detail}` : ''}</small>
                  </span>
                  <time>{new Date(event.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
                </div>
              ))}
              {audit.length === 0 && <div className="term-empty" style={{ minBlockSize: 110 }}><span>还没有操作记录</span></div>}
            </div>
            <button className="button button-quiet compact-button" type="button" style={{ marginBlockStart: 8 }} onClick={onOpenAccess}>
              查看权限
            </button>
          </section>
        </aside>
      </div>
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
