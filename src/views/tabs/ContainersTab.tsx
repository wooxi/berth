import { useCallback, useEffect, useState } from 'react'
import { Box, LockKeyhole, MoreHorizontal, RefreshCw } from 'lucide-react'
import { api, type ContainerInfo, type HostSnapshot } from '../../api'
import { Toolbar } from '../../components/Toolbar'

export function ContainersTab({ host, notify }: { host: HostSnapshot; notify: (message: string) => void }) {
  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.getContainers(host.hostId)
      setContainers(result.containers)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取失败')
    } finally {
      setLoading(false)
    }
  }, [host.hostId])

  useEffect(() => {
    if (host.runtime === 'none') return
    void load()
  }, [load, host.runtime])

  if (host.runtime === 'none') {
    return (
      <>
        <Toolbar info="该主机未启用容器运行时" />
        <div className="term-empty">
          <Box size={22} aria-hidden="true" />
          <span>{host.label} 上没有 Docker / Podman</span>
        </div>
      </>
    )
  }

  const running = containers.filter((item) => item.state === 'running').length
  const visible = containers.filter((item) => filter === 'all' || (filter === 'running' ? item.state === 'running' : item.state !== 'running'))

  return (
    <>
      <Toolbar info={`${running} 运行中 / ${containers.length} 总计`}>
        <div className="toolbar-group">
          <button className="button button-secondary compact-button" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} aria-hidden="true" className={loading ? 'spin' : ''} />刷新
          </button>
        </div>
        <span className="toolbar-sep" aria-hidden="true" />
        <div className="toolbar-group" role="group" aria-label="容器筛选">
          {([['all', '全部'], ['running', '运行中'], ['stopped', '已停止']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filter === id ? 'button button-primary compact-button' : 'button button-secondary compact-button'}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </Toolbar>

      <div className="ctr-list">
        {visible.map((container) => (
          <div className="ctr-row" key={container.id}>
            <span className={`ctr-glyph ${container.state === 'running' ? 'up' : 'down'}`} aria-hidden="true">
              <Box size={15} />
            </span>
            <div className="ctr-name">
              <b>{container.name}</b>
              <small>{container.image}</small>
            </div>
            <div className="ctr-meta">
              <span>{container.state === 'running' ? '运行中' : '已停止'}</span>
              <small>{container.status}</small>
            </div>
            <div className="ctr-ports">{container.ports || '—'}</div>
            <span className={`status-badge status-${container.state === 'running' ? 'online' : 'offline'}`} style={{ justifySelf: 'start' }}>
              <span className="status-dot" />{container.state === 'running' ? 'UP' : 'DOWN'}
            </span>
            <button
              className="icon-button"
              type="button"
              aria-label={`${container.name} 操作（只读）`}
              onClick={() => notify('容器启停需要写权限，当前仅只读')}
            >
              <MoreHorizontal size={16} aria-hidden="true" />
            </button>
          </div>
        ))}

        {!loading && visible.length === 0 && (
          <div className="term-empty" style={{ minBlockSize: 200 }}>
            <Box size={20} aria-hidden="true" />
            <span>{error || '没有符合条件的容器'}</span>
          </div>
        )}
      </div>

      <div className="term-status">
        <span><LockKeyhole size={12} aria-hidden="true" />只读视图</span>
        <span>{host.hostId}</span>
        <span>{host.runtime}</span>
      </div>
    </>
  )
}
