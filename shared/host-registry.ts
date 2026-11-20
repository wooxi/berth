export type RegisteredHost = {
  id: string
  label: string
  address: string
  port: number
  username: string
  expectedFingerprint: string
}

export type RegistryReason = 'resolved' | 'unknown_host' | 'duplicate_host_id' | 'invalid_host_record'

export type RegistryResolution = {
  target: RegisteredHost | null
  audit: {
    event: 'target.resolved' | 'target.denied'
    hostId: string
    requestId: string
    occurredAt: string
    reason: RegistryReason
  }
}

export type HostKeyReason = 'fingerprint_match' | 'fingerprint_mismatch' | 'invalid_pinned_fingerprint' | 'invalid_presented_fingerprint'

export type HostKeyVerification = {
  allowed: boolean
  audit: {
    event: 'host_key.verified' | 'host_key.rejected'
    hostId: string
    requestId: string
    occurredAt: string
    reason: HostKeyReason
  }
}

const HOST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const DNS_OR_IPV4_PATTERN = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$/
const USERNAME_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/
const SHA256_FINGERPRINT_PATTERN = /^SHA256:[A-Za-z0-9+/]{43}$/

function hasHostId(value: unknown, hostId: string): boolean {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && 'id' in value
    && value.id === hostId
}

function isValidHostRecord(value: unknown): value is RegisteredHost {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const host = value as Record<string, unknown>
  return typeof host.id === 'string'
    && HOST_ID_PATTERN.test(host.id)
    && typeof host.label === 'string'
    && host.label.trim().length > 0
    && host.label.length <= 80
    && typeof host.address === 'string'
    && DNS_OR_IPV4_PATTERN.test(host.address)
    && typeof host.port === 'number'
    && Number.isInteger(host.port)
    && host.port >= 1
    && host.port <= 65535
    && typeof host.username === 'string'
    && USERNAME_PATTERN.test(host.username)
    && host.username !== 'root'
    && typeof host.expectedFingerprint === 'string'
    && SHA256_FINGERPRINT_PATTERN.test(host.expectedFingerprint)
}

/** Resolve only administrator-registered host IDs. Callers must not pass arbitrary client endpoints. */
export function resolveRegisteredHost(
  hostId: string,
  registry: readonly unknown[],
  auditContext: { requestId: string; occurredAt: string },
): RegistryResolution {
  const matches = registry.filter((host) => hasHostId(host, hostId))
  let reason: RegistryReason
  let target: RegisteredHost | null = null

  if (matches.length === 0) {
    reason = 'unknown_host'
  } else if (matches.length > 1) {
    reason = 'duplicate_host_id'
  } else if (!isValidHostRecord(matches[0])) {
    reason = 'invalid_host_record'
  } else {
    reason = 'resolved'
    target = { ...matches[0] }
  }

  return {
    target,
    audit: {
      event: target ? 'target.resolved' : 'target.denied',
      hostId,
      requestId: auditContext.requestId,
      occurredAt: auditContext.occurredAt,
      reason,
    },
  }
}

/* ---------------------------------------------------------------
   主机登记草稿（管理界面 / API 共用）
   与 RegisteredHost 校验并行：这里管“登记什么”，前者管“能不能连”。
   --------------------------------------------------------------- */

export type HostRuntime = 'docker' | 'podman' | 'none'

export type HostAdminDraft = {
  id: string
  label: string
  address: string
  port: number
  username: string
  fingerprint: string
  group: string
  role: string
  runtime: HostRuntime
  systemd: boolean
  enabled: boolean
}

export type DraftFieldIssue = { field: keyof HostAdminDraft; message: string }

export type DraftValidation =
  | { ok: true; host: HostAdminDraft }
  | { ok: false; issues: DraftFieldIssue[] }

