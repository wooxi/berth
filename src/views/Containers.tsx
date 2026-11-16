import { useEffect, useMemo, useState } from 'react'
import { Box, LockKeyhole, MoreHorizontal, RefreshCw } from 'lucide-react'
import { api, type ContainerInfo, type HostSnapshot } from '../api'

export function ContainersView({ hosts, notify }: { hosts: HostSnapshot[]; notify: (message: string) => void }) {
  const containerHosts = useMemo(() => hosts.filter((host) => host.runtime !== 'none'), [hosts])
  const [hostId, setHostId] = useState(containerHosts[0]?.hostId ?? '')
  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    if (!hostId) return
    setLoading(true)
    setError('')
    try {
      const result = await api.getContainers(hostId)
      setContainers(result.containers)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId])

  const running = containers.filter((item) => item.state === 'running').length

  return (
    <section className="panel container-panel" aria-label="容器实例">
      <div className="panel-header container-panel-header">
        <div>
          <div className="panel-title-line"><h2>容器实例</h2><span className="subtle-count">{running} RUNNING / {containers.length} TOTAL</span></div>
          <p>{error || 'Docker 工作负载 · 每 30 秒刷新'}</p>
        </div>
        <div className="event-filters">
          <label className="host-select-label">
            <span className="sr-only">选择主机</span>
            <select value={hostId} onChange={(event) => setHostId(event.currentTarget.value)}>
              {containerHosts.map((host) => <option key={host.hostId} value={host.hostId}>{host.label}</option>)}
            </select>
          </label>
          <button className="icon-button" type="button" aria-label="刷新容器列表" onClick={load} disabled={loading}><RefreshCw size={15} aria-hidden="true" className={loading ? 'spin' : ''} /></button>
        </div>
      </div>
      <div className="container-list">
        {containers.map((container) => (
          <article className="container-row" key={container.id}>
            <span className={`container-glyph ${container.state === 'running' ? 'container-running' : 'container-stopped'}`}><Box size={18} aria-hidden="true" /></span>
            <div className="container-name"><strong>{container.name}</strong><span>{container.image}</span></div>
            <div className="container-host"><span className="runtime-tag">{container.state}</span><span>{container.status}</span></div>
            <div className="container-port"><span>PORTS</span><strong>{container.ports || '—'}</strong></div>
            <span className={`container-state state-${container.state === 'running' ? 'running' : 'stopped'}`}><span />{container.state === 'running' ? '运行中' : '已停止'}</span>
            <button className="icon-button" type="button" aria-label={`${container.name} 管理操作（只读模式）`} onClick={() => notify('容器操作将在写权限开放后可用')}><MoreHorizontal size={17} aria-hidden="true" /></button>
          </article>
        ))}
        {!loading && containers.length === 0 && <div className="empty-state"><Box size={22} aria-hidden="true" /><span>{error || '没有容器'}</span></div>}
      </div>
      <div className="container-footer"><span><LockKeyhole size={13} aria-hidden="true" />只读视图 · 启停操作需写权限</span><button className="text-action" type="button" onClick={load}>刷新 <RefreshCw size={14} aria-hidden="true" /></button></div>
    </section>
  )
}
