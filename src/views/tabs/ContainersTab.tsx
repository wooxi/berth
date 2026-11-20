import { useCallback, useEffect, useState } from 'react'
import {
  Box,
  Copy,
  Info,
  Play,
  Power,
  RefreshCw,
  RotateCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, type ContainerInfo, type HostSnapshot } from '../../api'
import { EmptyState, StatusBadge, Toolbar, ToolbarSep } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function ContainersTab({
  host,
}: {
  host: HostSnapshot
  notify: (message: string) => void
}) {
  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped'>('all')
  const [activeContainer, setActiveContainer] = useState<ContainerInfo | null>(null)

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
        <Toolbar info="未检测到容器服务" />
        <EmptyState icon={Box}>{host.label} 未启用 Docker / Podman</EmptyState>
      </>
    )
  }

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd).then(
      () => toast.success(`已复制: ${cmd}`),
      () => toast.error('复制失败'),
    )
  }

  const handleContainerAction = (container: ContainerInfo, action: 'start' | 'stop' | 'restart') => {
    const runtime = host.runtime === 'podman' ? 'podman' : 'docker'
    const cmd = `${runtime} ${action} ${container.name || container.id}`
    copyCommand(cmd)
  }

  const running = containers.filter((item) => item.state === 'running').length
  const visible = containers.filter(
    (item) => filter === 'all' || (filter === 'running' ? item.state === 'running' : item.state !== 'running'),
  )

  return (
    <>
      <Toolbar info={`${running} 运行中 / ${containers.length} 总计`}>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'spin' : ''} />刷新
        </Button>
        <ToolbarSep />
        <div role="group" aria-label="容器筛选" className="flex gap-1">
          {([['all', '全部'], ['running', '运行中'], ['stopped', '已停止']] as const).map(([id, label]) => (
            <Button
              key={id}
              variant={filter === id ? 'default' : 'secondary'}
              size="sm"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      </Toolbar>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-5">容器</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>运行信息</TableHead>
              <TableHead>端口映射</TableHead>
              <TableHead className="w-52 text-right px-5">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((container) => {
              const isRunning = container.state === 'running'
              return (
                <TableRow key={container.id}>
                  <TableCell className="px-5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Box className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 leading-tight">
                        <b className="block text-[13px] font-semibold">{container.name}</b>
                        <small className="block max-w-80 truncate font-mono text-xs text-muted-foreground">
                          {container.image}
                        </small>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={isRunning ? 'online' : 'offline'}
                      label={isRunning ? '运行中' : '已停止'}
                    />
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{container.status}</TableCell>
                  <TableCell className="max-w-72 truncate font-mono text-xs text-muted-foreground">
                    {container.ports || '—'}
                  </TableCell>
                  <TableCell className="text-right px-5">
                    <div className="flex items-center justify-end gap-1.5">
                      {isRunning ? (
                        <>
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => handleContainerAction(container, 'restart')}
                          >
                            <RotateCw className="size-3" />
                            重启
                          </Button>
                          <Button
                            variant="destructive"
                            size="xs"
                            onClick={() => handleContainerAction(container, 'stop')}
                          >
                            <Power className="size-3" />
                            停止
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="default"
                          size="xs"
                          onClick={() => handleContainerAction(container, 'start')}
                        >
                          <Play className="size-3" />
                          启动
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => setActiveContainer(container)}
                      >
                        <Info className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {!loading && visible.length === 0 && (
          <EmptyState icon={Box} className="min-h-52">
            {error || '没有容器'}
          </EmptyState>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-2 font-mono text-xs text-muted-foreground">
        <span>宿主运行时: {host.runtime}</span>
        <span>主机: {host.hostId}</span>
      </div>

      {/* 容器详情弹窗 */}
      <Dialog open={Boolean(activeContainer)} onOpenChange={(open) => !open && setActiveContainer(null)}>
        {activeContainer && (
          <DialogContent className="max-w-md p-6">
            <DialogTitle className="flex items-center gap-2.5 text-base font-semibold">
              <Box className="size-5 text-primary" />
              {activeContainer.name}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs text-muted-foreground">
              {activeContainer.image}
            </DialogDescription>

            <div className="mt-4 grid gap-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-muted/60 p-2.5">
                  <span className="text-muted-foreground">状态</span>
                  <div className="mt-1 font-medium">{activeContainer.status}</div>
                </div>
                <div className="rounded-md bg-muted/60 p-2.5">
                  <span className="text-muted-foreground">容器 ID</span>
                  <div className="mt-1 font-mono truncate font-medium">{activeContainer.id}</div>
                </div>
              </div>

              <div className="rounded-md bg-muted/60 p-2.5">
                <span className="text-muted-foreground">端口</span>
                <div className="mt-1 font-mono">{activeContainer.ports || '—'}</div>
              </div>

              <div className="mt-2 space-y-1.5">
                {[
                  {
                    label: 'Shell (Exec)',
                    cmd: `${host.runtime === 'podman' ? 'podman' : 'docker'} exec -it ${activeContainer.name} sh`,
                  },
                  {
                    label: '日志 (Logs)',
                    cmd: `${host.runtime === 'podman' ? 'podman' : 'docker'} logs -f --tail=100 ${activeContainer.name}`,
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 rounded border border-border bg-card p-2 text-xs"
                  >
                    <code className="font-mono text-[11px] text-foreground truncate">{item.cmd}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      onClick={() => copyCommand(item.cmd)}
                    >
                      <Copy className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
