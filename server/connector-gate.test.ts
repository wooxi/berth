import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gateReadOnlyRequest, type TrustedConnectorContext } from './connector-gate.ts'
import type { RegisteredHost } from '../src/lib/host-registry.ts'
import type { PermissionGrant } from '../shared/access-control.ts'

const host: RegisteredHost = {
  id: 'edge-01',
  label: 'Edge server',
  address: '192.0.2.60',
  port: 22,
  username: 'yard-reader',
  expectedFingerprint: `SHA256:${'A'.repeat(43)}`,
}

const viewGrant: PermissionGrant = { subjectId: 'owner-1', resourceId: host.id, level: 'view' }
const context: TrustedConnectorContext = {
  subjectId: 'owner-1',
  registry: [host],
  grants: [viewGrant],
  requestId: 'req-201',
  occurredAt: '2026-11-16T00:00:00.000Z',
}

test('permits an authorized read-only action using the registered endpoint', () => {
  const result = gateReadOnlyRequest({ hostId: host.id, action: 'metrics.read' }, context)
  assert.equal(result.allowed, true)
  assert.equal(result.target?.address, host.address)
  assert.equal(result.action, 'metrics.read')
  assert.equal(result.audit.reason, 'granted')
})

test('rejects client-supplied addresses, commands, and extra fields', () => {
  const addressOverride = gateReadOnlyRequest({ hostId: host.id, action: 'metrics.read', address: '203.0.113.1' }, context)
  const command = gateReadOnlyRequest({ hostId: host.id, action: 'metrics.read', command: 'id' }, context)
  assert.equal(addressOverride.allowed, false)
  assert.equal(addressOverride.audit.reason, 'invalid_request')
  assert.equal(command.allowed, false)
  assert.equal(command.audit.reason, 'invalid_request')
  assert.equal(command.target, null)
})

test('rejects write actions and interactive shell requests', () => {
  const fileWrite = gateReadOnlyRequest({ hostId: host.id, action: 'files.write' }, context)
  const shell = gateReadOnlyRequest({ hostId: host.id, action: 'shell.exec' }, context)
  assert.equal(fileWrite.allowed, false)
  assert.equal(fileWrite.audit.reason, 'non_read_action')
  assert.equal(shell.allowed, false)
  assert.equal(shell.audit.action, null)
})

test('rejects unregistered hosts and missing view grants', () => {
  const unknownHost = gateReadOnlyRequest({ hostId: 'unlisted', action: 'metrics.read' }, context)
  const noGrant = gateReadOnlyRequest({ hostId: host.id, action: 'metrics.read' }, { ...context, grants: [] })
  assert.equal(unknownHost.allowed, false)
  assert.equal(unknownHost.audit.reason, 'registry_unknown_host')
  assert.equal(noGrant.allowed, false)
  assert.equal(noGrant.audit.reason, 'permission_no_grant')
})

test('audit metadata contains no endpoint, command, or credential fields', () => {
  const result = gateReadOnlyRequest({ hostId: host.id, action: 'metrics.read' }, context)
  assert.deepEqual(Object.keys(result.audit).sort(), [
    'action', 'decision', 'hostId', 'occurredAt', 'reason', 'requestId', 'subjectId',
  ].sort())
})
