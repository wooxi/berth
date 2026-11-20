import { writeFileSync } from 'node:fs'
import type { BerthConfig, BerthHostConfig } from './config.ts'
import { validateHostAdminDraft, type HostAdminDraft, type DraftFieldIssue } from '../shared/host-registry.ts'

export type AdminHostResult =
  | { ok: true; host: BerthHostConfig; issues?: undefined }
  | { ok: false; status: number; error: string; issues?: DraftFieldIssue[] }

function toHostConfig(draft: HostAdminDraft): BerthHostConfig {
  return {
    id: draft.id,
    label: draft.label,
    address: draft.address,
    port: draft.port,
    username: draft.username,
    fingerprint: draft.fingerprint,
    group: draft.group,
    role: draft.role,
    runtime: draft.runtime,
    systemd: draft.systemd,
    enabled: draft.enabled,
  }
}

/**
 * Persist the registry in place (open + truncate + write).  Deliberately NOT a
 * temp-file rename: hosts.json is typically a single-file bind mount, and
 * renaming would leave the container writing to a detached inode (same hazard
 * the README warns about for dist/).
 */
function persist(config: BerthConfig, hosts: BerthHostConfig[]): { ok: true } | { ok: false; status: number; error: string } {
  try {
    writeFileSync(config.hostsPath, `${JSON.stringify({ hosts }, null, 2)}\n`, 'utf8')
    config.hosts = hosts
    return { ok: true }
  } catch (error) {
    return { ok: false, status: 500, error: `写入 hosts.json 失败：${(error as Error).message}` }
  }
}

export function createHost(config: BerthConfig, payload: unknown): AdminHostResult {
  const draft = validateHostAdminDraft(payload)
  if (!draft.ok) {
    return { ok: false, status: 400, error: '主机信息未通过校验', issues: draft.issues }
  }
  if (config.hosts.some((host) => host.id === draft.host.id)) {
    return { ok: false, status: 409, error: `主机标识 ${draft.host.id} 已登记` }
  }
  const host = toHostConfig(draft.host)
  const result = persist(config, [...config.hosts, host])
  return result.ok ? { ...result, host } : result
}

export function updateHost(config: BerthConfig, hostId: string, payload: unknown): AdminHostResult {
  const draft = validateHostAdminDraft(payload)
  if (!draft.ok) {
    return { ok: false, status: 400, error: '主机信息未通过校验', issues: draft.issues }
  }
  if (draft.host.id !== hostId) {
    return { ok: false, status: 400, error: '不允许修改主机标识' }
  }
  const index = config.hosts.findIndex((host) => host.id === hostId)
  if (index === -1) {
    return { ok: false, status: 404, error: `未登记主机 ${hostId}` }
  }
  const host = toHostConfig(draft.host)
  const next = [...config.hosts]
  next[index] = host
  const result = persist(config, next)
  return result.ok ? { ...result, host } : result
}

export function findHostConfig(config: BerthConfig, hostId: string): BerthHostConfig | null {
  return config.hosts.find((host) => host.id === hostId) ?? null
}
