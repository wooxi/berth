export type PermissionLevel = 'connect' | 'view' | 'edit' | 'manage'

export type PermissionAction =
  | 'ssh.session.open'
  | 'host.read'
  | 'metrics.read'
  | 'logs.read'
  | 'files.list'
  | 'files.read'
  | 'containers.inspect'
  | 'files.write'
  | 'containers.control'
  | 'hosts.manage'
  | 'credentials.manage'
  | 'shares.manage'

export type PermissionLevelDefinition = {
  id: PermissionLevel
  label: string
  summary: string
  actions: readonly PermissionAction[]
}

export const permissionLevels: readonly PermissionLevelDefinition[] = [
  {
    id: 'connect',
    label: 'Connect',
    summary: '连接已登记主机的 SSH 会话',
    actions: ['ssh.session.open'],
  },
  {
    id: 'view',
    label: 'View',
    summary: '查看状态、指标、日志与文件列表',
    actions: ['host.read', 'metrics.read', 'logs.read', 'files.list', 'files.read', 'containers.inspect'],
  },
  {
    id: 'edit',
    label: 'Edit',
    summary: '编辑已授权文件及有限容器操作',
    actions: ['files.write', 'containers.control'],
  },
  {
    id: 'manage',
    label: 'Manage',
    summary: '管理主机、凭据和共享授权',
    actions: ['hosts.manage', 'credentials.manage', 'shares.manage'],
  },
]

const permissionActions = new Set<PermissionAction>(permissionLevels.flatMap((level) => [...level.actions]))
const permissionLevelIds = new Set<PermissionLevel>(permissionLevels.map((level) => level.id))

export function isPermissionAction(value: unknown): value is PermissionAction {
  return typeof value === 'string' && permissionActions.has(value as PermissionAction)
}

export type PermissionGrant = {
  subjectId: string
  resourceId: string
  level: PermissionLevel
}

export type AuthorizationReason =
  | 'granted'
  | 'no_grant'
  | 'ambiguous_grants'
  | 'action_not_granted'
  | 'invalid_action'
  | 'invalid_grant'

export type AuthorizationRequest = {
  subjectId: string
  resourceId: string
  action: unknown
  requestId: string
  occurredAt: string
}

export type AuthorizationResult = {
  allowed: boolean
  audit: {
    requestId: string
    subjectId: string
    resourceId: string
    action: PermissionAction | 'invalid.action'
    level: PermissionLevel | null
    decision: 'allow' | 'deny'
    reason: AuthorizationReason
    occurredAt: string
  }
}

/**
 * Evaluates one resource-scoped grant. It deliberately fails closed on unknown
 * actions, invalid levels, and duplicate grants, and returns a secret-free audit event.
 */
export function authorize(
  request: AuthorizationRequest,
  grants: readonly PermissionGrant[],
): AuthorizationResult {
  const action = isPermissionAction(request.action) ? request.action : null
  const auditAction: PermissionAction | 'invalid.action' = action ?? 'invalid.action'
  const matchingGrants = grants.filter((grant) =>
    grant.subjectId === request.subjectId && grant.resourceId === request.resourceId,
  )
  const grant = matchingGrants.length === 1 ? matchingGrants[0] : undefined
  const levelIsKnown = grant !== undefined && permissionLevelIds.has(grant.level)

  let reason: AuthorizationReason
  if (action === null) {
    reason = 'invalid_action'
  } else if (matchingGrants.length === 0) {
    reason = 'no_grant'
  } else if (matchingGrants.length > 1) {
    reason = 'ambiguous_grants'
  } else if (!grant || !levelIsKnown) {
    reason = 'invalid_grant'
  } else if (!permissionLevels.find((level) => level.id === grant.level)?.actions.includes(action)) {
    reason = 'action_not_granted'
  } else {
    reason = 'granted'
  }

  const allowed = reason === 'granted'
  return {
    allowed,
    audit: {
      requestId: request.requestId,
      subjectId: request.subjectId,
      resourceId: request.resourceId,
      action: auditAction,
      level: levelIsKnown ? grant.level : null,
      decision: allowed ? 'allow' : 'deny',
      reason,
      occurredAt: request.occurredAt,
    },
  }
}
