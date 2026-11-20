import type { SFTPWrapper } from 'ssh2'
import type { BerthHostConfig } from './config.ts'
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

export type FileListing = { ok: true; path: string; entries: FileEntry[] } | { ok: false; reason: string }
export type FileRead =
  | { ok: true; path: string; content: string; size: number; truncated: boolean; binary: boolean }
  | { ok: false; reason: string }
export type FileOp = { ok: true } | { ok: false; reason: string }

/**
 * 只拦系统运行时目录：这些目录在系统运行中被删会立即导致内核或内核态组件异常，
 * 且不属于文件管理范畴。其余路径（/etc、/usr、/var 等）按"完整权限"处理，
 * 由前端二次确认与审计兜底。
 */
const PROTECTED_PATHS = new Set(['/', '/proc', '/sys', '/dev', '/run'])

const MAX_PREVIEW_BYTES = 512 * 1024
const MAX_WRITE_BYTES = 4 * 1024 * 1024

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** 规范化远端绝对路径，消掉 `.` 与 `..`，不透传客户端原始串 */
export function normalizeRemotePath(input: string, currentPath = '/root'): string {
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

export function isProtectedPath(path: string): boolean {
  const clean = normalizeRemotePath(path)
  if (PROTECTED_PATHS.has(clean)) return true
  return clean.split('/').filter(Boolean).length === 0
}

/** 文件名不得含路径分隔符或控制字符 */
export function isValidEntryName(name: string): boolean {
  if (!name || name.length > 255) return false
  if (name === '.' || name === '..') return false
  return !/[/\\\u0000-\u001f]/.test(name)
}

export function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 4096)
  if (sample.includes(0)) return true
  let control = 0
  for (const byte of sample) {
    if (byte < 7 || (byte > 13 && byte < 32)) control += 1
  }
  return control / Math.max(sample.length, 1) > 0.1
}

type Handle = { client: import('ssh2').Client; sftp: SFTPWrapper }

async function withSftp<T>(host: BerthHostConfig, keyPath: string, run: (handle: Handle) => Promise<T>): Promise<T | { ok: false; reason: string }> {
  const result = await openSshConnection(host, { privateKeyPath: keyPath })
  if (!result.ok) return { ok: false, reason: result.reason }
  const client = result.connection.client

  try {
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((error, wrapper) => (error ? reject(error) : resolve(wrapper)))
    })
    return await run({ client, sftp })
  } catch (error) {
    return { ok: false, reason: (error as Error).message }
  } finally {
    client.end()
  }
}

type SftpLike = SFTPWrapper

function sftpCall<T>(run: (done: (error: Error | undefined, value?: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    run((error, value) => (error ? reject(error) : resolve(value as T)))
  })
}

async function removeRecursive(sftp: SftpLike, target: string, depth = 0): Promise<void> {
  if (depth > 64) throw new Error('目录层级过深')
  const stats = await sftpCall<{ directory: boolean }>((done) => {
    sftp.lstat(target, (error, attrs) => done(error ?? undefined, { directory: attrs?.isDirectory() ?? false }))
  })
  if (!stats.directory) {
    await sftpCall<void>((done) => sftp.unlink(target, (error) => done(error ?? undefined)))
    return
  }
  const children = await sftpCall<{ filename: string }[]>((done) => {
    sftp.readdir(target, (error, list) => done(error ?? undefined, list ?? []))
  })
  for (const child of children) {
    if (child.filename === '.' || child.filename === '..') continue
    await removeRecursive(sftp, `${target.replace(/\/$/, '')}/${child.filename}`, depth + 1)
  }
  await sftpCall<void>((done) => sftp.rmdir(target, (error) => done(error ?? undefined)))
}

