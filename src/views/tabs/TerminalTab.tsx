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
  disposeQueue: () => void
}

let seq = 0

/** 兼容局域网 HTTP 环境的剪贴板写入 */
async function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* 降级到 execCommand */
    }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } finally {
    document.body.removeChild(ta)
  }
  return ok
}

/** 创建带分块流控的输入队列，避免一次性写入大量换行文本塞爆远端 PTY 缓冲区 */
function createInputSender(ws: WebSocket) {
  const queue: string[] = []
  let timer: number | null = null
  const CHUNK = 512

  const flush = () => {
    timer = null
    if (ws.readyState !== WebSocket.OPEN) {
      queue.length = 0
      return
    }
    const next = queue.shift()
    if (next !== undefined) {
      ws.send(JSON.stringify({ type: 'input', data: next }))
    }
    if (queue.length > 0) {
      timer = window.setTimeout(flush, 12)
    }
  }

  const send = (data: string) => {
    if (ws.readyState !== WebSocket.OPEN) return
    if (data.length <= 256 && queue.length === 0 && timer === null) {
      ws.send(JSON.stringify({ type: 'input', data }))
      return
    }
    let i = 0
    while (i < data.length) {
      let end = Math.min(i + CHUNK, data.length)
      // 避免把 UTF-16 代理对从中间劈开
      if (end < data.length) {
        const code = data.charCodeAt(end - 1)
        if (code >= 0xd800 && code <= 0xdbff) end -= 1
      }
      queue.push(data.slice(i, end))
      i = end
    }
    if (timer === null) flush()
  }

  const dispose = () => {
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
    queue.length = 0
  }

  return { send, dispose }
}

