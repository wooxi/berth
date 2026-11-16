import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock3, Server } from 'lucide-react'
import { api, type AuditEvent, type HostSnapshot } from '../api'

const UNITS = ['docker.service', 'ssh.service', 'nginx.service'] as const

export function LogsView({ hosts }: { hosts: HostSnapshot[] }) {
  const [hostId, setHostId] = useState(hosts[0]?.hostId ?? '')
  const [unit, setUnit] = useState<string>(UNITS[0])
  const [lines, setLines] = useState<string[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'journal' | 'audit'>('journal')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setError('')
      try {
        const result = await api.getLogs(hostId, unit, 150)
        if (!cancelled) setLines(result.lines)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '日志读取失败')
      }
    }
    void load()
    const timer = window.setInterval(load, 30000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [hostId, unit])

  useEffect(() => {
    api.getAudit(60).then((result) => setAudit(result.events)).catch(() => {})
  }, [])

  return (
    <div className="logs-layout">
      <section className="panel log-panel" aria-label="系统日志">
        <div className="event-toolbar">
          <div>
            <div className="panel-title-line"><h2>系统日志</h2><span className="subtle-count">JOURNALCTL</span></div>
            <p>每 30 秒自动刷新</p>
          </div>
          <div className="event-filters">
            <label className="host-select-label">
              <span className="sr-only">选择主机</span>
              <select value={hostId} onChange={(event) => setHostId(event.currentTarget.value)}>
                {hosts.map((host) => <option key={host.hostId} value={host.hostId}>{host.label}</option>)}
              </select>
            </label>
            <label className="host-select-label">
              <span className="sr-only">选择服务单元</span>
              <select value={unit} onChange={(event) => setUnit(event.currentTarget.value)}>
                {UNITS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="log-output" role="log" aria-live="off" aria-label="journalctl 输出">
          {lines.map((line, index) => <div className="log-line" key={`${index}-${line}`}>{line}</div>)}
          {error && <div className="log-line log-error">{error}</div>}
        </div>
      </section>

      <section className="panel audit-panel" aria-label="审计记录">
        <div className="event-toolbar">
          <div>
            <div className="panel-title-line"><h2>审计记录</h2><span className="subtle-count">YARD AUDIT</span></div>
            <p>本实例的操作流水</p>
          </div>
          <div className="event-filters" role="tablist" aria-label="审计视图切换">
            <button type="button" role="tab" aria-selected={tab === 'audit'} className={tab === 'audit' ? 'filter-active' : ''} onClick={() => setTab('audit')}>操作审计</button>
            <button type="button" role="tab" aria-selected={tab === 'journal'} className={tab === 'journal' ? 'filter-active' : ''} onClick={() => setTab('journal')}>日志流</button>
          </div>
        </div>
        {tab === 'audit' ? (
          <div className="event-list">
            {audit.map((event, index) => (
              <article className="event-row event-row-slim" key={`${event.at}-${index}`}>
                <span className={`event-marker ${event.outcome === 'allow' ? 'marker-success' : 'marker-critical'}`}>
                  {event.outcome === 'allow' ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
                </span>
                <span className="event-main"><strong>{event.action}</strong><small>{event.detail ?? '—'}</small></span>
                <span className="event-host">{event.hostId ? <><Server size={13} aria-hidden="true" />{event.hostId}</> : '—'}</span>
                <time className="event-time"><Clock3 size={13} aria-hidden="true" />{new Date(event.at).toLocaleTimeString('zh-CN')}</time>
              </article>
            ))}
            {audit.length === 0 && <div className="empty-state"><Activity size={22} aria-hidden="true" /><span>暂无记录</span></div>}
          </div>
        ) : (
          <div className="log-output log-output-compact" role="log" aria-label="日志流">
            {lines.slice(0, 40).map((line, index) => <div className="log-line" key={`${index}-${line}`}>{line}</div>)}
          </div>
        )}
      </section>
    </div>
  )
}