async function copyRecursive(sftp: SftpLike, from: string, to: string, depth = 0): Promise<void> {
  if (depth > 64) throw new Error('目录层级过深')
  const stats = await sftpCall<{ directory: boolean }>((done) => {
    sftp.lstat(from, (error, attrs) => done(error ?? undefined, { directory: attrs?.isDirectory() ?? false }))
  })
  if (stats.directory) {
    await sftpCall<void>((done) => sftp.mkdir(to, { mode: 0o755 }, (error) => done(error ?? undefined)))
    const children = await sftpCall<{ filename: string }[]>((done) => {
      sftp.readdir(from, (error, list) => done(error ?? undefined, list ?? []))
    })
    for (const child of children) {
      if (child.filename === '.' || child.filename === '..') continue
      await copyRecursive(sftp, `${from.replace(/\/$/, '')}/${child.filename}`, `${to.replace(/\/$/, '')}/${child.filename}`, depth + 1)
    }
    return
  }
  await new Promise<void>((resolve, reject) => {
    const read = sftp.createReadStream(from)
    const write = sftp.createWriteStream(to)
    read.on('error', reject)
    write.on('error', reject)
    write.on('close', () => resolve())
    read.pipe(write)
  })
}

export type FileService = {
  list: (host: BerthHostConfig, path: string) => Promise<FileListing>
  read: (host: BerthHostConfig, path: string) => Promise<FileRead>
  write: (host: BerthHostConfig, path: string, content: string) => Promise<FileOp>
  mkdir: (host: BerthHostConfig, parent: string, name: string) => Promise<FileOp>
  rename: (host: BerthHostConfig, from: string, to: string) => Promise<FileOp>
  remove: (host: BerthHostConfig, path: string, recursive?: boolean) => Promise<FileOp>
  copy: (host: BerthHostConfig, from: string, to: string) => Promise<FileOp>
  move: (host: BerthHostConfig, from: string, to: string) => Promise<FileOp>
  chmod: (host: BerthHostConfig, path: string, mode: string) => Promise<FileOp>
  touch: (host: BerthHostConfig, directory: string, name: string) => Promise<FileOp>
  upload: (host: BerthHostConfig, directory: string, name: string, data: Buffer) => Promise<FileOp>
  openDownload: (host: BerthHostConfig, path: string) => Promise<{ ok: true; stream: NodeJS.ReadableStream; size: number } | { ok: false; reason: string }>
}

