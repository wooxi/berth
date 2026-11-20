import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifyApiToken, hashPassword, verifyPassword } from './auth.ts'

const secret = 'a-very-private-token-value'

test('accepts the exact bearer token', () => {
  assert.equal(verifyApiToken(secret, secret), true)
})

test('rejects wrong or empty candidates', () => {
  assert.equal(verifyApiToken('guess', secret), false)
  assert.equal(verifyApiToken('', secret), false)
  assert.equal(verifyApiToken(secret, ''), false)
  assert.equal(verifyApiToken(secret.slice(0, -1), secret), false)
  assert.equal(verifyApiToken(secret + 'x', secret), false)
})

test('password helpers stay consistent with token verification', () => {
  assert.equal(verifyPassword('hunter2', hashPassword('hunter2')), true)
  assert.equal(verifyPassword('hunter3', hashPassword('hunter2')), false)
})
