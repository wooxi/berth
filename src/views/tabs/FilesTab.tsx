import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  ChevronRight,
  Copy,
  Download,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  KeyRound,
  PencilLine,
  RefreshCw,
  Save,
  Scissors,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { api, type FileEntry, type FilePreview, type HostSnapshot } from '../../api'
import { Toolbar } from '../../components/Toolbar'

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`
  return `${(size / 1024 ** 3).toFixed(1)} GB`
}

type ActionKind = 'mkdir' | 'newfile' | 'rename' | 'copy' | 'move' | 'chmod' | 'delete'

type PendingAction = {
  kind: ActionKind
  value: string
  recursive?: boolean
}

const ACTION_LABEL: Record<ActionKind, string> = {
  mkdir: '新建文件夹',
  newfile: '新建文件',
  rename: '重命名',
  copy: '复制到',
  move: '移动到',
  chmod: '修改权限',
  delete: '删除',
}

export function FilesTab({ host, notify }: { host: HostSnapshot; notify: (message: string) => void }) {
  const [path, setPath] = useState('/root')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [selected, setSelected] = useState<FileEntry | null>(null)
  const [preview, setPreview] = useState<FilePreview | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)

  const dirty = draft !== null && preview !== null && draft !== preview.content

  const load = useCallback(async (target: string) => {
    setLoading(true)
    setError('')
    try {
      const result = await api.getFiles(host.hostId, target)
      setEntries(result.entries)
      setPath(result.path)
      setSelected(null)
      setPreview(null)
      setDraft(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取失败')
    } finally {
      setLoading(false)
    }
  }, [host.hostId])

  useEffect(() => {
    void load('/root')
  }, [load])

  async function openEntry(entry: FileEntry) {
    setSelected(entry)
    setPending(null)
    if (entry.type === 'directory') {
      setPreview(null)
      setDraft(null)
      await load(entry.path)
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api.readFile(host.hostId, entry.path)
      setPreview(result)
      setDraft(result.binary ? null : result.content)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取失败')
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!preview || draft === null) return
    setBusy(true)
    try {
      await api.saveFile(host.hostId, preview.path, draft)
      setPreview({ ...preview, content: draft, size: new Blob([draft]).size })
      notify(`已保存 ${preview.path.split('/').pop()}`)
      await load(path)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function runPending() {
    if (!pending) return
    setBusy(true)
    setError('')
    try {
      const value = pending.value.trim()
      if (pending.kind === 'mkdir') {
        await api.makeDir(host.hostId, path, value)
        notify(`已新建文件夹 ${value}`)
      } else if (pending.kind === 'newfile') {
        await api.touchFile(host.hostId, path, value)
        notify(`已新建文件 ${value}`)
      } else if (pending.kind === 'rename' && selected) {
        await api.renamePath(host.hostId, selected.path, `${path.replace(/\/$/, '')}/${value}`)
        notify(`已重命名为 ${value}`)
      } else if ((pending.kind === 'copy' || pending.kind === 'move') && selected) {
        const target = value
        if (pending.kind === 'copy') await api.copyPath(host.hostId, selected.path, target)
        else await api.movePath(host.hostId, selected.path, target)
        notify(pending.kind === 'copy' ? '已复制' : '已移动')
      } else if (pending.kind === 'chmod' && selected) {
        await api.chmodPath(host.hostId, selected.path, value)
        notify(`权限已改为 ${value}`)
      } else if (pending.kind === 'delete' && selected) {
        await api.deletePath(host.hostId, selected.path, pending.recursive === true)
        notify(`已删除 ${selected.name}`)
      }
      setPending(null)
      setSelected(null)
      setPreview(null)
      setDraft(null)
      await load(path)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  async function upload(file: File) {
    setBusy(true)
    setError('')
    try {
      await api.uploadFile(host.hostId, path, file.name, file)
      notify(`已上传 ${file.name}`)
      await load(path)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '上传失败')
    } finally {
      setBusy(false)
    }
  }

  function startAction(kind: ActionKind) {
    const base = selected && (kind === 'rename' || kind === 'chmod')
      ? kind === 'rename' ? selected.name : selected.mode
      : kind === 'copy' || kind === 'move'
        ? selected?.path ?? path
        : ''
    setPending({ kind, value: base, recursive: false })
  }

  const segments = path.split('/').filter(Boolean)
  const parent = `/${segments.slice(0, -1).join('/')}`
  const isDir = selected?.type === 'directory'

  return (
    <>
      <Toolbar info={`${entries.length} 项${dirty ? ' · 未保存' : ''}`}>
        <div className="toolbar-group">
          <button className="button button-secondary compact-button" type="button" onClick={() => void load(parent)} disabled={path === '/'}>
            <ArrowUp size={14} aria-hidden="true" />上级
          </button>
          <button className="icon-button" type="button" aria-label="刷新目录" onClick={() => void load(path)} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" className={loading ? 'spin' : ''} />
          </button>
        </div>

        <span className="toolbar-sep" aria-hidden="true" />

        <div className="toolbar-group">
          <button className="button button-secondary compact-button" type="button" onClick={() => startAction('mkdir')}>
            <FolderPlus size={14} aria-hidden="true" />新建文件夹
          </button>
          <button className="button button-secondary compact-button" type="button" onClick={() => startAction('newfile')}>
            <FilePlus2 size={14} aria-hidden="true" />新建文件
          </button>
          <button className="button button-secondary compact-button" type="button" onClick={() => uploadRef.current?.click()}>
            <Upload size={14} aria-hidden="true" />上传
          </button>
          <input
            ref={uploadRef}
            type="file"
            className="sr-only"
            aria-label="选择要上传的文件"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) void upload(file)
              event.currentTarget.value = ''
            }}
          />
        </div>

        <span className="toolbar-sep" aria-hidden="true" />

        <div className="toolbar-group">
          <a
            className={`button button-secondary compact-button${!selected || isDir ? ' is-disabled' : ''}`}
            href={selected && !isDir ? api.downloadUrl(host.hostId, selected.path) : undefined}
            aria-disabled={!selected || isDir}
            download
            onClick={(event) => { if (!selected || isDir) event.preventDefault() }}
          >
            <Download size={14} aria-hidden="true" />下载
          </a>
          <button
            className="button button-danger compact-button"
            type="button"
            disabled={!selected}
            onClick={() => startAction('delete')}
          >
            <Trash2 size={14} aria-hidden="true" />删除
          </button>
        </div>

        <span className="toolbar-sep" aria-hidden="true" />

        <div className="toolbar-group path-group">
          <HardDrive size={14} aria-hidden="true" className="path-icon" />
          <nav className="crumbs" aria-label="当前路径">
            <button type="button" onClick={() => void load('/')}>/</button>
            {segments.map((segment, index) => (
              <span className="crumb" key={`${segment}-${index}`}>
                <ChevronRight size={11} aria-hidden="true" />
                <button type="button" onClick={() => void load(`/${segments.slice(0, index + 1).join('/')}`)}>{segment}</button>
              </span>
            ))}
          </nav>
        </div>
      </Toolbar>

      {pending && (
        <form className="file-action-bar" onSubmit={(event) => { event.preventDefault(); void runPending() }}>
          <span className="file-action-label">{ACTION_LABEL[pending.kind]}{selected && pending.kind !== 'mkdir' && pending.kind !== 'newfile' ? ` ${selected.name}` : ''}</span>

          {pending.kind !== 'delete' && (
            <input
              className="file-action-input"
              value={pending.value}
              onChange={(event) => setPending({ ...pending, value: event.currentTarget.value })}
              placeholder={pending.kind === 'copy' || pending.kind === 'move' ? '目标绝对路径' : pending.kind === 'chmod' ? '755' : '名称'}
              autoFocus
              spellCheck={false}
              aria-label={ACTION_LABEL[pending.kind]}
            />
          )}

          {pending.kind === 'delete' && (
            <>
              <span className="file-action-warn">不可撤销</span>
              {isDir && (
                <label className="file-action-check">
                  <input
                    type="checkbox"
                    checked={pending.recursive === true}
                    onChange={(event) => setPending({ ...pending, recursive: event.currentTarget.checked })}
                  />
                  递归删除目录及内容
                </label>
              )}
            </>
          )}

          <button
            className={`button compact-button ${pending.kind === 'delete' ? 'button-danger' : 'button-primary'}`}
            type="submit"
            disabled={busy || (pending.kind !== 'delete' && !pending.value.trim())}
          >
            {pending.kind === 'delete' ? '确认删除' : '确定'}
          </button>
          <button className="button button-quiet compact-button" type="button" onClick={() => setPending(null)}>取消</button>
        </form>
      )}

      <div className="files-wrap">
        <div className="file-list" role="region" aria-label="文件列表" tabIndex={0}>
          <div className="file-head" aria-hidden="true">
            <span>名称</span><span>大小</span><span>修改时间</span><span>权限</span>
          </div>

          {entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className="file-row"
              aria-selected={selected?.path === entry.path}
              onClick={() => void openEntry(entry)}
            >
              <span className="fname">
                {entry.type === 'directory'
                  ? <Folder size={14} className="file-icon-dir" aria-hidden="true" />
                  : <FileText size={14} className="file-icon-file" aria-hidden="true" />}
                <span>{entry.name}</span>
              </span>
              <span className="fmeta">{entry.type === 'file' ? formatSize(entry.size) : '—'}</span>
              <span className="fmeta">{entry.modified}</span>
              <span className="fmeta">{entry.mode}</span>
            </button>
          ))}

          {!loading && entries.length === 0 && (
            <div className="term-empty" style={{ minBlockSize: 160 }}>
              <Folder size={20} aria-hidden="true" />
              <span>{error || '目录为空'}</span>
            </div>
          )}
        </div>

        <aside className="file-detail" aria-label="文件详情">
          {!selected && (
            <div className="term-empty" style={{ minBlockSize: 200 }}>
              <FileText size={20} aria-hidden="true" />
              <span>选择左侧文件查看内容</span>
            </div>
          )}

          {selected && (
            <>
              <div className="file-detail-head">
                <h3 title={selected.name}>{selected.name}</h3>
                <button className="icon-button" type="button" aria-label="关闭预览" onClick={() => { setSelected(null); setPreview(null); setDraft(null) }}>
                  <X size={14} aria-hidden="true" />
                </button>
              </div>

              <dl>
                <div><dt>大小</dt><dd>{selected.type === 'file' ? formatSize(selected.size) : '目录'}</dd></div>
                <div><dt>权限</dt><dd>{selected.mode}</dd></div>
                <div><dt>所有者</dt><dd>{selected.owner}</dd></div>
                <div><dt>修改</dt><dd>{selected.modified}</dd></div>
              </dl>

              <div className="file-detail-actions">
                <button className="button button-secondary compact-button" type="button" onClick={() => startAction('rename')}>
                  <PencilLine size={13} aria-hidden="true" />重命名
                </button>
                <button className="button button-secondary compact-button" type="button" onClick={() => startAction('copy')}>
                  <Copy size={13} aria-hidden="true" />复制
                </button>
                <button className="button button-secondary compact-button" type="button" onClick={() => startAction('move')}>
                  <Scissors size={13} aria-hidden="true" />移动
                </button>
                <button className="button button-secondary compact-button" type="button" onClick={() => startAction('chmod')}>
                  <KeyRound size={13} aria-hidden="true" />权限
                </button>
              </div>

              {busy && <p className="file-detail-hint">读取中…</p>}

              {preview?.binary && (
                <p className="note" style={{ marginBlockStart: 0 }}>
                  <FileText size={13} aria-hidden="true" />
                  <span>二进制文件，不支持在线预览，可用工具栏下载。</span>
                </p>
              )}

              {draft !== null && (
                <>
                  <textarea
                    className="file-editor"
                    value={draft}
                    onChange={(event) => setDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                        event.preventDefault()
                        void save()
                      }
                    }}
                    spellCheck={false}
                    aria-label={`${selected.name} 内容`}
                  />
                  <div className="file-editor-foot">
                    <span className="file-detail-hint">
                      {preview?.truncated ? '已截断，仅显示前 512KB' : dirty ? '未保存' : '已同步'}
                    </span>
                    <button className="button button-primary compact-button" type="button" onClick={() => void save()} disabled={!dirty || busy}>
                      <Save size={13} aria-hidden="true" />保存
                    </button>
                  </div>
                </>
              )}

              {error && <p className="form-error" role="alert">{error}</p>}
            </>
          )}
        </aside>
      </div>
    </>
  )
}
