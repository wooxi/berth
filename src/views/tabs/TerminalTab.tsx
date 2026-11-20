import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Eraser, Plus, Power, Terminal as TerminalIcon } from 'lucide-react'
import { terminalWebSocket, type HostSnapshot } from '../../api'
import { Toolbar, ToolbarSep } from '@/components/common'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Session = {
  id: string
  hostId: string
  label: string
  ws: WebSocket
  term: XTerm
  fit: FitAddon
  status: 'connecting' | 'ready' | 'closed'
  openedAt: number
}

let seq = 0

export function TerminalTab({ host, notify }: { host: HostSnapshot; notify: (message: string) => void }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const sessionsRef = useRef<Session[]>([])

  sessionsRef.current = sessions
  const active = sessions.find((session) => session.id === activeId) ?? null

  // Mount xterm into the DOM node only for the active session.
  useEffect(() => {
    if (!active) return
    const node = mountRef.current
    if (!node) return
    node.replaceChildren()
    active.term.open(node)
    active.fit.fit()
    if (active.status === 'ready') {
      active.ws.send(JSON.stringify({ type: 'resize', data: `${active.term.cols}:${active.term.rows}` }))
    }
    active.term.focus()

    const observer = new ResizeObserver(() => {
      if (active.status !== 'ready') return
      active.fit.fit()
      active.ws.send(JSON.stringify({ type: 'resize', data: `${active.term.cols}:${active.term.rows}` }))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [active])

  // Reconnect cleanly when the selected host changes.
  useEffect(() => {
    return () => {
      for (const session of sessionsRef.current) {
        session.ws.close()
        session.term.dispose()
      }
    }
  }, [host.hostId])

  function open() {
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "ui-monospace, 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
      lineHeight: 1.35,
      allowProposedApi: true,
      theme: {
        background: '#0a0a09',
        foreground: '#cfcdc7',
        cursor: '#8fd5bf',
        cursorAccent: '#0a0a09',
        selectionBackground: 'rgba(143, 213, 191, 0.24)',
        black: '#0a0a09',
        red: '#f4776b',
        green: '#6ee7a8',
        yellow: '#f5b942',
        blue: '#7fb3f5',
        magenta: '#c79bf0',
        cyan: '#8fd5bf',
        white: '#e8eeeb',
        brightBlack: '#6d7c76',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)

    const ws = terminalWebSocket(host.hostId)
    const session: Session = {
      id: `s${++seq}`,
      hostId: host.hostId,
      label: host.label,
      ws,
      term,
      fit,
      status: 'connecting',
      openedAt: Date.now(),
    }

    ws.onmessage = (event) => {
      let message: { type?: string; data?: string; message?: string; host?: string }
      try {
        message = JSON.parse(event.data as string)
      } catch {
        return
      }
      if (message.type === 'output' && typeof message.data === 'string') term.write(message.data)
      if (message.type === 'ready') {
        session.status = 'ready'
        setSessions((current) => [...current])
        term.write(`\x1b[38;2;110;231;168m✓ connected to ${message.host}\x1b[0m\r\n`)
      }
      if (message.type === 'error') {
        term.write(`\r\n\x1b[38;2;244;119;107m${message.message ?? 'connection error'}\x1b[0m\r\n`)
      }
    }
    ws.onclose = () => {
      session.status = 'closed'
      setSessions((current) => [...current])
      term.write('\r\n\x1b[38;2;245;185;66msession closed\x1b[0m\r\n')
    }
    ws.onerror = () => term.write('\r\n\x1b[38;2;244;119;107mwebsocket error\x1b[0m\r\n')
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }))
    })

    setSessions((current) => [...current, session])
    setActiveId(session.id)
  }

  function disconnect() {
    if (!active) return
    active.ws.close()
    active.term.write('\r\n\x1b[38;2;245;185;66mdisconnected\x1b[0m\r\n')
    notify('已断开终端会话')
  }

  function clear() {
    active?.term.clear()
  }

  function close(id: string) {
    const target = sessions.find((session) => session.id === id)
    if (target) {
      target.ws.close()
      target.term.dispose()
    }
    setSessions((current) => current.filter((session) => session.id !== id))
    setActiveId((current) => (current === id ? null : current))
  }

  const readyCount = sessions.filter((session) => session.status === 'ready').length


  return (
    <>
      <Toolbar info={`${readyCount} 个活动会话 · ${host.address}`}>
        <Button size="sm" onClick={open}><Plus />新建会话</Button>
        <ToolbarSep />
        <Button variant="secondary" size="sm" onClick={disconnect} disabled={!active || active.status !== 'ready'}><Power />断开</Button>
        <Button variant="secondary" size="sm" onClick={clear} disabled={!active}><Eraser />清屏</Button>
        {sessions.length > 1 && (
          <>
            <ToolbarSep />
            <div role="group" aria-label="切换会话" className="flex gap-1">
              {sessions.map((session, index) => (
                <Button key={session.id} variant={session.id === activeId ? 'default' : 'secondary'} size="xs" aria-pressed={session.id === activeId} onClick={() => setActiveId(session.id)}>
                  #{index + 1}
                </Button>
              ))}
            </div>
          </>
        )}
      </Toolbar>

      <div className="flex min-h-0 flex-1 flex-col bg-term">
        {active ? (
          <>
            <div className="min-h-0 flex-1 overflow-hidden" ref={mountRef} />
            <div className="flex shrink-0 items-center gap-4 border-t border-white/10 bg-black/20 px-4 py-1.5 font-mono text-xs text-zinc-400">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className={cn('size-1.5 rounded-full', active.status === 'ready' ? 'bg-[#8fd5bf]' : active.status === 'connecting' ? 'bg-amber-400' : 'bg-red-400')} />
                {active.status === 'ready' ? '已连接' : active.status === 'connecting' ? '连接中' : '已断开'}
              </span>
              <span>{host.hostId}</span>
              <span>{active.term.cols}×{active.term.rows}</span>
              <Button variant="ghost" size="xs" className="ml-auto text-zinc-400 hover:bg-white/10 hover:text-zinc-100" onClick={() => close(active.id)}>关闭会话</Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-zinc-400">
            <TerminalIcon className="size-6" aria-hidden="true" />
            <span>尚未建立会话</span>
            <span className="text-xs">点击「新建会话」连接 <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-mono">{host.hostId}</kbd></span>
            <Button size="sm" onClick={open}><Plus />新建会话</Button>
          </div>
        )}
      </div>
    </>
  )
}