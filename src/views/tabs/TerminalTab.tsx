import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Eraser, Plus, Power, Terminal as TerminalIcon } from 'lucide-react'
import { terminalWebSocket, type HostSnapshot } from '../../api'
import { Toolbar } from '../../components/Toolbar'

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
      fontSize: 12.5,
      fontFamily: "ui-monospace, 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
      lineHeight: 1.35,
      allowProposedApi: true,
      theme: {
        background: '#0a1210',
        foreground: '#b9c6c0',
        cursor: '#5fd4c4',
        cursorAccent: '#0a1210',
        selectionBackground: 'rgba(95, 212, 196, 0.24)',
        black: '#0a1210',
        red: '#f4776b',
        green: '#6ee7a8',
        yellow: '#f5b942',
        blue: '#7fb3f5',
        magenta: '#c79bf0',
        cyan: '#5fd4c4',
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
        <div className="toolbar-group">
          <button className="button button-primary compact-button" type="button" onClick={open}>
            <Plus size={14} aria-hidden="true" />新建会话
          </button>
        </div>
        <span className="toolbar-sep" aria-hidden="true" />
        <div className="toolbar-group">
          <button className="button button-secondary compact-button" type="button" onClick={disconnect} disabled={!active || active.status !== 'ready'}>
            <Power size={14} aria-hidden="true" />断开
          </button>
          <button className="button button-secondary compact-button" type="button" onClick={clear} disabled={!active}>
            <Eraser size={14} aria-hidden="true" />清屏
          </button>
        </div>
        {sessions.length > 1 && (
          <>
            <span className="toolbar-sep" aria-hidden="true" />
            <div className="term-sessions" role="group" aria-label="切换会话">
              {sessions.map((session, index) => (
                <button
                  key={session.id}
                  type="button"
                  aria-pressed={session.id === activeId}
                  onClick={() => setActiveId(session.id)}
                >
                  #{index + 1}
                </button>
              ))}
            </div>
          </>
        )}
      </Toolbar>

      <div className="term-wrap">
        {active ? (
          <>
            <div className="term-mount" ref={mountRef} />
            <div className="term-status">
              <span>
                <span className={`term-dot ${active.status}`} aria-hidden="true" />
                {active.status === 'ready' ? '已连接' : active.status === 'connecting' ? '连接中' : '已断开'}
              </span>
              <span>{host.hostId}</span>
              <span>{active.term.cols}×{active.term.rows}</span>
              <button className="button button-ghost compact-button" type="button" style={{ marginInlineStart: 'auto' }} onClick={() => close(active.id)}>
                关闭会话
              </button>
            </div>
          </>
        ) : (
          <div className="term-empty">
            <TerminalIcon size={22} aria-hidden="true" />
            <span>尚未建立会话</span>
            <span>点击「新建会话」连接 <kbd>{host.hostId}</kbd></span>
          </div>
        )}
      </div>
    </>
  )
}
