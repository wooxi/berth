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
import { EmptyState, Toolbar, ToolbarSep } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

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
        <Button variant="secondary" size="sm" onClick={() => void load(parent)} disabled={path === '/'}><ArrowUp />上级</Button>
        <Button variant="ghost" size="icon" aria-label="刷新目录" onClick={() => void load(path)} disabled={loading}>
          <RefreshCw className={loading ? 'spin' : ''} />
        </Button>

        <ToolbarSep />
        <Button variant="secondary" size="sm" onClick={() => startAction('mkdir')}><FolderPlus />新建文件夹</Button>
        <Button variant="secondary" size="sm" onClick={() => startAction('newfile')}><FilePlus2 />新建文件</Button>
        <Button variant="secondary" size="sm" onClick={() => uploadRef.current?.click()}><Upload />上传</Button>
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

        <ToolbarSep />
        <Button variant="secondary" size="sm" asChild aria-disabled={!selected || isDir}>
          <a
            href={selected && !isDir ? api.downloadUrl(host.hostId, selected.path) : undefined}
            download
            onClick={(event) => { if (!selected || isDir) event.preventDefault() }}
          >
            <Download />下载
          </a>
        </Button>
        <Button variant="destructive" size="sm" disabled={!selected} onClick={() => startAction('delete')}><Trash2 />删除</Button>

        <ToolbarSep />
        <HardDrive className="size-4 text-muted-foreground" aria-hidden="true" />
        <nav className="flex min-w-0 items-center gap-0.5 font-mono text-[13px]" aria-label="当前路径">
          <button type="button" className="rounded px-1.5 py-0.5 hover:bg-muted" onClick={() => void load('/')}>/</button>
          {segments.map((segment, index) => (
            <span className="flex items-center" key={`${segment}-${index}`}>
              <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
              <button type="button" className="rounded px-1.5 py-0.5 hover:bg-muted" onClick={() => void load(`/${segments.slice(0, index + 1).join('/')}`)}>{segment}</button>
            </span>
          ))}
        </nav>
      </Toolbar>

      {pending && (
        <form className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-muted/50 px-5 py-2.5" onSubmit={(event) => { event.preventDefault(); void runPending() }}>
          <span className="text-[13px] font-medium">{ACTION_LABEL[pending.kind]}{selected && pending.kind !== 'mkdir' && pending.kind !== 'newfile' ? ` ${selected.name}` : ''}</span>

          {pending.kind !== 'delete' && (
            <Input
              className="h-8 max-w-md flex-1 font-mono"
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
              <span className="text-[13px] text-destructive">不可撤销</span>
              {isDir && (
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={pending.recursive === true} onChange={(event) => setPending({ ...pending, recursive: event.currentTarget.checked })} />
                  递归删除目录及内容
                </label>
              )}
            </>
          )}

          <Button variant={pending.kind === 'delete' ? 'destructive' : 'default'} size="sm" type="submit" disabled={busy || (pending.kind !== 'delete' && !pending.value.trim())}>
            {pending.kind === 'delete' ? '确认删除' : '确定'}
          </Button>
          <Button variant="ghost" size="sm" type="button" onClick={() => setPending(null)}>取消</Button>
        </form>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(380px,34%)]">
        <div className="min-h-0 overflow-auto" role="region" aria-label="文件列表" tabIndex={0}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5">名称</TableHead>
                <TableHead>大小</TableHead>
                <TableHead>修改时间</TableHead>
                <TableHead>权限</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow
                  key={entry.path}
                  tabIndex={0}
                  aria-selected={selected?.path === entry.path}
                  className="cursor-pointer"
                  onClick={() => void openEntry(entry)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void openEntry(entry) }}
                >
                  <TableCell className="px-5">
                    <span className="flex items-center gap-2.5 font-medium">
                      {entry.type === 'directory'
                        ? <Folder className="size-4 text-primary" aria-hidden="true" />
                        : <FileText className="size-4 text-muted-foreground" aria-hidden="true" />}
                      {entry.name}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{entry.type === 'file' ? formatSize(entry.size) : '—'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{entry.modified}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{entry.mode}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!loading && entries.length === 0 && <EmptyState icon={Folder} className="min-h-40">{error || '目录为空'}</EmptyState>}
        </div>

        <aside className="flex min-h-0 flex-col border-t border-border bg-card/40 xl:border-t-0 xl:border-l" aria-label="文件详情">
          {!selected && <EmptyState icon={FileText}>选择左侧文件查看内容</EmptyState>}

          {selected && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <h3 className="min-w-0 flex-1 truncate text-sm font-semibold" title={selected.name}>{selected.name}</h3>
                <Button variant="ghost" size="icon" aria-label="关闭预览" onClick={() => { setSelected(null); setPreview(null); setDraft(null) }}><X /></Button>
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ['大小', selected.type === 'file' ? formatSize(selected.size) : '目录'],
                  ['权限', selected.mode],
                  ['所有者', selected.owner],
                  ['修改', selected.modified],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md bg-muted/60 px-2.5 py-1.5">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="truncate font-mono font-medium">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="grid grid-cols-4 gap-1.5">
                <Button variant="secondary" size="xs" onClick={() => startAction('rename')}><PencilLine />重命名</Button>
                <Button variant="secondary" size="xs" onClick={() => startAction('copy')}><Copy />复制</Button>
                <Button variant="secondary" size="xs" onClick={() => startAction('move')}><Scissors />移动</Button>
                <Button variant="secondary" size="xs" onClick={() => startAction('chmod')}><KeyRound />权限</Button>
              </div>

              {busy && <p className="text-xs text-muted-foreground">读取中…</p>}

              {preview?.binary && (
                <p className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                  <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  二进制文件，不支持在线预览，可用工具栏下载。
                </p>
              )}

              {draft !== null && (
                <>
                  <textarea
                    className="min-h-48 w-full flex-1 resize-none rounded-lg border border-input bg-term p-3 font-mono text-[12.5px] leading-relaxed text-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn('text-xs', dirty ? 'text-warning' : 'text-muted-foreground')}>
                      {preview?.truncated ? '已截断，仅显示前 512KB' : dirty ? '未保存' : '已同步'}
                    </span>
                    <Button size="sm" onClick={() => void save()} disabled={!dirty || busy}><Save />保存</Button>
                  </div>
                </>
              )}

              {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
            </div>
          )}
        </aside>
      </div>
    </>
  )
}