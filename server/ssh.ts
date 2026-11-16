import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from 'ssh2'
import type { YardHostConfig } from './config.ts'

export type HostKeyCheck =
  | { ok: true; fingerprint: string }
  | { ok: false; reason: 'fingerprint_mismatch' | 'invalid_pinned_fingerprint'; presented: string }

export function fingerprintOf(keyBlob: Buffer): string {
  const digest = createHash('sha256').update(keyBlob).digest('base64').replace(/=+$/, '')
  return `SHA256:${digest}`
}

export function checkHostKey(pinned: string, keyBlob: Buffer): HostKeyCheck {
  const presented = fingerprintOf(keyBlob)
  if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(pinned)) {
    return { ok: false, reason: 'invalid_pinned_fingerprint', presented }
  }
  if (pinned !== presented) {
    return { ok: false, reason: 'fingerprint_mismatch', presented }
  }
  return { ok: true, fingerprint: presented }
}

export type SshConnection = {
  host: YardHostConfig
  client: Client
  fingerprint: string
}

export type SshConnectResult =
  | { ok: true; connection: SshConnection }
  | { ok: false; reason: string; presentedFingerprint?: string }

export type SshClientOptions = {
  privateKeyPath: string
  connectTimeoutMs?: number
}

export function openSshConnection(host: YardHostConfig, options: SshClientOptions): Promise<SshConnectResult> {
  return new Promise((resolve) => {
    const client = new Client()
    let settled = false

    const finish = (result: SshConnectResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    client.on('ready', () => {
      finish({ ok: true, connection: { host, client, fingerprint: host.fingerprint } })
    })

    client.on('error', (error: Error) => {
      client.end()
      finish({ ok: false, reason: error.message })
    })

    try {
      client.connect({
        host: host.address,
        port: host.port,
        username: host.username,
        privateKey: readFileSync(options.privateKeyPath),
        hostVerifier: (keyBlob: Buffer) => checkHostKey(host.fingerprint, keyBlob).ok,
        readyTimeout: options.connectTimeoutMs ?? 8000,
        keepaliveInterval: 15000,
      })
    } catch (error) {
      finish({ ok: false, reason: (error as Error).message })
    }
  })
}

export type CommandResult = { ok: true; stdout: string; stderr: string; code: number } | { ok: false; reason: string }

export function runCommand(connection: SshConnection, command: string, timeoutMs = 12000): Promise<CommandResult> {
  return new Promise((resolve) => {
    connection.client.exec(command, (error, stream) => {
      if (error) {
        resolve({ ok: false, reason: error.message })
        return
      }
      const timer = setTimeout(() => {
        stream.close()
        resolve({ ok: false, reason: 'command timed out' })
      }, timeoutMs)
      let stdout = ''
      let stderr = ''
      stream.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
      stream.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
      stream.on('close', (code: number | null) => {
        clearTimeout(timer)
        resolve({ ok: true, stdout, stderr, code: code ?? 0 })
      })
    })
  })
}
