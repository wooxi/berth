import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, Pause, Play, RefreshCw, ScrollText } from 'lucide-react'
import { api, type AuditEvent, type HostSnapshot } from '../../api'
import { Toolbar } from '../../components/Toolbar'

const UNITS = ['docker.service', 'ssh.service', 'nginx.service'] as const

type Mode = 'journal' | 'audit'

export function LogsTab({ host }: { host: HostSnapshot }) {
  const [mode, setMode] = useState<Mode>(host.systemd ? 'journal' : 'audit')
  const [unit, setUnit] = useState<string>(UNITS[0])
  const [lines, setLines] = useState<string[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [live, setLive] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const loadJournal = useCallback(async () => {
    if (!host.systemd) return
    setLoading(true)
    setError('')
    try {
      const result = await api.getLogs(host.hostId, unit, 200)
      setLines(result.lines)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '日志读取失败')
    } finally {
      setLoading(false)
    }
  }, [host.hostId, host.systemd, unit])

  const loadAudit = useCallback(async () => {
    try {
      const result = await api.getAudit(80)
      setAudit(result.events.filter((event) => event.hostId === host.hostId || event.hostId === null))
    } catch {
      /* audit is non-critical */
    }
  }, [host.hostId])

  useEffect(() => {
    if (!live) return
    const run = () => {
      if (mode === 'journal') void loadJournal()
      else void loadAudit()
    }
    run()
    const timer = window.setInterval(run, 15000)
    return () => window.clearInterval(timer)
  }, [live, mode, loadJournal, loadAudit])

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [lines, autoScroll])

  return (
    <>
      <Toolbar info={`${mode === 'journal' ? lines.length : audit.length} 条 · ${live ? '自动刷新 15s' : '已暂停'}`}>
        <div className="toolbar-group" role="group" aria-label="日志来源">
          <button
            type="button"
            className={mode === 'journal' ? 'button button-primary compact-button' : 'button button-secondary compact-button'}
            aria-pressed={mode === 'journal'}
            disabled={!host.systemd}
            onClick={() => setMode('journal')}
          >
            <ScrollText size={14} aria-hidden="true" />系统日志
          </button>
          <button
            type="button"
            className={mode === 'audit' ? 'button button-primary compact-button' : 'button button-secondary compact-button'}
            aria-pressed={mode === 'audit'}
            onClick={() => setMode('audit')}
          >
            <ScrollText size={14} aria-hidden="true" />操作审计
          </button>
        </div>

        {mode === 'journal' && (
          <>
            <span className="toolbar-sep" aria-hidden="true" />
            <label className="sr-only" htmlFor={`unit-${host.hostId}`}>服务单元</label>
            <select
              id={`unit-${host.hostId}`}
              value={unit}
              onChange={(event) => setUnit(event.currentTarget.value)}
              style={{
                blockSize: 28,
                paddingInline: 8,
                border: '1px solid var(--line-strong)',
                borderRadius: 5,
                background: 'var(--bg-raised)',
                color: 'var(--text-soft)',
                fontFamily: 'var(--mono)',
                fontSize: 11,
              }}
            >
              {UNITS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </>
        )}

        <span className="toolbar-sep" aria-hidden="true" />
        <div className="toolbar-group">
          <button
            className="button button-secondary compact-button"
            type="button"
            onClick={() => setLive((current) => !current)}
            aria-pressed={live}
          >
            {live ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {live ? '暂停' : '继续'}
          </button>
          <button
            className="button button-secondary compact-button"
            type="button"
            onClick={() => { setAutoScroll((current) => !current) }}
            aria-pressed={autoScroll}
          >
            <ArrowDownToLine size={14} aria-hidden="true" />{autoScroll ? '跟随' : '固定'}
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="立即刷新"
            onClick={() => (mode === 'journal' ? void loadJournal() : void loadAudit())}
            disabled={loading}
          >
            <RefreshCw size={15} aria-hidden="true" className={loading ? 'spin' : ''} />
          </button>
        </div>
      </Toolbar>

      {mode === 'journal' ? (
        <div className="log-pane">
          <div className="log-scroll" ref={scrollRef} role="log" aria-label={`${host.label} journalctl 输出`}>
            {lines.length === 0 && <div className="log-line">{error || (loading ? '读取中…' : '暂无日志')}</div>}
            {lines.map((line, index) => (
              <div
                className={`log-line ${/\berror\b|emerg|failed/i.test(line) ? 'err' : /\bwarn(ing)?\b/i.test(line) ? 'warn' : ''}`}
                key={`${index}-${line.slice(0, 40)}`}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="audit-scroll">
          {audit.map((event, index) => (
            <div className="audit-row" key={`${event.at}-${index}`}>
              <span className={`a-dot ${event.outcome === 'allow' ? 'a-allow' : 'a-deny'}`} aria-hidden="true" />
              <span className="a-main">
                <strong>{event.action}</strong>
                <small>{event.actor}{event.detail ? ` · ${event.detail}` : ''}</small>
              </span>
              <time>{new Date(event.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
            </div>
          ))}
          {audit.length === 0 && <div className="term-empty" style={{ minBlockSize: 180 }}><span>暂无该主机的审计记录</span></div>}
        </div>
      )}
    </>
  )
}
