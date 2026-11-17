import { Activity, Server } from 'lucide-react'
import type { AuditEvent, HostSnapshot } from '../api'

type Props = {
  hosts: HostSnapshot[]
  audit: AuditEvent[]
  error: string
  loading: boolean
  onOpenConsole: (hostId: string, tab?: 'terminal' | 'files' | 'containers' | 'logs') => void
  onOpenAccess: () => void
}

export function OverviewView({ hosts, audit, error, loading, onOpenConsole, onOpenAccess }: Props) {
  const online = hosts.filter((host) => host.status === 'online')
  const mean = (pick: (host: HostSnapshot) => number | undefined) =>
    online.length ? Math.round(online.reduce((sum, host) => sum + (pick(host) ?? 0), 0) / online.length) : 0

  const avgCpu = mean((host) => host.cpuPercent)
  const avgMem = mean((host) => host.memoryPercent)
  const avgDisk = mean((host) => host.diskPercent)
  const issues = hosts.length - online.length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>概览</h1>
          <p className="page-sub">{error || '全部已登记服务器的当前状态'}</p>
        </div>
        <div className="page-head-actions">
          <span className="live-pill"><span aria-hidden="true" />{loading ? '采集中' : '实时'}</span>
        </div>
      </div>

      <div className="kpi-row">
        <article className="kpi">
          <div className="kpi-label"><i data-tone={issues ? 'warn' : 'ok'} aria-hidden="true" />在线</div>
          <div className="kpi-value">{online.length}<small>/ {hosts.length}</small></div>
          <div className="kpi-note">{issues ? `${issues} 台待查` : '全部正常'}</div>
        </article>
        <article className="kpi">
          <div className="kpi-label"><i aria-hidden="true" />平均 CPU</div>
          <div className="kpi-value">{avgCpu}<small>%</small></div>
          <div className="kpi-note">在线主机均值</div>
        </article>
        <article className="kpi">
          <div className="kpi-label"><i aria-hidden="true" />平均内存</div>
          <div className="kpi-value">{avgMem}<small>%</small></div>
          <div className="kpi-note">在线主机均值</div>
        </article>
        <article className="kpi">
          <div className="kpi-label"><i aria-hidden="true" />平均磁盘</div>
          <div className="kpi-value">{avgDisk}<small>%</small></div>
          <div className="kpi-note">根分区</div>
        </article>
      </div>

      <div className="split">
        <section aria-labelledby="roster-title">
          <div className="section-head">
            <h2 id="roster-title">服务器</h2>
            <span className="figure">{hosts.length}</span>
          </div>

          <div className="roster">
            <div className="roster-head" aria-hidden="true">
              <span>主机</span>
              <span>状态</span>
              <span>负载</span>
              <span>资源</span>
              <span />
            </div>

            {hosts.map((host) => (
              <div className="host-row" key={host.hostId}>
                <span className="host-dot" data-state={host.status} aria-hidden="true" />
                <span className="host-name-cell">
                  <b>{host.label}</b>
                  <small>{host.address}</small>
                </span>
                <span className="state-text" data-state={host.status}>
                  {host.status === 'online' ? '在线' : host.status === 'error' ? '连接失败' : '离线'}
                </span>
                <span className="load-cell">{host.load ? host.load[0].toFixed(2) : '—'}</span>
                <div className="gauges">
                  <Gauge label="CPU" value={host.cpuPercent} />
                  <Gauge label="内存" value={host.memoryPercent} />
                  <Gauge label="磁盘" value={host.diskPercent} />
                </div>
                <button className="row-open" type="button" onClick={() => onOpenConsole(host.hostId)}>
                  打开
                </button>
              </div>
            ))}

            {hosts.length === 0 && (
              <div className="term-empty">
                <Server size={20} aria-hidden="true" />
                <span>{loading ? '正在采集…' : error || '还没有登记主机'}</span>
              </div>
            )}
          </div>

          {issues > 0 && (
            <p className="note" data-tone="warn">
              <Activity size={13} aria-hidden="true" />
              <span>{issues} 台主机未响应，打开可查看连接错误。</span>
            </p>
          )}
        </section>

        <aside className="side-stack">
          <section aria-labelledby="res-title">
            <div className="section-head">
              <h2 id="res-title">资源</h2>
              <span className="figure">{online.length}</span>
            </div>
            <div className="log-list">
              {online.map((host) => (
                <div className="log-row" key={host.hostId}>
                  <span className="log-dot" data-ok="true" aria-hidden="true" />
                  <span className="log-main">
                    <b>{host.label}</b>
                    <small>{host.cpuPercent ?? '—'}% CPU · {host.memoryPercent ?? '—'}% 内存</small>
                  </span>
                  <time>{host.load ? host.load[0].toFixed(2) : '—'}</time>
                </div>
              ))}
              {online.length === 0 && <div className="term-empty" style={{ minBlockSize: 110 }}><span>没有在线主机</span></div>}
            </div>
          </section>

          <section aria-labelledby="log-title">
            <div className="section-head">
              <h2 id="log-title">最近操作</h2>
              <span className="figure">{audit.length}</span>
            </div>
            <div className="log-list">
              {audit.slice(0, 7).map((event, index) => (
                <div className="log-row" key={`${event.at}-${index}`}>
                  <span className="log-dot" data-ok={event.outcome === 'allow'} aria-hidden="true" />
                  <span className="log-main">
                    <b>{event.action}</b>
                    <small>{event.hostId ?? '会话'}</small>
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
