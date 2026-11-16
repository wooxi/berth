import type { YardHostConfig } from './config.ts'
import { openSshConnection, runCommand, type SshConnection } from './ssh.ts'

export type HostSnapshot = {
  hostId: string
  label: string
  address: string
  group: string
  role: string
  runtime: YardHostConfig['runtime']
  systemd: boolean
  status: 'online' | 'offline' | 'error'
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

const METRICS_SCRIPT = `LC_ALL=C bash -c '
  echo "OS=$( (. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") || echo unknown )"
  echo "KERNEL=$(uname -sr)"
  echo "UPTIME=$(awk "{print int(\\$1/86400)\"d \"int((\\$1%86400)/3600)\"h \"int((\\$1%3600)/60)\"m\"}" /proc/uptime 2>/dev/null)"
  echo "CORES=$(nproc 2>/dev/null || echo 1)"
  echo "LOAD=$(cut -d" " -f1-3 /proc/loadavg 2>/dev/null)"
  echo "MEMTOTAL=$(awk "/MemTotal/{print int(\\$2/1024)}" /proc/meminfo 2>/dev/null)"
  echo "MEMAVAIL=$(awk "/MemAvailable/{print int(\\$2/1024)}" /proc/meminfo 2>/dev/null)"
  echo "DISKTOTAL=$(df -Pk / 2>/dev/null | awk "NR==2{print int(\\$2/1048576)}")"
  echo "DISKUSED=$(df -Pk / 2>/dev/null | awk "NR==2{print int((\\$3)/1048576)}")"
  echo "CPU=$(awk "/^cpu /{idle=\\$5+\\$6; total=0; for(i=2;i<=NF;i++) total+=\\$i; print total, idle}" /proc/stat)"
  sleep 1
  echo "CPU2=$(awk "/^cpu /{idle=\\$5+\\$6; total=0; for(i=2;i<=NF;i++) total+=\\$i; print total, idle}" /proc/stat)"
'`

function parseNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const value = Number(raw.trim())
  return Number.isFinite(value) ? value : undefined
}

export function parseMetrics(output: string): Partial<HostSnapshot> {
  const values = new Map<string, string>()
  for (const line of output.split('\n')) {
    const separator = line.indexOf('=')
    if (separator === -1) continue
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim())
  }

  const cpuFirst = values.get('CPU')?.split(/\s+/).map(Number) ?? []
  const cpuSecond = values.get('CPU2')?.split(/\s+/).map(Number) ?? []
  let cpuPercent: number | undefined
  if (cpuFirst.length === 2 && cpuSecond.length === 2) {
    const totalDelta = cpuSecond[0] - cpuFirst[0]
    const idleDelta = cpuSecond[1] - cpuFirst[1]
    if (totalDelta > 0) cpuPercent = Math.round(((totalDelta - idleDelta) / totalDelta) * 100)
  }

  const memoryTotalMb = parseNumber(values.get('MEMTOTAL'))
  const memoryAvailableMb = parseNumber(values.get('MEMAVAIL'))
  const diskTotalGb = parseNumber(values.get('DISKTOTAL'))
  const diskUsedGb = parseNumber(values.get('DISKUSED'))
  const loadParts = values.get('LOAD')?.split(/\s+/).map(Number) ?? []

  const snapshot: Partial<HostSnapshot> = {
    os: values.get('OS'),
    kernel: values.get('KERNEL'),
    uptime: values.get('UPTIME'),
    cores: parseNumber(values.get('CORES')),
    cpuPercent,
  }
  if (memoryTotalMb !== undefined) {
    snapshot.memoryTotalMb = memoryTotalMb
    if (memoryAvailableMb !== undefined) {
      snapshot.memoryUsedMb = memoryTotalMb - memoryAvailableMb
      snapshot.memoryPercent = Math.round(((memoryTotalMb - memoryAvailableMb) / memoryTotalMb) * 100)
    }
  }
  if (diskTotalGb !== undefined && diskTotalGb > 0) {
    snapshot.diskTotalGb = diskTotalGb
    snapshot.diskUsedGb = diskUsedGb
    snapshot.diskPercent = Math.round(((diskUsedGb ?? 0) / diskTotalGb) * 100)
  }
  if (loadParts.length === 3) snapshot.load = [loadParts[0], loadParts[1], loadParts[2]]
  return snapshot
}

