import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  resolveRegisteredHost,
  verifyPinnedFingerprint,
  type RegisteredHost,
} from './host-registry.ts'

const fingerprint = `SHA256:${'A'.repeat(43)}`
const auditContext = { requestId: 'req-101', occurredAt: '2026-11-16T00:00:00.000Z' }

const host: RegisteredHost = {
  id: 'edge-01',
  label: 'Edge server',
  address: '192.0.2.60',
  port: 22,
  username: 'yard-reader',
  expectedFingerprint: fingerprint,
}

test('only resolves a unique, valid registered host id', () => {
  const result = resolveRegisteredHost('edge-01', [host], auditContext)
  assert.equal(result.target?.address, '192.0.2.60')
  assert.equal(result.audit.reason, 'resolved')
  assert.equal(result.audit.event, 'target.resolved')
})

test('rejects unknown or ambiguous host ids', () => {
  const unknown = resolveRegisteredHost('unlisted', [host], auditContext)
  const duplicate = resolveRegisteredHost('edge-01', [host, host], auditContext)
  assert.equal(unknown.target, null)
  assert.equal(unknown.audit.reason, 'unknown_host')
  assert.equal(duplicate.target, null)
  assert.equal(duplicate.audit.reason, 'duplicate_host_id')
})

test('rejects invalid endpoint records and root accounts', () => {
  const invalid = { ...host, username: 'root' }
  const result = resolveRegisteredHost('edge-01', [invalid], auditContext)
  assert.equal(result.target, null)
  assert.equal(result.audit.reason, 'invalid_host_record')
})

test('fails closed on malformed registry rows', () => {
  const result = resolveRegisteredHost('edge-01', [null, { id: 'edge-01' }], auditContext)
  assert.equal(result.target, null)
  assert.equal(result.audit.reason, 'invalid_host_record')
})

test('accepts only the pinned SSH fingerprint', () => {
  const match = verifyPinnedFingerprint(host, fingerprint, auditContext)
  const mismatch = verifyPinnedFingerprint(host, `SHA256:${'B'.repeat(43)}`, auditContext)
  assert.equal(match.allowed, true)
  assert.equal(match.audit.reason, 'fingerprint_match')
  assert.equal(mismatch.allowed, false)
  assert.equal(mismatch.audit.reason, 'fingerprint_mismatch')
})

test('rejects malformed fingerprints and emits secret-free audit metadata', () => {
  const malformed = verifyPinnedFingerprint(host, 'not-a-fingerprint', auditContext)
  assert.equal(malformed.allowed, false)
  assert.equal(malformed.audit.reason, 'invalid_presented_fingerprint')
  assert.deepEqual(Object.keys(malformed.audit).sort(), [
    'event', 'hostId', 'occurredAt', 'reason', 'requestId',
  ].sort())
})
