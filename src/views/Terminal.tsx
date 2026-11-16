import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { ChevronDown, Plus, X } from 'lucide-react'
import { terminalWebSocket, type HostSnapshot } from '../api'

type TerminalSession = {
  sessionId: string
  hostId: string
  label: string
  ws: WebSocket
  terminal: XTerm
  fit: FitAddon
  status: 'connecting' | 'ready' | 'closed'
}

let sessionCounter = 0

function createSession(host: HostSnapshot): TerminalSession {
  const sessionId = `tty-${++sessionCounter}`
  const terminal = new XTerm({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "ui-monospace, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    theme: {
      background: '#18221c',
      foreground: '#a8b7aa',
      cursor: '#c4ec6a',
      selectionBackground: '#33513f',
    },
  })
  const fit = new FitAddon()
  terminal.loadAddon(fit)

  const ws = terminalWebSocket(host.hostId)
  const session: TerminalSession = { sessionId, hostId: host.hostId, label: host.label, ws, terminal, fit, status: 'connecting' }

  ws.onopen = () => terminal.writeln(`\x1b[32mconnecting ${host.label} (${host.address}) …\x1b[0m`)
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data as string) as { type: string; data?: string; message?: string; host?: string }
    if (message.type === 'output' && typeof message.data === 'string') terminal.write(message.data)
    if (message.type === 'ready') {
      session.status = 'ready'
      terminal.clear()
      terminal.writeln(`\x1b[32mconnected: ${message.host}\x1b[0m`)
      fit.fit()
      terminal.focus()
    }
    if (message.type === 'error') {
      terminal.writeln(`\x1b[31m${message.message ?? 'connection error'}\x1b[0m`)
    }
  }
  ws.onclose = () => {
    session.status = 'closed'
    terminal.writeln('\r\n\x1b[33msession closed\x1b[0m')
  }
  ws.onerror = () => terminal.writeln('\x1b[31mwebsocket error\x1b[0m')

  terminal.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }))
  })

  return session
}

export function TerminalView({ hosts, notify }: { hosts: HostSnapshot[]; notify: (message: string) => void }) {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hostId, setHostId] = useState(hosts[0]?.hostId ?? '')
  const paneRef = useRef<HTMLDivElement>(null)

  const active = sessions.find((session) => session.sessionId === activeId) ?? null

  useEffect(() => {
    if (!active) return
    const pane = paneRef.current
    if (!pane) return
    pane.innerHTML = ''
    active.terminal.open(pane)
    active.fit.fit()
    const resize = () => {
      if (active.status === 'ready') {
        active.fit.fit()
        active.ws.send(JSON.stringify({ type: 'resize', data: `${active.terminal.cols}:${active.terminal.rows}` }))
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(pane)
    return () => observer.disconnect()
  }, [active])

  function openSession() {
    const host = hosts.find((item) => item.hostId === hostId)
    if (!host) return
    const session = createSession(host)
    setSessions((current) => [...current, session])
    setActiveId(session.sessionId)
  }

  function closeSession(id: string) {
    const session = sessions.find((item) => item.sessionId === id)
    if (session) {
      session.ws.close()
      session.terminal.dispose()
    }
    setSessions((current) => current.filter((item) => item.sessionId !== id))
    setActiveId((current) => (current === id ? null : current))
    notify('终端会话已关闭')
  }

  return (
    <section className="terminal-panel" aria-label="SSH 终端">
      <div className="terminal-topbar">
        <div className="terminal-tabs" role="tablist" aria-label="终端会话">
          {sessions.map((session) => (
            <button
              key={session.sessionId}
              type="button"
              role="tab"
              aria-selected={session.sessionId === activeId}
              className={`terminal-tab ${session.sessionId === activeId ? 'is-active' : ''}`}
              onClick={() => setActiveId(session.sessionId)}
            >
              <span className="terminal-live-dot" data-state={session.status} />
              <span>{session.label}</span>
              <span className="terminal-user">{session.hostId}</span>
              <span role="button" aria-label={`关闭 ${session.label} 会话`} className="terminal-tab-close" onClick={(event) => { event.stopPropagation(); closeSession(session.sessionId) }}>
                <X size={13} aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
        <div className="terminal-toolbar">
          <label className="host-select-label terminal-host-select">
            <span className="sr-only">选择要连接的主机</span>
            <ChevronDown size={13} aria-hidden="true" />
            <select value={hostId} onChange={(event) => setHostId(event.currentTarget.value)}>
              {hosts.map((host) => <option key={host.hostId} value={host.hostId}>{host.label}</option>)}
            </select>
          </label>
          <button className="button button-secondary compact-button" type="button" onClick={openSession} disabled={!hostId}>
            <Plus size={15} aria-hidden="true" />连接
          </button>
        </div>
      </div>
      <div className="terminal-body-pane">
        {active
          ? <div ref={paneRef} className="terminal-mount" />
          : <div className="terminal-placeholder"><p>选择主机后点击「连接」</p></div>}
      </div>
    </section>
  )
}
