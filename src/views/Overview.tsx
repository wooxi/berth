import { Activity, AlertTriangle, ChevronRight, Cpu, HardDrive, MemoryStick, Server, ShieldCheck } from 'lucide-react'
import type { HostSnapshot } from '../api'
import type { AuditEvent } from '../api'
import { Sparkline } from '../components/Sparkline'

type OverviewProps = {
  hosts: HostSnapshot[]
  histories: Map<string, number[]>
  audit: AuditEvent[]
  error: string
  loading: boolean
  onOpenConsole: (hostId: string, tab: 'terminal' | 'files' | 'containers' | 'logs') => void
  onOpenHosts: () => void
  onOpenAccess: () => void
}

export function OverviewView({
  hosts,
  histories,
  audit,
  error,
  loading,
  onOpenConsole,
  onOpenHosts,
  onOpenAccess,
}: OverviewProps) {
  const online = hosts.filter((host) => host.status === 'online')
  const average = (pick: (host: HostSnapshot) => number | undefined) =>
    online.length ? Math.round(online.reduce((sum, host) => sum + (pick(host) ?? 0), 0) / online.length) : 0

  const avgCpu = average((host) => host.cpuPercent)
  const avgMem = average((host) => host.memoryPercent)
  const avgDisk = average((host) => host.diskPercent)
  const issues = hosts.length - online.length

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">HOME LAB / FLEET</p>
          <h1>集群概览</h1>
          <p className="page-detail">{error || `${online.length} / ${hosts.length} 台在线 · 每 30 秒自动采集`}</p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" type="button" onClick={onOpenHosts}>
            主机列表 <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="bento">
        <Tile icon={Server} label="在线主机" value={online.length} total={hosts.length} sub={issues ? `${issues} 台异常` : '全部正常'} />
        <Tile icon={Cpu} label="平均 CPU" value={avgCpu} unit="%" sub={loading ? '采集中…' : '全部在线主机'} />
        <Tile icon={MemoryStick} label="平均内存" value={avgMem} unit="%" sub={loading ? '采集中…' : '全部在线主机'} />
        <Tile icon={HardDrive} label="平均磁盘" value={avgDisk} unit="%" sub="根分区使用率" />

        {hosts.map((host) => (
          <article className="tile host-tile" key={host.hostId}>
            <div className="host-tile-head">
              <span className="identity-glyph" aria-hidden="true"><Server size={16} /></span>
              <div className="host-tile-title">
                <strong>{host.label}</strong>
                <small>{host.address} · {host.role}</small>
              </div>
              <span className={`status-badge status-${host.status}`}>
                <span className="status-dot" />
                {host.status === 'online' ? '在线' : host.status === 'error' ? '错误' : '离线'}
              </span>
            </div>

            <div className="host-tile-metrics">
              <MetricMini label="CPU" value={host.cpuPercent} />
              <MetricMini label="MEM" value={host.memoryPercent} />
              <MetricMini label="DISK" value={host.diskPercent} />
            </div>

            <div className="host-tile-foot">
              <Sparkline values={histories.get(host.hostId) ?? []} label={`${host.label} CPU 趋势`} tone={(host.cpuPercent ?? 0) > 70 ? 'warn' : 'accent'} />
              <div className="host-quick">
                <button type="button" onClick={() => onOpenConsole(host.hostId, 'terminal')}>终端</button>
                <button type="button" onClick={() => onOpenConsole(host.hostId, 'files')}>文件</button>
                <button type="button" onClick={() => onOpenConsole(host.hostId, 'logs')}>日志</button>
              </div>
            </div>
          </article>
        ))}

        <section className="tile wide-tile" aria-labelledby="fleet-table-title">
          <div className="panel-title-line" style={{ marginBottom: 10 }}>
            <h2 id="fleet-table-title" style={{ margin: 0, fontSize: 12.5 }}>资源明细</h2>
            <span className="subtle-count">PER HOST</span>
          </div>
          <div className="table-scroll">
            <table className="data-table" style={{ minInlineSize: 560 }}>
              <caption className="sr-only">各主机 CPU、内存、磁盘与系统信息</caption>
              <thead>
                <tr>
                  <th scope="col">主机</th>
                  <th scope="col">CPU</th>
                  <th scope="col">内存</th>
                  <th scope="col">磁盘</th>
                  <th scope="col">系统</th>
                </tr>
              </thead>
              <tbody>
                {hosts.map((host) => (
                  <tr key={host.hostId}>
                    <td>
                      <button className="button button-ghost compact-button" type="button" onClick={() => onOpenConsole(host.hostId, 'terminal')}>
                        <span className="cell-mono">{host.label}</span>
                      </button>
                    </td>
                    <td><TableMeter value={host.cpuPercent} /></td>
                    <td><TableMeter value={host.memoryPercent} /></td>
                    <td><TableMeter value={host.diskPercent} /></td>
                    <td className="cell-dim">{host.os ?? '—'}</td>
                  </tr>
                ))}
                {hosts.length === 0 && (
                  <tr><td className="empty-table" colSpan={5}>{error || '暂无主机数据'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="tile aside-tile" aria-labelledby="recent-audit-title">
          <div className="panel-title-line" style={{ marginBottom: 6 }}>
            <h2 id="recent-audit-title" style={{ margin: 0, fontSize: 12.5 }}>最近操作</h2>
            <span className="subtle-count">AUDIT</span>
          </div>
          {audit.slice(0, 6).map((event, index) => (
            <div className="audit-row" key={`${event.at}-${index}`}>
              <span className={`a-dot ${event.outcome === 'allow' ? 'a-allow' : 'a-deny'}`} aria-hidden="true" />
              <span className="a-main">
                <strong>{event.action}</strong>
                <small>{event.hostId ?? '—'}{event.detail ? ` · ${event.detail}` : ''}</small>
              </span>
              <time>{new Date(event.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
            </div>
          ))}
          {audit.length === 0 && (
            <div className="term-empty" style={{ minBlockSize: 120 }}>
              <Activity size={20} aria-hidden="true" />
              <span>暂无操作记录</span>
            </div>
          )}
          <button className="button button-ghost compact-button" type="button" style={{ marginTop: 8 }} onClick={onOpenAccess}>
            <ShieldCheck size={14} aria-hidden="true" />权限与凭据
          </button>
        </section>
      </div>

      {issues > 0 && (
        <p className="callout" style={{ margin: '14px 0 0' }}>
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{issues} 台主机未响应。打开主机页查看错误详情，或检查网络与 SSH 指纹。</span>
        </p>
      )}
    </>
  )
}

function Tile({ icon: Icon, label, value, unit, total, sub }: {
  icon: typeof Server
  label: string
  value: number
  unit?: string
  total?: number
  sub: string
}) {
  return (
    <article className="tile stat-tile">
      <div className="tile-label"><Icon size={14} aria-hidden="true" />{label}</div>
      <div className="tile-value">
        {String(value).padStart(2, '0')}
        {unit && <small>{unit}</small>}
        {total !== undefined && <small>/ {total}</small>}
      </div>
      <div className="tile-sub">{sub}</div>
    </article>
  )
}

function MetricMini({ label, value }: { label: string; value?: number }) {
  const safe = value ?? 0
  const tone = safe > 85 ? 'tone-danger' : safe > 70 ? 'tone-warn' : undefined
  return (
    <div className="metric-mini">
      <div className="metric-mini-label"><span>{label}</span><b>{value === undefined ? '—' : `${safe}%`}</b></div>
      <div className={`metric-mini-track ${tone ?? ''}`}>
        <span style={{ inlineSize: `${safe}%` }} />
      </div>
    </div>
  )
}

function TableMeter({ value }: { value?: number }) {
  if (value === undefined) return <span className="cell-dim">—</span>
  const tone = value > 85 ? 'tone-danger' : value > 70 ? 'tone-warn' : undefined
  return (
    <div className="table-meter">
      <span className={`track ${tone ?? ''}`}><span style={{ inlineSize: `${value}%` }} /></span>
      <span>{value}%</span>
    </div>
  )
}
