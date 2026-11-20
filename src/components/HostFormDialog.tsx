import { useEffect, useState } from 'react'
import { ScanSearch, Server } from 'lucide-react'
import { api, ValidationError, type HostDraft } from '@/api'
import { validateHostAdminDraft, type HostAdminDraft } from '../../shared/host-registry'
import { Spinner } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type HostFormTarget = { mode: 'create' } | { mode: 'edit'; hostId: string }

const EMPTY_DRAFT: HostDraft = {
  id: '',
  label: '',
  address: '',
  port: 22,
  username: '',
  fingerprint: '',
  group: 'default',
  role: 'server',
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

  const validation = validateHostAdminDraft(draft)
  const issueMap: IssueMap = validation.ok ? {} : Object.fromEntries(validation.issues.map((issue) => [issue.field, issue.message]))

  function issueOf(field: keyof HostAdminDraft): string | undefined {
    return (touched[field] || submitted) ? issueMap[field] : undefined
  }

  function update<K extends keyof HostDraft>(field: K, value: HostDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
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
      const result = target?.mode === 'edit'
        ? await api.updateHost(target.hostId, draft)
        : await api.createHost(draft)
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
        <label htmlFor={`${formId}-${field}`} className="text-[13px] font-medium">{label}</label>
        {children}
        {hint && !issue && <p className="text-xs text-muted-foreground">{hint}</p>}
        {issue && <p id={`${formId}-${field}-error`} role="alert" className="text-xs text-destructive">{issue}</p>}
      </div>
    )
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-[min(600px,92vw)]">
        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
          <Server className="size-4 text-muted-foreground" aria-hidden="true" />
          {editing ? `编辑 ${draft.label || '服务器'}` : '登记服务器'}
        </DialogTitle>
        <DialogDescription className="text-left text-xs">
          SSH 主机密钥指纹固定（SHA256），连接时会严格校验。
        </DialogDescription>

        <form onSubmit={onSubmit} aria-label={editing ? '编辑服务器' : '登记服务器'} className="mt-3 grid gap-4">
          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />正在读取登记信息…</p>
          )}

          <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            {renderField('id', '标识', (
              <Input
                id={`${formId}-id`}
                value={draft.id}
                disabled={editing}
                placeholder="app-node-01"
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
                placeholder="应用节点"
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
                placeholder="192.168.100.4"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={invalid('address')}
                aria-describedby={describedBy('address', formId)}
                onChange={(event) => update('address', event.currentTarget.value)}
                onBlur={() => setTouched((current) => ({ ...current, address: true }))}
              />
            ), '域名或 IPv4，仅内网可达')}

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
                placeholder="yard-reader"
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
                placeholder="Production"
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
                placeholder="应用节点"
                autoComplete="off"
                aria-invalid={invalid('role')}
                onChange={(event) => update('role', event.currentTarget.value)}
                onBlur={() => setTouched((current) => ({ ...current, role: true }))}
              />
            ))}

            <div className="grid gap-1.5">
              <span className="text-[13px] font-medium">容器运行时</span>
              <Tabs value={draft.runtime} onValueChange={(value) => update('runtime', value as HostDraft['runtime'])}>
                <TabsList className="rounded-md border border-border bg-muted p-1">
                  <TabsTrigger value="docker">docker</TabsTrigger>
                  <TabsTrigger value="podman">podman</TabsTrigger>
                  <TabsTrigger value="none">无</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {renderField('fingerprint', '主机密钥指纹', (
            <div className="flex gap-2">
              <Input
                id={`${formId}-fingerprint`}
                value={draft.fingerprint}
                placeholder="SHA256:…"
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
                {probing ? '探测中' : '探测指纹'}
              </Button>
            </div>
          ))}
          {probeNote && <p className="text-xs text-muted-foreground">{probeNote}</p>}

          <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
            <legend className="text-[13px] font-medium">采集选项</legend>
            <label htmlFor={`${formId}-systemd`} className="flex items-center gap-2.5 text-[13px]">
              <Switch
                id={`${formId}-systemd`}
                checked={draft.systemd}
                onCheckedChange={(checked) => update('systemd', checked)}
              />
              systemd 日志
            </label>
            <label htmlFor={`${formId}-enabled`} className="flex items-center gap-2.5 text-[13px]">
              <Switch
                id={`${formId}-enabled`}
                checked={draft.enabled}
                onCheckedChange={(checked) => update('enabled', checked)}
              />
              启用监控
            </label>
          </fieldset>

          {serverError && <p role="alert" className="text-xs text-destructive">{serverError}</p>}

          <div className="flex justify-end gap-2">
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
