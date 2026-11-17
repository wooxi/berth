export type HostStatus = 'online' | 'offline' | 'error'

export type HostSnapshot = {
  hostId: string
  label: string
  address: string
  group: string
  role: string
  runtime: 'docker' | 'podman' | 'none'
  systemd: boolean
  status: HostStatus
  error?: string
  fingerprint: string
  os?: string
  kernel?: string
  uptime?: string
  cpuPercent?: number
  cores?: number
  memoryTotalMb?: number
  memoryUsedMb?: number
  memoryPercent?: number
  diskTotalGb?: number
  diskUsedGb?: number
  diskPercent?: number
  load?: [number, number, number]
  collectedAt: string
}

export type ContainerInfo = {
  id: string
  name: string
  image: string
  state: string
  status: string
  ports: string
  created: string
}

export type FileEntry = {
  name: string
  path: string
  type: 'file' | 'directory' | 'symlink' | 'other'
  size: number
  modified: string
  mode: string
  owner: string
}

export type AuditEvent = {
  at: string
  actor: string
  action: string
  hostId: string | null
  outcome: 'allow' | 'deny'
  detail?: string
}

export type ApiError = { error: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  })
  const payload = await response.json().catch(() => ({ error: 'invalid response' })) as T | ApiError
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload ? payload.error : `HTTP ${response.status}`
    throw new Error(message)
  }
  return payload as T
}

export const api = {
  async login(password: string): Promise<void> {
    await request('/api/login', { method: 'POST', body: JSON.stringify({ password }) })
  },
  async logout(): Promise<void> {
    await request('/api/logout', { method: 'POST' })
  },
  getSession: () => request<{ authenticated: boolean; subjectId?: string; expiresAt?: number }>('/api/session'),
  getHosts: () => request<{ hosts: HostSnapshot[] }>('/api/hosts'),
  getContainers: (hostId: string) => request<{ containers: ContainerInfo[] }>(`/api/hosts/${encodeURIComponent(hostId)}/containers`),
  getLogs: (hostId: string, unit: string, lines: number) =>
    request<{ lines: string[] }>(`/api/hosts/${encodeURIComponent(hostId)}/logs?unit=${encodeURIComponent(unit)}&lines=${lines}`),
  getFiles: (hostId: string, path: string) =>
    request<{ ok: true; path: string; entries: FileEntry[] }>(`/api/hosts/${encodeURIComponent(hostId)}/files?path=${encodeURIComponent(path)}`),
  getAudit: (limit = 100) => request<{ events: AuditEvent[] }>(`/api/audit?limit=${limit}`),
}

export function terminalWebSocket(hostId: string, protocols?: string[]): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return new WebSocket(`${protocol}://${window.location.host}/api/terminal?host=${encodeURIComponent(hostId)}`, protocols)
}
