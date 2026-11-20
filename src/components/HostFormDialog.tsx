import { useEffect, useState } from 'react'
import { ScanSearch, Server, X } from 'lucide-react'
import { api, ValidationError, type HostDraft } from '@/api'
import { validateHostAdminDraft, type HostAdminDraft } from '../../shared/host-registry'
import { Spinner } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type HostFormTarget = { mode: 'create' } | { mode: 'edit'; hostId: string }

const EMPTY_DRAFT: HostDraft = {
  id: '',
  label: '',
  address: '',
  port: 0,
  username: '',
  fingerprint: '',
  group: '',
  role: '',
  runtime: 'docker',
  systemd: true,
  enabled: true,
}

type IssueMap = Partial<Record<keyof HostAdminDraft, string>>

export function HostFormDialog({
  target,
  onClose,
  onSaved,
}: {
  target: HostFormTarget | null
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [draft, setDraft] = useState<HostDraft>(EMPTY_DRAFT)
  const [touched, setTouched] = useState<Partial<Record<keyof HostAdminDraft, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState('')
  const [probeNote, setProbeNote] = useState('')
  const [probing, setProbing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  const editing = target?.mode === 'edit'

  useEffect(() => {
    if (!target) return
    setSubmitted(false)
    setServerError('')
    setProbeNote('')
    if (target.mode === 'create') {
      setDraft(EMPTY_DRAFT)
      setTouched({})
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    api.getHostConfig(target.hostId)
      .then(({ host }) => {
        if (!cancelled) setDraft(host)
      })
      .catch((error: Error) => {
        if (!cancelled) setServerError(error.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [target])

  const validation = validateHostAdminDraft(effectiveDraft())
  const issueMap: IssueMap = validation.ok ? {} : Object.fromEntries(validation.issues.map((issue) => [issue.field, issue.message]))

  function issueOf(field: keyof HostAdminDraft): string | undefined {
    return (touched[field] || submitted) ? issueMap[field] : undefined
  }

  function update<K extends keyof HostDraft>(field: K, value: HostDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function effectiveDraft(): HostDraft {
    if (target?.mode === 'edit') return draft
    return {
      ...draft,
      port: draft.port || 22,
      group: draft.group.trim() || 'default',
      role: draft.role.trim() || 'server',
    }
  }

  function invalid(field: keyof HostAdminDraft) {
    return issueOf(field) ? true : undefined
  }

  function describedBy(field: keyof HostAdminDraft, formId: string) {
    return issueOf(field) ? `${formId}-${field}-error` : undefined
  }

  async function probeFingerprint() {
    if (!draft.address.trim()) {
      setTouched((current) => ({ ...current, address: true }))
      return
    }
    setProbing(true)
    setProbeNote('')
    try {
      const { fingerprint } = await api.probeHostKey(draft.address.trim(), draft.port || 22)
      setDraft((current) => ({ ...current, fingerprint }))
      setProbeNote('已获取主机密钥指纹，保存前请确认与服务器实际指纹一致')
    } catch (error) {
      setProbeNote(error instanceof Error ? error.message : '探测失败')
    } finally {
      setProbing(false)
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (!validation.ok) {
      const firstField = validation.issues[0]?.field
      document.getElementById(`host-form-${firstField}`)?.focus()
      return
    }
    setSaving(true)
    setServerError('')
    try {
      const payload = effectiveDraft()
      const result = target?.mode === 'edit'
        ? await api.updateHost(target.hostId, payload)
        : await api.createHost(payload)
      onSaved(`${target?.mode === 'edit' ? '已保存' : '已登记'} ${result.host.label}`)
      onClose()
    } catch (error) {
      if (error instanceof ValidationError) {
        setServerError(error.issues.map((issue) => issue.message).join('；') || error.message)
      } else {
        setServerError(error instanceof Error ? error.message : '保存失败')
      }
    } finally {
      setSaving(false)
    }
  }

  const formId = 'host-form'

  function renderField(field: keyof HostAdminDraft, label: string, children: React.ReactNode, hint?: string) {
    const issue = issueOf(field)
    return (
      <div className="grid gap-1.5">
        <label htmlFor={`${formId}-${field}`} className="text-xs font-medium text-muted-foreground">{label}</label>
        {children}
        {hint && !issue && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        {issue && <p id={`${formId}-${field}-error`} role="alert" className="text-[11px] text-destructive">{issue}</p>}
      </div>
    )
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="flex w-[min(600px,92vw)] max-h-[80vh] flex-col gap-0 overflow-hidden">
        <form onSubmit={onSubmit} aria-label={editing ? '编辑服务器' : '登记服务器'} className="flex min-h-0 flex-1 flex-col">
          <div className="relative shrink-0 px-5 pb-4 pt-5">
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" className="absolute right-3.5 top-3.5" aria-label="关闭">
                <X />
              </Button>
            </DialogClose>
            <div className="flex items-start gap-3 pr-12">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
                <Server className="size-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-[15px] font-semibold">
                  {editing ? `编辑 ${draft.label || '服务器'}` : '登记服务器'}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                  登记后由服务端持有 SSH 凭据连接，浏览器不接触密钥材料。
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            {loading && (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Spinner />正在读取登记信息…</p>
            )}

            <div className="grid gap-x-4 gap-y-3.5 pb-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 max-sm:grid-cols-1">
                {renderField('id', '标识', (
                  <Input
                    id={`${formId}-id`}
                    value={draft.id}
                    disabled={editing}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={invalid('id')}
                    onChange={(event) => update('id', event.currentTarget.value)}
                    onBlur={() => setTouched((current) => ({ ...current, id: true }))}
                  />
                ), editing ? '标识创建后不可修改' : undefined)}

                {renderField('label', '显示名', (
                  <Input
                    id={`${formId}-label`}
                    value={draft.label}
                    autoComplete="off"
                    aria-invalid={invalid('label')}
                    onChange={(event) => update('label', event.currentTarget.value)}
                    onBlur={() => setTouched((current) => ({ ...current, label: true }))}
                  />
                ))}

                {renderField('address', '地址', (
                  <Input
                    id={`${formId}-address`}
                    value={draft.address}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={invalid('address')}
                    aria-describedby={describedBy('address', formId)}
                    onChange={(event) => update('address', event.currentTarget.value)}
                    onBlur={() => setTouched((current) => ({ ...current, address: true }))}
                  />
                ))}

                {renderField('port', 'SSH 端口', (
                  <Input
                    id={`${formId}-port`}
                    type="number"
                    min={1}
                    max={65535}
                    step={1}
                    inputMode="numeric"
                    value={draft.port || ''}
                    aria-invalid={invalid('port')}
                    onChange={(event) => update('port', Number(event.currentTarget.value))}
                    onBlur={() => setTouched((current) => ({ ...current, port: true }))}
                  />
                ))}

                {renderField('username', 'SSH 用户', (
                  <Input
                    id={`${formId}-username`}
                    value={draft.username}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={invalid('username')}
                    onChange={(event) => update('username', event.currentTarget.value)}
                    onBlur={() => setTouched((current) => ({ ...current, username: true }))}
                  />
                ))}

                {renderField('group', '分组', (
                  <Input
                    id={`${formId}-group`}
                    value={draft.group}
                    autoComplete="off"
                    aria-invalid={invalid('group')}
                    onChange={(event) => update('group', event.currentTarget.value)}
                    onBlur={() => setTouched((current) => ({ ...current, group: true }))}
                  />
                ))}

                {renderField('role', '用途', (
                  <Input
                    id={`${formId}-role`}
                    value={draft.role}
                    autoComplete="off"
                    aria-invalid={invalid('role')}
                    onChange={(event) => update('role', event.currentTarget.value)}
                    onBlur={() => setTouched((current) => ({ ...current, role: true }))}
                  />
                ))}

                <div className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">容器运行时</span>
                  <Tabs value={draft.runtime} onValueChange={(value) => update('runtime', value as HostDraft['runtime'])} className="h-9">
                    <TabsList className="flex h-full w-full items-stretch gap-0 rounded-md border border-input bg-muted p-0.5">
                      <TabsTrigger value="docker" className="h-auto flex-1 justify-center rounded-[5px] text-xs">docker</TabsTrigger>
                      <TabsTrigger value="podman" className="h-auto flex-1 justify-center rounded-[5px] text-xs">podman</TabsTrigger>
                      <TabsTrigger value="none" className="h-auto flex-1 justify-center rounded-[5px] text-xs">无</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {renderField('fingerprint', '主机密钥指纹', (
                  <div className="flex gap-2">
                    <Input
                      id={`${formId}-fingerprint`}
                      value={draft.fingerprint}
                      autoComplete="off"
                      spellCheck={false}
                      className="font-mono text-xs"
                      aria-invalid={invalid('fingerprint')}
                      aria-describedby={describedBy('fingerprint', formId)}
                      onChange={(event) => update('fingerprint', event.currentTarget.value)}
                      onBlur={() => setTouched((current) => ({ ...current, fingerprint: true }))}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0"
                      disabled={probing || !draft.address.trim()}
                      onClick={() => void probeFingerprint()}
                    >
                      {probing ? <Spinner /> : <ScanSearch aria-hidden="true" />}
                      探测指纹
                    </Button>
                  </div>
                ), probeNote || undefined)}
              </div>

              <div className="grid gap-2 border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground">采集选项</p>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5">
                  <div className="min-w-0 text-xs">
                    <p className="font-medium text-foreground">启用监控</p>
                    <p className="text-muted-foreground">参与指标采集与概览展示</p>
                  </div>
                  <Switch
                    id={`${formId}-enabled`}
                    checked={draft.enabled}
                    onCheckedChange={(checked) => update('enabled', checked)}
                    aria-label="启用监控"
                  />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5">
                  <div className="min-w-0 text-xs">
                    <p className="font-medium text-foreground">systemd 日志</p>
                    <p className="text-muted-foreground">开放按服务单元拉取 journalctl</p>
                  </div>
                  <Switch
                    id={`${formId}-systemd`}
                    checked={draft.systemd}
                    onCheckedChange={(checked) => update('systemd', checked)}
                    aria-label="systemd 日志"
                  />
                </div>
              </div>

              {serverError && <p role="alert" className="mt-3 text-xs text-destructive">{serverError}</p>}
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3.5">
            <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={saving || loading}>
              {saving && <Spinner />}
              {saving ? '保存中…' : editing ? '保存修改' : '登记'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
