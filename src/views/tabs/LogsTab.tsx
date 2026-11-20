import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, Pause, Play, RefreshCw, ScrollText } from 'lucide-react'
import { api, type AuditEvent, type HostSnapshot } from '../../api'
import { EmptyState, Toolbar, ToolbarSep } from '@/components/common'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
        <div role="group" aria-label="日志来源" className="flex gap-1">
          <Button variant={mode === 'journal' ? 'default' : 'secondary'} size="sm" aria-pressed={mode === 'journal'} disabled={!host.systemd} onClick={() => setMode('journal')}>
            <ScrollText />系统日志
          </Button>
          <Button variant={mode === 'audit' ? 'default' : 'secondary'} size="sm" aria-pressed={mode === 'audit'} onClick={() => setMode('audit')}>
            <ScrollText />操作审计
          </Button>
        </div>

        {mode === 'journal' && (
          <>
            <ToolbarSep />
            <label className="sr-only" htmlFor={`unit-${host.hostId}`}>服务单元</label>
            <select
              id={`unit-${host.hostId}`}
              className="h-8 rounded-md border border-input bg-card px-2.5 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              value={unit}
              onChange={(event) => setUnit(event.currentTarget.value)}
            >
              {UNITS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </>
        )}

        <ToolbarSep />
        <Button variant={live ? 'default' : 'secondary'} size="sm" onClick={() => setLive((current) => !current)} aria-pressed={live}>
          {live ? <Pause /> : <Play />}{live ? '暂停' : '继续'}
        </Button>
        <Button variant={autoScroll ? 'default' : 'secondary'} size="sm" onClick={() => setAutoScroll((current) => !current)} aria-pressed={autoScroll}>
          <ArrowDownToLine />{autoScroll ? '跟随' : '固定'}
        </Button>
        <Button variant="ghost" size="icon" aria-label="立即刷新" onClick={() => (mode === 'journal' ? void loadJournal() : void loadAudit())} disabled={loading}>
          <RefreshCw className={loading ? 'spin' : ''} />
        </Button>
      </Toolbar>

      {mode === 'journal' ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-term py-2 font-mono text-[12.5px] leading-6 text-zinc-300" ref={scrollRef} role="log" aria-label={`${host.label} journalctl 输出`}>
          {lines.length === 0 && <div className="px-5 text-zinc-500">{error || (loading ? '读取中…' : '暂无日志')}</div>}
          {lines.map((line, index) => {
            const level = /\berror\b|emerg|failed/i.test(line) ? 'err' : /\bwarn(ing)?\b/i.test(line) ? 'warn' : ''
            return (
              <div
                key={`${index}-${line.slice(0, 40)}`}
                className={cn('px-5 break-all whitespace-pre-wrap hover:bg-white/5', level === 'err' && 'bg-red-500/10 text-red-300', level === 'warn' && 'text-amber-300')}
              >
                {line}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul className="divide-y divide-border">
            {audit.map((event, index) => (
              <li className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-2.5" key={`${event.at}-${index}`}>
                <span aria-hidden="true" className={cn('size-2 rounded-full', event.outcome === 'allow' ? 'bg-primary' : 'bg-destructive')} />
                <span className="min-w-0 leading-tight">
                  <b className="block text-[13px] font-medium">{event.action}</b>
                  <small className="text-xs text-muted-foreground">{event.actor}{event.detail ? ` · ${event.detail}` : ''}</small>
                </span>
                <time className="font-mono text-xs text-muted-foreground">{new Date(event.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
              </li>
            ))}
          </ul>
          {audit.length === 0 && <EmptyState icon={ScrollText} className="min-h-48">暂无该主机的审计记录</EmptyState>}
        </div>
      )}
    </>
  )
}