export function createFileService(privateKeyPath: string): FileService {
  return {
    async list(host, requestedPath) {
      const path = normalizeRemotePath(requestedPath)
      const result = await openSshConnection(host, { privateKeyPath })
      if (!result.ok) return { ok: false, reason: result.reason }

      try {
        const output = await runCommand(
          result.connection,
          `LC_ALL=C ls -la --time-style=long-iso ${quoteForShell(path)} 2>&1`,
          15000,
        )
        if (!output.ok) return { ok: false, reason: output.reason }
        if (output.stderr.trim()) return { ok: false, reason: output.stderr.trim().split('\n')[0] }
        // stderr 已被 2>&1 合并进 stdout：成功输出必以 total 开头，否则首行就是错误
        if (!output.stdout.startsWith('total ')) {
          const first = output.stdout.split('\n').find((line) => line.trim())
          return { ok: false, reason: first?.trim() || '目录不可读' }
        }

        const entries: FileEntry[] = []
        for (const line of output.stdout.split('\n').slice(1)) {
          if (!line.trim()) continue
          const match = line.match(/^([bcdlps-][rwxSsTt-]{9})\s+\d+\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/)
          if (!match) continue
          const [, mode, owner, group, size, modified, time, name] = match
          if (name === '.' || name === '..') continue
          const type = mode.startsWith('d') ? 'directory' : mode.startsWith('l') ? 'symlink' : mode.startsWith('-') ? 'file' : 'other'
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
        entries.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : b.type === 'directory' ? 1 : 0
          return a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
        })
        return { ok: true, path, entries }
      } finally {
        result.connection.client.end()
      }
    },

    async read(host, requestedPath) {
      const path = normalizeRemotePath(requestedPath)
      const outcome = await withSftp(host, privateKeyPath, async ({ sftp }) => {
        const attrs = await new Promise<{ size: number }>((resolve, reject) => {
          sftp.stat(path, (error, stats) => (error ? reject(error) : resolve(stats)))
        })
        const limit = Math.min(attrs.size, MAX_PREVIEW_BYTES)
        const buffer = await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = []
          const stream = sftp.createReadStream(path, { start: 0, end: Math.max(limit - 1, 0) })
          stream.on('data', (chunk: Buffer) => chunks.push(chunk))
          stream.on('error', reject)
          stream.on('end', () => resolve(Buffer.concat(chunks)))
        })
        const binary = looksBinary(buffer)
        return {
          ok: true as const,
          path,
          content: binary ? '' : buffer.toString('utf8'),
          size: attrs.size,
          truncated: attrs.size > limit,
          binary,
        }
      })
      return outcome as FileRead
    },

    async write(host, requestedPath, content) {
      const path = normalizeRemotePath(requestedPath)
      const buffer = Buffer.from(content, 'utf8')
      if (buffer.byteLength > MAX_WRITE_BYTES) return { ok: false, reason: '内容超过 4MB 上限' }
      const outcome = await withSftp(host, privateKeyPath, async ({ sftp }) => {
        await new Promise<void>((resolve, reject) => {
          sftp.writeFile(path, buffer, (error) => (error ? reject(error) : resolve()))
        })
        return { ok: true as const }
      })
      return outcome as FileOp
    },

    async mkdir(host, parent, name) {
      if (!isValidEntryName(name)) return { ok: false, reason: '名称不合法' }
      const target = `${normalizeRemotePath(parent).replace(/\/$/, '')}/${name}`
      const outcome = await withSftp(host, privateKeyPath, async ({ sftp }) => {
        await new Promise<void>((resolve, reject) => {
          sftp.mkdir(target, { mode: 0o755 }, (error) => (error ? reject(error) : resolve()))
        })
        return { ok: true as const }
      })
      return outcome as FileOp
    },

    async rename(host, from, to) {
      const source = normalizeRemotePath(from)
      const target = normalizeRemotePath(to)
      if (isProtectedPath(source)) return { ok: false, reason: '该路径受保护，不能重命名' }
      const outcome = await withSftp(host, privateKeyPath, async ({ sftp }) => {
        await new Promise<void>((resolve, reject) => {
          sftp.rename(source, target, (error) => (error ? reject(error) : resolve()))
        })
        return { ok: true as const }
      })
      return outcome as FileOp
    },

    async remove(host, requestedPath, recursive = false) {
      const path = normalizeRemotePath(requestedPath)
      if (isProtectedPath(path)) return { ok: false, reason: '系统运行时目录不允许删除' }
      const outcome = await withSftp(host, privateKeyPath, async ({ sftp }) => {
        const stats = await sftpCall<{ directory: boolean }>((done) => {
          sftp.lstat(path, (error, attrs) => done(error ?? undefined, { directory: attrs?.isDirectory() ?? false }))
        })
        if (!stats.directory) {
          await sftpCall<void>((done) => sftp.unlink(path, (error) => done(error ?? undefined)))
          return { ok: true as const }
        }
        if (recursive) {
          await removeRecursive(sftp, path)
          return { ok: true as const }
        }
        const children = await sftpCall<{ filename: string }[]>((done) => {
          sftp.readdir(path, (error, list) => done(error ?? undefined, list ?? []))
        })
        const visible = children.filter((child) => child.filename !== '.' && child.filename !== '..')
        if (visible.length > 0) throw new Error(`目录非空（${visible.length} 项），请勾选递归删除`)
        await sftpCall<void>((done) => sftp.rmdir(path, (error) => done(error ?? undefined)))
        return { ok: true as const }
      })
      return outcome as FileOp
    },

    async copy(host, from, to) {
      const source = normalizeRemotePath(from)
      const target = normalizeRemotePath(to)
      if (source === target) return { ok: false, reason: '源与目标相同' }
      if (target.startsWith(`${source}/`)) return { ok: false, reason: '不能复制到自身内部' }
      const outcome = await withSftp(host, privateKeyPath, async ({ sftp }) => {
        await copyRecursive(sftp, source, target)
        return { ok: true as const }
      })
      return outcome as FileOp
    },

    async move(host, from, to) {
      const source = normalizeRemotePath(from)
      const target = normalizeRemotePath(to)
      if (isProtectedPath(source)) return { ok: false, reason: '系统运行时目录不允许移动' }
      if (source === target) return { ok: false, reason: '源与目标相同' }
      if (target.startsWith(`${source}/`)) return { ok: false, reason: '不能移动到自身内部' }
      const outcome = await withSftp(host, privateKeyPath, async ({ sftp }) => {
        try {
          await sftpCall<void>((done) => sftp.rename(source, target, (error) => done(error ?? undefined)))
        } catch {
          // 跨文件系统时 rename 会失败，退化为复制后删除
          await copyRecursive(sftp, source, target)
          await removeRecursive(sftp, source)
        }
        return { ok: true as const }
      })
      return outcome as FileOp
    },

    async chmod(host, requestedPath, mode) {
      const path = normalizeRemotePath(requestedPath)
      const parsed = Number.parseInt(mode, 8)
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0o7777) return { ok: false, reason: '权限值不合法' }
      const outcome = await withSftp(host, privateKeyPath, async ({ sftp }) => {
        await sftpCall<void>((done) => sftp.chmod(path, parsed, (error) => done(error ?? undefined)))
        return { ok: true as const }
      })
      return outcome as FileOp
    },

    async touch(host, directory, name) {
      if (!isValidEntryName(name)) return { ok: false, reason: '文件名不合法' }
      const target = `${normalizeRemotePath(directory).replace(/\/$/, '')}/${name}`
      const outcome = await withSftp(host, privateKeyPath, async ({ sftp }) => {
        await sftpCall<void>((done) => sftp.writeFile(target, '', (error) => done(error ?? undefined)))
        return { ok: true as const }
      })
      return outcome as FileOp
    },

    async upload(host, directory, name, data) {
      if (!isValidEntryName(name)) return { ok: false, reason: '文件名不合法' }
      if (data.byteLength > MAX_WRITE_BYTES) return { ok: false, reason: '文件超过 4MB 上限' }
      const target = `${normalizeRemotePath(directory).replace(/\/$/, '')}/${name}`
      const outcome = await withSftp(host, privateKeyPath, async ({ sftp }) => {
        await new Promise<void>((resolve, reject) => {
          sftp.writeFile(target, data, (error) => (error ? reject(error) : resolve()))
        })
        return { ok: true as const }
      })
      return outcome as FileOp
    },

    async openDownload(host, requestedPath) {
      const path = normalizeRemotePath(requestedPath)
      const result = await openSshConnection(host, { privateKeyPath })
      if (!result.ok) return { ok: false, reason: result.reason }

      try {
        const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
          result.connection.client.sftp((error, wrapper) => (error ? reject(error) : resolve(wrapper)))
        })
        const attrs = await new Promise<{ size: number; directory: boolean }>((resolve, reject) => {
          sftp.stat(path, (error, stats) => (error ? reject(error) : resolve({ size: stats.size, directory: stats.isDirectory() })))
        })
        if (attrs.directory) {
          result.connection.client.end()
          return { ok: false, reason: '目录不支持直接下载' }
        }
        const stream = sftp.createReadStream(path)
        stream.on('close', () => result.connection.client.end())
        stream.on('error', () => result.connection.client.end())
        return { ok: true, stream, size: attrs.size }
      } catch (error) {
        result.connection.client.end()
        return { ok: false, reason: (error as Error).message }
      }
    },
  }
}