const RUNTIMES: readonly HostRuntime[] = ['docker', 'podman', 'none']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate a host registration draft submitted from the admin UI or API. */
export function validateHostAdminDraft(value: unknown): DraftValidation {
  const issues: DraftFieldIssue[] = []
  const source = isRecord(value) ? value : {}
  const text = (key: keyof HostAdminDraft): unknown => source[key]

  const id = text('id')
  if (typeof id !== 'string' || !HOST_ID_PATTERN.test(id)) {
    issues.push({ field: 'id', message: '标识仅限字母、数字与 . _ -，不超过 64 字符，以字母或数字开头' })
  }

  const label = text('label')
  if (typeof label !== 'string' || label.trim().length === 0 || label.length > 80) {
    issues.push({ field: 'label', message: '显示名必填，不超过 80 字符' })
  }

  const address = text('address')
  if (typeof address !== 'string' || !DNS_OR_IPV4_PATTERN.test(address)) {
    issues.push({ field: 'address', message: '地址必须是合法的域名或 IPv4' })
  }

  const port = text('port')
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    issues.push({ field: 'port', message: '端口必须是 1–65535 的整数' })
  }

  const username = text('username')
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    issues.push({ field: 'username', message: '用户名以小写字母或下划线开头，仅限小写字母、数字、下划线与连字符' })
  }

  const fingerprint = text('fingerprint')
  if (typeof fingerprint !== 'string' || !SHA256_FINGERPRINT_PATTERN.test(fingerprint)) {
    issues.push({ field: 'fingerprint', message: '指纹必须是 SHA256: 开头的 43 位 base64（可用“探测指纹”自动获取）' })
  }

  const group = text('group')
  if (typeof group !== 'string' || group.trim().length === 0 || group.length > 40) {
    issues.push({ field: 'group', message: '分组必填，不超过 40 字符' })
  }

  const role = text('role')
  if (typeof role !== 'string' || role.trim().length === 0 || role.length > 80) {
    issues.push({ field: 'role', message: '用途必填，不超过 80 字符' })
  }

  const runtime = text('runtime')
  if (typeof runtime !== 'string' || !RUNTIMES.includes(runtime as HostRuntime)) {
    issues.push({ field: 'runtime', message: '容器运行时只能是 docker / podman / none' })
  }

  if (typeof text('systemd') !== 'boolean') {
    issues.push({ field: 'systemd', message: 'systemd 开关必须是布尔值' })
  }

  if (typeof text('enabled') !== 'boolean') {
    issues.push({ field: 'enabled', message: '启用开关必须是布尔值' })
  }

  if (issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    host: {
      id: id as string,
      label: (label as string).trim(),
      address: address as string,
      port: port as number,
      username: username as string,
      fingerprint: fingerprint as string,
      group: (group as string).trim(),
      role: (role as string).trim(),
      runtime: runtime as HostRuntime,
      systemd: text('systemd') as boolean,
      enabled: text('enabled') as boolean,
    },
  }
}

/** Reject key changes instead of silently trusting a new server identity. */
export function verifyPinnedFingerprint(
  host: Pick<RegisteredHost, 'id' | 'expectedFingerprint'>,
  presentedFingerprint: string,
  auditContext: { requestId: string; occurredAt: string },
): HostKeyVerification {
  let reason: HostKeyReason
  if (!SHA256_FINGERPRINT_PATTERN.test(host.expectedFingerprint)) {
    reason = 'invalid_pinned_fingerprint'
  } else if (!SHA256_FINGERPRINT_PATTERN.test(presentedFingerprint)) {
    reason = 'invalid_presented_fingerprint'
  } else if (host.expectedFingerprint !== presentedFingerprint) {
    reason = 'fingerprint_mismatch'
  } else {
    reason = 'fingerprint_match'
  }

  const allowed = reason === 'fingerprint_match'
  return {
    allowed,
    audit: {
      event: allowed ? 'host_key.verified' : 'host_key.rejected',
      hostId: host.id,
      requestId: auditContext.requestId,
      occurredAt: auditContext.occurredAt,
      reason,
    },
  }
}