export type Collector = {
  collect: (host: YardHostConfig) => Promise<HostSnapshot>
}

export function createCollector(privateKeyPath: string): Collector {
  return {
    async collect(host) {
      const base: HostSnapshot = {
        hostId: host.id,
        label: host.label,
        address: host.address,
        group: host.group,
        role: host.role,
        runtime: host.runtime,
        systemd: host.systemd,
        status: 'offline',
        fingerprint: host.fingerprint,
        collectedAt: new Date().toISOString(),
      }

      const result = await openSshConnection(host, { privateKeyPath })
      if (!result.ok) {
        return { ...base, status: 'error', error: result.reason }
      }

      const connection: SshConnection = result.connection
      try {
        const metrics = await runCommand(connection, METRICS_SCRIPT, 15000)
        if (!metrics.ok) return { ...base, status: 'error', error: metrics.reason }
        return { ...base, status: 'online', ...parseMetrics(metrics.stdout) }
      } finally {
        connection.client.end()
      }
    },
  }
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

export type ContainerCollector = {
  list: (host: YardHostConfig) => Promise<{ ok: true; containers: ContainerInfo[] } | { ok: false; reason: string }>
}

const CONTAINER_SCRIPT = (runtime: 'docker' | 'podman' | 'none') => `LC_ALL=C ${runtime === 'podman' ? 'podman' : 'docker'} ps -a --format '{{json .}}' 2>/dev/null || true`

export function createContainerCollector(privateKeyPath: string): ContainerCollector {
  return {
    async list(host) {
      if (host.runtime === 'none') return { ok: true, containers: [] }
      const result = await openSshConnection(host, { privateKeyPath })
      if (!result.ok) return { ok: false, reason: result.reason }
      try {
        const output = await runCommand(result.connection, CONTAINER_SCRIPT(host.runtime), 15000)
        if (!output.ok) return { ok: false, reason: output.reason }
        const containers: ContainerInfo[] = []
        for (const line of output.stdout.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const raw = JSON.parse(trimmed) as Record<string, string>
            containers.push({
              id: raw.ID ?? raw.Id ?? '',
              name: raw.Names ?? raw.Name ?? '',
              image: raw.Image ?? '',
              state: (raw.State ?? '').toLowerCase(),
              status: raw.Status ?? '',
              ports: raw.Ports ?? '',
              created: raw.CreatedAt ?? raw.Created ?? '',
            })
          } catch {
            continue
          }
        }
        return { ok: true, containers }
      } finally {
        result.connection.client.end()
      }
    },
  }
}

export type LogCollector = {
  tail: (host: YardHostConfig, unit: string, lines: number) => Promise<{ ok: true; lines: string[] } | { ok: false; reason: string }>
}

export function createLogCollector(privateKeyPath: string): LogCollector {
  return {
    async tail(host, unit, lines) {
      if (!host.systemd) return { ok: true, lines: [] }
      const safeUnit = unit.replace(/[^A-Za-z0-9._@-]/g, '')
      const safeLines = Math.min(Math.max(lines, 1), 500)
      const result = await openSshConnection(host, { privateKeyPath })
      if (!result.ok) return { ok: false, reason: result.reason }
      try {
        const output = await runCommand(
          result.connection,
          `journalctl -u ${safeUnit || 'docker.service'} -n ${safeLines} --no-pager 2>/dev/null || true`,
          15000,
        )
        if (!output.ok) return { ok: false, reason: output.reason }
        return { ok: true, lines: output.stdout.split('\n').filter((line) => line.length > 0) }
      } finally {
        result.connection.client.end()
      }
    },
  }
}
