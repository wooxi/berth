import { useCallback, useEffect, useState } from 'react'
import { ArrowUp, ChevronRight, Download, FileText, Folder, HardDrive, LockKeyhole, RefreshCw } from 'lucide-react'
import { api, type FileEntry, type HostSnapshot } from '../../api'
import { Toolbar } from '../../components/Toolbar'

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`
  return `${(size / 1024 ** 3).toFixed(1)} GB`
}

export function FilesTab({ host, notify }: { host: HostSnapshot; notify: (message: string) => void }) {
  const [path, setPath] = useState('/root')
  const [inputPath, setInputPath] = useState('/root')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [selected, setSelected] = useState<FileEntry | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (target: string) => {
    setLoading(true)
    setError('')
    try {
      const result = await api.getFiles(host.hostId, target)
      setEntries(result.entries)
      setPath(result.path)
      setInputPath(result.path)
      setSelected(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取失败')
    } finally {
      setLoading(false)
    }
  }, [host.hostId])

  useEffect(() => {
    void load('/root')
  }, [load])

  const segments = path.split('/').filter(Boolean)
  const parent = `/${segments.slice(0, -1).join('/')}`

  function go(entry: FileEntry) {
    setSelected(entry)
    if (entry.type === 'directory') void load(entry.path)
  }

  return (
    <>
      <Toolbar info={`${entries.length} 项 · 只读`}>
        <div className="toolbar-group">
          <button className="button button-secondary compact-button" type="button" onClick={() => void load(parent)} disabled={path === '/'}>
            <ArrowUp size={14} aria-hidden="true" />上级
          </button>
          <button className="icon-button" type="button" aria-label="刷新目录" onClick={() => void load(path)} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" className={loading ? 'spin' : ''} />
          </button>
        </div>
        <span className="toolbar-sep" aria-hidden="true" />
        <div className="toolbar-group" style={{ flex: 1, minInlineSize: 0 }}>
          <HardDrive size={14} aria-hidden="true" style={{ color: 'var(--text-faint)', flex: 'none' }} />
          <nav className="breadcrumb" aria-label="当前路径" style={{ overflowX: 'auto' }}>
            <button type="button" onClick={() => void load('/')}>/</button>
            {segments.map((segment, index) => (
              <span key={`${segment}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ChevronRight size={12} aria-hidden="true" />
                <button type="button" onClick={() => void load(`/${segments.slice(0, index + 1).join('/')}`)}>{segment}</button>
              </span>
            ))}
          </nav>
        </div>
        <button
          className="button button-secondary compact-button"
          type="button"
          disabled={!selected || selected.type === 'directory'}
          onClick={() => notify('下载接口尚未开放（只读浏览）')}
        >
          <Download size={14} aria-hidden="true" />下载
        </button>
      </Toolbar>

      <div className="files-wrap">
        <div className="file-list" role="region" aria-label="文件列表" tabIndex={0}>
          <div className="file-head" aria-hidden="true">
            <span>名称</span><span>大小</span><span>修改时间</span><span>权限</span>
          </div>
          <form
            style={{ display: 'flex', gap: 6, padding: 8, borderBlockEnd: '1px solid var(--line-soft)' }}
            onSubmit={(event) => {
              event.preventDefault()
              void load(inputPath)
            }}
          >
            <label className="sr-only" htmlFor={`path-${host.hostId}`}>跳转路径</label>
            <input
              id={`path-${host.hostId}`}
              value={inputPath}
              onChange={(event) => setInputPath(event.currentTarget.value)}
              spellCheck={false}
              autoComplete="off"
              style={{
                flex: 1,
                minInlineSize: 0,
                blockSize: 28,
                paddingInline: 8,
                border: '1px solid var(--line)',
                borderRadius: 5,
                background: 'var(--bg-deep)',
                color: 'var(--text-soft)',
                fontFamily: 'var(--mono)',
                fontSize: 11,
              }}
            />
            <button className="button button-secondary compact-button" type="submit">跳转</button>
          </form>

          {entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className="file-row"
              aria-selected={selected?.path === entry.path}
              onClick={() => go(entry)}
            >
              <span className="fname">
                {entry.type === 'directory'
                  ? <Folder size={14} className="file-icon-dir" aria-hidden="true" />
                  : <FileText size={14} className="file-icon-file" aria-hidden="true" />}
                <span>{entry.name}</span>
              </span>
              <span className="fmeta">{entry.type === 'file' ? formatSize(entry.size) : '—'}</span>
              <span className="fmeta">{entry.modified}</span>
              <span className="fmeta">{entry.owner}</span>
            </button>
          ))}

          {!loading && entries.length === 0 && (
            <div className="term-empty" style={{ minBlockSize: 160 }}>
              <Folder size={20} aria-hidden="true" />
              <span>{error || '目录为空'}</span>
            </div>
          )}
        </div>

        <aside className="file-detail" aria-label="选中条目详情">
          <p className="eyebrow">SELECTED</p>
          <h3>{selected?.name ?? '未选择'}</h3>
          <dl>
            <div><dt>主机</dt><dd>{host.hostId}</dd></div>
            <div><dt>类型</dt><dd>{selected ? (selected.type === 'directory' ? '目录' : '文件') : '—'}</dd></div>
            <div><dt>大小</dt><dd>{selected && selected.type === 'file' ? formatSize(selected.size) : '—'}</dd></div>
            <div><dt>权限</dt><dd>{selected?.mode ?? '—'}</dd></div>
            <div><dt>所有者</dt><dd>{selected?.owner ?? '—'}</dd></div>
            <div><dt>修改</dt><dd>{selected?.modified ?? '—'}</dd></div>
          </dl>
          <p className="callout" style={{ margin: 'auto 0 0' }}>
            <LockKeyhole size={13} aria-hidden="true" />
            <span>当前为只读浏览，写入与传输待开放。</span>
          </p>
        </aside>
      </div>
    </>
  )
}
