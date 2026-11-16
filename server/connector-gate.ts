import { authorize, type AuthorizationReason, type PermissionGrant } from '../shared/access-control.ts'
import { resolveRegisteredHost, type RegisteredHost, type RegistryReason } from '../shared/host-registry.ts'

const readOnlyActions = ['host.read', 'metrics.read', 'logs.read', 'files.list', 'containers.inspect'] as const
const hostIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const requestKeys = ['action', 'hostId']

type ReadOnlyAction = typeof readOnlyActions[number]

export type TrustedConnectorContext = {
  /** Must come from the authenticated server session, never from the request body. */
  subjectId: string
  registry: readonly unknown[]
  grants: readonly PermissionGrant[]
  /** Generate these on the server for every request. */
  requestId: string
  occurredAt: string
}

export type ConnectorGateReason =
  | 'invalid_request'
  | 'invalid_host_id'
  | 'non_read_action'
  | 'granted'
  | `registry_${RegistryReason}`
  | `permission_${AuthorizationReason}`

export type ConnectorGateResult = {
  allowed: boolean
  target: RegisteredHost | null
  action: ReadOnlyAction | null
  audit: {
    requestId: string
    subjectId: string
    hostId: string | null
    action: ReadOnlyAction | null
    decision: 'allow' | 'deny'
    reason: ConnectorGateReason
    occurredAt: string
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isReadOnlyAction(value: unknown): value is ReadOnlyAction {
  return typeof value === 'string' && readOnlyActions.some((action) => action === value)
}

function result(
  context: TrustedConnectorContext,
  input: { allowed: boolean; target: RegisteredHost | null; hostId: string | null; action: ReadOnlyAction | null; reason: ConnectorGateReason },
): ConnectorGateResult {
  return {
    allowed: input.allowed,
    target: input.allowed ? input.target : null,
    action: input.action,
    audit: {
      requestId: context.requestId,
      subjectId: context.subjectId,
      hostId: input.hostId,
      action: input.action,
      decision: input.allowed ? 'allow' : 'deny',
      reason: input.reason,
      occurredAt: context.occurredAt,
    },
  }
}

/**
 * Validates a read-only request before a future adapter can connect. It accepts a host ID,
 * never an arbitrary address or command. This module itself performs no network I/O.
 */
export function gateReadOnlyRequest(payload: unknown, context: TrustedConnectorContext): ConnectorGateResult {
  if (!isRecord(payload) || Object.keys(payload).sort().join(',') !== requestKeys.join(',')) {
    return result(context, { allowed: false, target: null, hostId: null, action: null, reason: 'invalid_request' })
  }

  const hostId = payload.hostId
  if (typeof hostId !== 'string' || !hostIdPattern.test(hostId)) {
    return result(context, { allowed: false, target: null, hostId: null, action: null, reason: 'invalid_host_id' })
  }

  const action = payload.action
  if (!isReadOnlyAction(action)) {
    return result(context, { allowed: false, target: null, hostId, action: null, reason: 'non_read_action' })
  }

  const resolution = resolveRegisteredHost(hostId, context.registry, {
    requestId: context.requestId,
    occurredAt: context.occurredAt,
  })
  if (!resolution.target) {
    return result(context, { allowed: false, target: null, hostId, action, reason: `registry_${resolution.audit.reason}` })
  }

  const authorization = authorize({
    subjectId: context.subjectId,
    resourceId: hostId,
    action,
    requestId: context.requestId,
    occurredAt: context.occurredAt,
  }, context.grants)

  if (!authorization.allowed) {
    return result(context, { allowed: false, target: null, hostId, action, reason: `permission_${authorization.audit.reason}` })
  }

  return result(context, { allowed: true, target: resolution.target, hostId, action, reason: 'granted' })
}
