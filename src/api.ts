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

export type FilePreview = {
  ok: true
  path: string
  content: string
  size: number
  truncated: boolean
  binary: boolean
}

export type FileOpResult = { ok: true }

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
  readFile: (hostId: string, path: string) =>
    request<FilePreview>(`/api/hosts/${encodeURIComponent(hostId)}/files/read?path=${encodeURIComponent(path)}`),
  saveFile: (hostId: string, path: string, content: string) =>
    request<FileOpResult>(`/api/hosts/${encodeURIComponent(hostId)}/files/write`, {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    }),
  makeDir: (hostId: string, path: string, name: string) =>
    request<FileOpResult>(`/api/hosts/${encodeURIComponent(hostId)}/files/mkdir`, {
      method: 'POST',
      body: JSON.stringify({ path, name }),
    }),
  renamePath: (hostId: string, from: string, to: string) =>
    request<FileOpResult>(`/api/hosts/${encodeURIComponent(hostId)}/files/rename`, {
      method: 'POST',
      body: JSON.stringify({ from, to }),
    }),
  deletePath: (hostId: string, path: string, recursive = false) =>
    request<FileOpResult>(`/api/hosts/${encodeURIComponent(hostId)}/files/delete`, {
      method: 'POST',
      body: JSON.stringify({ path, recursive }),
    }),
  copyPath: (hostId: string, from: string, to: string) =>
    request<FileOpResult>(`/api/hosts/${encodeURIComponent(hostId)}/files/copy`, {
      method: 'POST',
      body: JSON.stringify({ from, to }),
    }),
  movePath: (hostId: string, from: string, to: string) =>
    request<FileOpResult>(`/api/hosts/${encodeURIComponent(hostId)}/files/move`, {
      method: 'POST',
      body: JSON.stringify({ from, to }),
    }),
  chmodPath: (hostId: string, path: string, mode: string) =>
    request<FileOpResult>(`/api/hosts/${encodeURIComponent(hostId)}/files/chmod`, {
      method: 'POST',
      body: JSON.stringify({ path, mode }),
    }),
  touchFile: (hostId: string, path: string, name: string) =>
    request<FileOpResult>(`/api/hosts/${encodeURIComponent(hostId)}/files/touch`, {
      method: 'POST',
      body: JSON.stringify({ path, name }),
    }),
  uploadFile: (hostId: string, dir: string, name: string, file: File) =>
    request<FileOpResult>(
      `/api/hosts/${encodeURIComponent(hostId)}/files/upload?dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(name)}`,
      { method: 'POST', body: file, headers: { 'content-type': 'application/octet-stream' } },
    ),
  downloadUrl: (hostId: string, path: string) =>
    `/api/hosts/${encodeURIComponent(hostId)}/files/download?path=${encodeURIComponent(path)}`,
  getAudit: (limit = 100) => request<{ events: AuditEvent[] }>(`/api/audit?limit=${limit}`),
}

export function terminalWebSocket(hostId: string, protocols?: string[]): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return new WebSocket(`${protocol}://${window.location.host}/api/terminal?host=${encodeURIComponent(hostId)}`, protocols)
}
