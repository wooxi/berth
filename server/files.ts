import type { YardHostConfig } from './config.ts'
import { openSshConnection, runCommand } from './ssh.ts'

export type FileEntry = {
  name: string
  path: string
  type: 'file' | 'directory' | 'symlink' | 'other'
  size: number
  modified: string
  mode: string
  owner: string
}

export type FileListing =
  | { ok: true; path: string; entries: FileEntry[] }
  | { ok: false; reason: string }

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function normalizeRemotePath(input: string, currentPath: string): string {
  const raw = (input || '').trim()
  if (!raw) return currentPath
  const combined = raw.startsWith('/') ? raw : `${currentPath.replace(/\/$/, '')}/${raw}`
  const segments: string[] = []
  for (const segment of combined.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return `/${segments.join('/')}`
}

export function createFileLister(privateKeyPath: string) {
  return {
    async list(host: YardHostConfig, requestedPath: string): Promise<FileListing> {
      const path = normalizeRemotePath(requestedPath, '/root')
      const result = await openSshConnection(host, { privateKeyPath })
      if (!result.ok) return { ok: false, reason: result.reason }

      try {
        const script = `LC_ALL=C ls -la --time-style=long-iso ${quoteForShell(path)} 2>&1`
        const output = await runCommand(result.connection, script, 15000)
        if (!output.ok) return { ok: false, reason: output.reason }
        if (output.stderr.trim()) return { ok: false, reason: output.stderr.trim().split('\n')[0] }

        const entries: FileEntry[] = []
        for (const line of output.stdout.split('\n').slice(1)) {
          if (!line.trim()) continue
          const match = line.match(/^([bcdlps-][rwxSsTt-]{9})\s+\d+\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/)
          if (!match) continue
          const [, mode, owner, group, size, modified, time, name] = match
          const type = mode.startsWith('d') ? 'directory' : mode.startsWith('l') ? 'symlink' : mode.startsWith('-') ? 'file' : 'other'
          if (name === '.' || name === '..') continue
          entries.push({
            name,
            path: `${path.replace(/\/$/, '')}/${name}`,
            type,
            size: Number(size),
            modified: `${time} ${modified}`,
            mode: mode.slice(1),
            owner: `${owner}:${group}`,
          })
        }
        return { ok: true, path, entries }
      } finally {
        result.connection.client.end()
      }
    },
  }
}
