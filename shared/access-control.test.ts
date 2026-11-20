import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authorize, type PermissionAction, type PermissionGrant } from './access-control.ts'

const makeRequest = (action: unknown, resourceId = 'host-a') => ({
  subjectId: 'user-owner',
  resourceId,
  action,
  requestId: 'req-001',
  occurredAt: '2026-11-16T00:00:00.000Z',
})

const makeGrant = (level: PermissionGrant['level'], resourceId = 'host-a'): PermissionGrant => ({
  subjectId: 'user-owner',
  resourceId,
  level,
})

function decision(level: PermissionGrant['level'], action: PermissionAction, resourceId = 'host-a') {
  return authorize(makeRequest(action, resourceId), [makeGrant(level, resourceId)])
}

test('View grants read-only host, telemetry, logs, and file access', () => {
  assert.equal(decision('view', 'metrics.read').allowed, true)
  assert.equal(decision('view', 'files.list').allowed, true)
  assert.equal(decision('view', 'files.write').allowed, false)
})

test('Connect grants only an SSH session opening action', () => {
  assert.equal(decision('connect', 'ssh.session.open').allowed, true)
  assert.equal(decision('connect', 'host.read').allowed, false)
  const unknown = authorize(makeRequest('shell.exec'), [makeGrant('connect')])
  assert.equal(unknown.allowed, false)
  assert.equal(unknown.audit.reason, 'invalid_action')
})

test('Edit does not imply host or credential management', () => {
  assert.equal(decision('edit', 'files.write').allowed, true)
  assert.equal(decision('edit', 'containers.control').allowed, true)
  assert.equal(decision('edit', 'hosts.manage').allowed, false)
})

test('Manage grants administration but not unlisted shell execution', () => {
  assert.equal(decision('manage', 'shares.manage').allowed, true)
  const unknown = authorize(makeRequest('shell.exec'), [makeGrant('manage')])
  assert.equal(unknown.allowed, false)
  assert.equal(unknown.audit.reason, 'invalid_action')
})

test('grants are scoped to one subject and resource', () => {
  const result = authorize(makeRequest('metrics.read', 'host-b'), [makeGrant('view', 'host-a')])
  assert.equal(result.allowed, false)
  assert.equal(result.audit.reason, 'no_grant')
})

test('duplicate grants fail closed and produce a secret-free audit event', () => {
  const result = authorize(makeRequest('metrics.read'), [makeGrant('view'), makeGrant('manage')])
  assert.equal(result.allowed, false)
  assert.equal(result.audit.reason, 'ambiguous_grants')
  assert.deepEqual(Object.keys(result.audit).sort(), [
    'action', 'decision', 'occurredAt', 'reason', 'requestId', 'resourceId', 'subjectId', 'level',
  ].sort())
})
