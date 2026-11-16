import { useEffect, useState } from 'react'
import { ChevronRight, Download, FileText, Folder, HardDrive, LockKeyhole } from 'lucide-react'
import { api, type FileEntry, type HostSnapshot } from '../api'

export function FilesView({ hosts, notify }: { hosts: HostSnapshot[]; notify: (message: string) => void }) {
  const [hostId, setHostId] = useState(hosts[0]?.hostId ?? '')
  const [path, setPath] = useState('/root')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [selected, setSelected] = useState<FileEntry | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load(target: string) {
    if (!hostId) return
    setLoading(true)
    setError('')
    try {
      const result = await api.getFiles(hostId, target)
      setEntries(result.entries)
      setPath(result.path)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load('/root')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId])

  const segments = path.split('/').filter(Boolean)

  return (
    <section className="panel file-panel" aria-label="远程文件管理">
      <div className="file-toolbar">
        <div className="breadcrumbs" aria-label="当前目录">
          <button type="button" onClick={() => load('/')} aria-label="根目录"><HardDrive size={15} aria-hidden="true" /></button>
          {segments.map((segment, index) => (
            <span className="crumb-segment" key={`${segment}-${index}`}>
              <ChevronRight size={13} aria-hidden="true" />
              <button type="button" onClick={() => load(`/${segments.slice(0, index + 1).join('/')}`)}>{segment}</button>
            </span>
          ))}
        </div>
        <div className="file-actions">
          <label className="host-select-label">
            <span className="sr-only">选择目标主机</span>
            <select value={hostId} onChange={(event) => setHostId(event.currentTarget.value)}>
              {hosts.map((host) => <option key={host.hostId} value={host.hostId}>{host.label}</option>)}
            </select>
          </label>
          <button className="icon-button" type="button" aria-label="下载选中文件" disabled={!selected || selected.type !== 'file'} onClick={() => notify('下载功能即将开放')}><Download size={16} aria-hidden="true" /></button>
        </div>
      </div>

      <div className="file-layout">
        <div className="file-list-wrap" role="region" aria-label="文件列表" tabIndex={0}>
          <table className="file-table">
            <caption className="sr-only">{hostId} 上 {path} 的文件列表</caption>
            <thead><tr><th scope="col">名称</th><th scope="col">大小</th><th scope="col">修改时间</th><th scope="col">权限</th></tr></thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.path} className={selected?.path === entry.path ? 'is-selected' : ''}>
                  <td>
                    <button
                      className="file-entry-button"
                      type="button"
                      onClick={() => {
                        setSelected(entry)
                        if (entry.type === 'directory') load(entry.path)
                      }}
                    >
                      <span className={`file-name-icon ${entry.type === 'directory' ? 'folder-icon' : 'document-icon'}`}>
                        {entry.type === 'directory' ? <Folder size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
                      </span>
                      <span className="file-name">{entry.name}</span>
                    </button>
                  </td>
                  <td>{entry.type === 'file' ? formatSize(entry.size) : '—'}</td>
                  <td>{entry.modified}</td>
                  <td>{entry.owner}</td>
                </tr>
              ))}
              {!loading && entries.length === 0 && <tr><td className="empty-table" colSpan={4}>{error || '目录为空'}</td></tr>}
            </tbody>
          </table>
        </div>
        <aside className="file-detail-pane" aria-label="选中条目详情">
          <div className="file-preview-icon">{selected?.type === 'directory' ? <Folder size={26} aria-hidden="true" /> : <FileText size={26} aria-hidden="true" />}</div>
          <p className="eyebrow">SELECTED ITEM</p>
          <h2>{selected?.name ?? '—'}</h2>
          <p className="file-path">{selected?.path ?? path}</p>
          <div className="file-detail-list">
            <span>主机<strong>{hostId}</strong></span>
            <span>大小<strong>{selected ? (selected.type === 'file' ? formatSize(selected.size) : '—') : '—'}</strong></span>
            <span>权限<strong>{selected?.mode ?? '—'}</strong></span>
            <span>所有者<strong>{selected?.owner ?? '—'}</strong></span>
          </div>
          <div className="secure-note"><LockKeyhole size={15} aria-hidden="true" /><span>当前为只读浏览；编辑与传输待后续开放。</span></div>
        </aside>
      </div>
      <div className="file-footer"><span>{entries.length} 个项目{loading ? ' · 读取中…' : ''}</span><span><LockKeyhole size={13} aria-hidden="true" />只读模式</span></div>
    </section>
  )
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}
