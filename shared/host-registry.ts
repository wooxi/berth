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
