import { Copy, KeyRound, LogOut, Plus, Server, User } from 'lucide-react'
import { toast } from 'sonner'
import type { HostSnapshot } from '@/api'
import { EmptyState } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function AccessView({
  hosts,
  onAction,
  onLogout,
}: {
  hosts: HostSnapshot[]
  onAction: (message: string) => void
  onLogout: () => void
}) {
  const copyFingerprint = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success('已复制指纹'),
      () => toast.error('复制失败'),
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">凭据与设置</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{hosts.length} 台服务器已连接</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onLogout}>
          <LogOut />退出登录
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        {/* 当前账户 */}
        <Card className="self-start">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="size-4 text-primary" aria-hidden="true" />
              <CardTitle>当前账户</CardTitle>
            </div>
            <Badge tone="ok" dot className="ml-auto">已连接</Badge>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3">
              <span className="grid size-10 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden="true">
                OW
              </span>
              <div className="min-w-0 leading-tight">
                <b className="block text-sm font-semibold">Owner</b>
                <small className="text-xs text-muted-foreground">管理员</small>
              </div>
            </div>

            <dl className="grid gap-2 text-xs">
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-muted-foreground">会话状态</dt>
                <dd className="font-medium">正常</dd>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-muted-foreground">纳管主机</dt>
                <dd className="font-mono font-medium">{hosts.length} 台</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">认证方式</dt>
                <dd className="font-medium">密钥 / 口令</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* 主机密钥与指纹 */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" aria-hidden="true" />
              <CardTitle>主机凭据与指纹</CardTitle>
            </div>
            <Button
              variant="secondary"
              size="icon"
              className="ml-auto size-7"
              aria-label="添加凭据"
              onClick={() => onAction('请在服务端的 hosts.json 中登记新主机')}
            >
              <Plus className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {hosts.map((host) => (
                <div
                  key={host.hostId}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Server className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <b className="block text-sm font-semibold">{host.label}</b>
                      <small className="block font-mono text-xs text-muted-foreground">{host.address}</small>
                    </div>
                    <Badge tone="ok" dot>正常</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1.5 font-mono text-xs text-muted-foreground">
                    <span className="truncate" title={host.fingerprint}>
                      {host.fingerprint}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                      title="复制指纹"
                      onClick={() => copyFingerprint(host.fingerprint)}
                    >
                      <Copy className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {hosts.length === 0 && <EmptyState icon={KeyRound}>暂无纳管主机</EmptyState>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
