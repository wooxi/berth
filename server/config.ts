import { readFileSync } from 'node:fs'
import { hostname } from 'node:os'

export type YardHostConfig = {
  id: string
  label: string
  address: string
  port: number
  username: string
  fingerprint: string
  group: string
  role: string
  runtime: 'docker' | 'podman' | 'none'
  systemd: boolean
  enabled: boolean
}

export type YardConfig = {
  hosts: YardHostConfig[]
  auditPath: string
  privateKeyPath: string
  knownHostsPath: string
  sessionSecret: string
  maxConcurrentSessions: number
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`missing required environment variable: ${name}`)
  return value
}

export function loadConfig(): YardConfig {
  const hostsPath = requireEnv('YARD_HOSTS_FILE', '/app/config/hosts.json')
  const parsed = JSON.parse(readFileSync(hostsPath, 'utf8')) as { hosts?: unknown }
  if (!Array.isArray(parsed.hosts)) throw new Error('hosts.json must contain a hosts array')

  const hosts: YardHostConfig[] = parsed.hosts.map((entry, index) => {
    const host = entry as Partial<YardHostConfig>
    if (typeof host.id !== 'string' || !host.id) throw new Error(`host ${index} is missing an id`)
    if (typeof host.address !== 'string' || !host.address) throw new Error(`host ${host.id} is missing an address`)
    if (typeof host.fingerprint !== 'string' || !host.fingerprint.startsWith('SHA256:')) {
      throw new Error(`host ${host.id} must pin a SHA256 host key fingerprint`)
    }
    return {
      id: host.id,
      label: host.label ?? host.id,
      address: host.address,
      port: host.port ?? 22,
      username: host.username ?? 'root',
      fingerprint: host.fingerprint,
      group: host.group ?? 'default',
      role: host.role ?? 'server',
      runtime: host.runtime ?? 'none',
      systemd: host.systemd ?? false,
      enabled: host.enabled ?? true,
    }
  })

  return {
    hosts,
    auditPath: requireEnv('YARD_AUDIT_FILE', '/app/data/audit.log'),
    privateKeyPath: requireEnv('YARD_SSH_KEY', '/run/secrets/yard_ssh_key'),
    knownHostsPath: requireEnv('YARD_KNOWN_HOSTS', '/run/secrets/yard_known_hosts'),
    sessionSecret: requireEnv('YARD_SESSION_SECRET'),
    maxConcurrentSessions: Number(process.env.YARD_MAX_SESSIONS ?? '6'),
  }
}

export function localIdentity(): string {
  return `${hostname()}:${process.pid}`
}