export function TerminalTab({ host, notify, visible = true }: { host: HostSnapshot; notify: (message: string) => void; visible?: boolean }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [copiedHint, setCopiedHint] = useState(false)
  const [pasteCaptureOpen, setPasteCaptureOpen] = useState(false)
  const mountRef = useRef<HTMLDivElement>(null)
  const pasteBoxRef = useRef<HTMLTextAreaElement>(null)
  const sessionsRef = useRef<Session[]>([])
  const copyTimerRef = useRef<number | null>(null)

  sessionsRef.current = sessions
  const active = sessions.find((session) => session.id === activeId) ?? null

  const flashCopied = () => {
    setCopiedHint(true)
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => setCopiedHint(false), 1400)
  }

  // 切回终端标签时重新适配容器尺寸并聚焦
  useEffect(() => {
    if (!visible || !active) return
    const id = requestAnimationFrame(() => {
      active.fit.fit()
      if (active.status === 'ready') {
        active.ws.send(JSON.stringify({ type: 'resize', data: `${active.term.cols}:${active.term.rows}` }))
      }
      active.term.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [visible, active])

  // 挂载当前会话到 DOM，并绑定选定即复制与右键即粘贴
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

    const onMouseUp = () => {
      requestAnimationFrame(() => {
        if (!active.term.hasSelection()) return
        const text = active.term.getSelection()
        if (!text) return
        void writeClipboard(text).then((ok) => {
          if (ok) flashCopied()
          active.term.focus()
        })
      })
    }

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      if (active.status !== 'ready') return
      if (navigator.clipboard?.readText) {
        navigator.clipboard
          .readText()
          .then((text) => {
            if (text) {
              active.term.paste(text)
              active.term.clearSelection()
            }
            active.term.focus()
          })
          .catch(() => {
            setPasteCaptureOpen(true)
            requestAnimationFrame(() => pasteBoxRef.current?.focus())
          })
      } else {
        setPasteCaptureOpen(true)
        requestAnimationFrame(() => pasteBoxRef.current?.focus())
      }
    }

    node.addEventListener('mouseup', onMouseUp)
    node.addEventListener('contextmenu', onContextMenu)

    const observer = new ResizeObserver(() => {
      if (active.status !== 'ready') return
      active.fit.fit()
      active.ws.send(JSON.stringify({ type: 'resize', data: `${active.term.cols}:${active.term.rows}` }))
    })
    observer.observe(node)
    return () => {
      node.removeEventListener('mouseup', onMouseUp)
      node.removeEventListener('contextmenu', onContextMenu)
      observer.disconnect()
    }
  }, [active])

  // 切换主机或卸载时清理所有会话
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
      for (const session of sessionsRef.current) {
        session.disposeQueue()
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

    // 接管 Ctrl+C（有选区时复制而非中断）/ Ctrl+V（交给浏览器原生 paste）
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      const mod = event.ctrlKey || event.metaKey
      if (!mod) return true
      const key = event.key.toLowerCase()
      if (key === 'c' && (term.hasSelection() || event.shiftKey)) {
        const text = term.getSelection()
        if (text) {
          void writeClipboard(text).then((ok) => {
            if (ok) flashCopied()
          })
          term.clearSelection()
        }
        return false
      }
      if (key === 'v') {
        return false
      }
      return true
    })

    const ws = terminalWebSocket(host.hostId)
    const sender = createInputSender(ws)
    const session: Session = {
      id: `s${++seq}`,
      hostId: host.hostId,
      label: host.label,
      ws,
      term,
      fit,
      status: 'connecting',
      openedAt: Date.now(),
      disposeQueue: sender.dispose,
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
      sender.dispose()
      session.status = 'closed'
      setSessions((current) => [...current])
      term.write('\r\n\x1b[38;2;245;185;66msession closed\x1b[0m\r\n')
    }
    ws.onerror = () => term.write('\r\n\x1b[38;2;244;119;107mwebsocket error\x1b[0m\r\n')
    term.onData((data) => {
      sender.send(data)
    })

    setSessions((current) => [...current, session])
    setActiveId(session.id)
  }

  function disconnect() {
    if (!active) return
    active.disposeQueue()
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
      target.disposeQueue()
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

      <div className="relative flex min-h-0 flex-1 flex-col bg-term">
        {active ? (
          <>
            <div className="min-h-0 flex-1 overflow-hidden" ref={mountRef} />
            {pasteCaptureOpen && (
              <div className="absolute right-4 bottom-10 z-20 flex items-center gap-2 rounded-lg border border-white/15 bg-zinc-900/95 px-3 py-2 text-xs text-zinc-200 shadow-xl">
                <span>请按 <kbd className="rounded border border-white/20 px-1 font-mono">Ctrl+V</kbd> 粘贴</span>
                <textarea
                  ref={pasteBoxRef}
                  rows={1}
                  aria-label="粘贴捕获区"
                  className="h-5 w-20 resize-none rounded border border-white/20 bg-black/40 px-1.5 font-mono text-xs text-zinc-100 outline-none"
                  onPaste={(event) => {
                    event.preventDefault()
                    const text = event.clipboardData.getData('text')
                    if (text) {
                      active.term.paste(text)
                      active.term.clearSelection()
                    }
                    setPasteCaptureOpen(false)
                    active.term.focus()
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setPasteCaptureOpen(false)
                      active.term.focus()
                    }
                  }}
                  onBlur={() => setPasteCaptureOpen(false)}
                />
              </div>
            )}
            <div className="flex shrink-0 items-center gap-4 border-t border-white/10 bg-black/20 px-4 py-1.5 font-mono text-xs text-zinc-400">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className={cn('size-1.5 rounded-full', active.status === 'ready' ? 'bg-[#8fd5bf]' : active.status === 'connecting' ? 'bg-amber-400' : 'bg-red-400')} />
                {active.status === 'ready' ? '已连接' : active.status === 'connecting' ? '连接中' : '已断开'}
              </span>
              <span>{host.hostId}</span>
              <span>{active.term.cols}×{active.term.rows}</span>
              {copiedHint && <span className="text-[#8fd5bf]">已复制</span>}
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
