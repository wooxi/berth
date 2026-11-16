import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronRight, KeyRound, RefreshCw, Search, Server, Terminal, Folder, Box, ScrollText } from 'lucide-react'
import type { HostSnapshot } from '../api'

export type PaletteTarget = { hostId: string; tab: 'terminal' | 'files' | 'containers' | 'logs' } | { view: 'overview' | 'hosts' | 'access' }

type PaletteItem = {
  id: string
  group: string
  label: string
  hint?: string
  icon: typeof Server
  run: () => void
}

export function CommandPalette({
  open,
  hosts,
  onClose,
  onNavigate,
  onRefresh,
  onLogout,
}: {
  open: boolean
  hosts: HostSnapshot[]
  onClose: () => void
  onNavigate: (target: PaletteTarget) => void
  onRefresh: () => void
  onLogout: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)

  const items = useMemo<PaletteItem[]>(() => {
    const hostItems: PaletteItem[] = hosts.flatMap((host) => [
      {
        id: `${host.hostId}-console`,
        group: '主机',
        label: host.label,
        hint: `${host.address} · 打开工作台`,
        icon: Server,
        run: () => onNavigate({ hostId: host.hostId, tab: 'terminal' }),
      },
      {
        id: `${host.hostId}-terminal`,
        group: '主机',
        label: `${host.label} · 终端`,
        hint: host.address,
        icon: Terminal,
        run: () => onNavigate({ hostId: host.hostId, tab: 'terminal' }),
      },
      {
        id: `${host.hostId}-files`,
        group: '主机',
        label: `${host.label} · 文件`,
        hint: host.address,
        icon: Folder,
        run: () => onNavigate({ hostId: host.hostId, tab: 'files' }),
      },
      {
        id: `${host.hostId}-containers`,
        group: '主机',
        label: `${host.label} · 容器`,
        hint: host.address,
        icon: Box,
        run: () => onNavigate({ hostId: host.hostId, tab: 'containers' }),
      },
      {
        id: `${host.hostId}-logs`,
        group: '主机',
        label: `${host.label} · 日志`,
        hint: host.address,
        icon: ScrollText,
        run: () => onNavigate({ hostId: host.hostId, tab: 'logs' }),
      },
    ])

    return [
      ...hostItems,
      { id: 'go-overview', group: '导航', label: '概览', icon: Server, run: () => onNavigate({ view: 'overview' }) },
      { id: 'go-hosts', group: '导航', label: '主机列表', icon: Server, run: () => onNavigate({ view: 'hosts' }) },
      { id: 'go-access', group: '导航', label: '凭据与权限', icon: KeyRound, run: () => onNavigate({ view: 'access' }) },
      { id: 'act-refresh', group: '操作', label: '刷新主机数据', icon: RefreshCw, run: () => { onRefresh(); onClose() } },
      { id: 'act-logout', group: '操作', label: '退出登录', icon: ChevronRight, run: () => { onLogout(); onClose() } },
    ]
  }, [hosts, onNavigate, onRefresh, onClose, onLogout])

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    if (!q) return items
    return items.filter((item) => `${item.label} ${item.hint ?? ''} ${item.group}`.toLocaleLowerCase().includes(q))
  }, [items, query])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      setQuery('')
      setCursor(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    setCursor(0)
  }, [query])

  function activate(index: number) {
    const item = filtered[index]
    if (!item) return
    item.run()
    onClose()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((current) => (filtered.length ? (current + 1) % filtered.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((current) => (filtered.length ? (current - 1 + filtered.length) % filtered.length : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      activate(cursor)
    }
  }

  let lastGroup = ''

  return (
    <dialog ref={dialogRef} className="palette" aria-label="命令面板" onClose={onClose}>
      <div className="palette-input-row">
        <Search size={15} aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={filtered[cursor] ? `${listId}-${filtered[cursor].id}` : undefined}
          placeholder="搜索主机、跳转或执行命令…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <kbd>ESC</kbd>
      </div>
      <div className="palette-list" id={listId} role="listbox" aria-label="命令结果">
        {filtered.length === 0 && <p className="palette-empty">没有匹配项</p>}
        {filtered.map((item, index) => {
          const Icon = item.icon
          const showGroup = item.group !== lastGroup
          lastGroup = item.group
          return (
            <div key={item.id}>
              {showGroup && <p className="palette-group-label">{item.group}</p>}
              <button
                type="button"
                id={`${listId}-${item.id}`}
                role="option"
                aria-selected={index === cursor}
                className="palette-item"
                onMouseEnter={() => setCursor(index)}
                onClick={() => activate(index)}
              >
                <Icon size={15} aria-hidden="true" />
                <span className="p-main">
                  <span>{item.label}</span>
                  {item.hint && <small>{item.hint}</small>}
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </dialog>
  )
}
