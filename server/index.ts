import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { createAuditSink, type AuditSink } from './audit.ts'
import { createSessionStore, hashPassword, verifyApiToken, verifyPassword, type SessionStore } from './auth.ts'
import { loadConfig, type BerthConfig, type BerthHostConfig } from './config.ts'
import { createCollector, createContainerCollector, createLogCollector } from './collectors.ts'
import { createFileService, isProtectedPath, normalizeRemotePath } from './files.ts'
import { createHost, findHostConfig, updateHost } from './host-admin.ts'
import { openSshConnection, probeHostFingerprint } from './ssh.ts'

const STATIC_ROOT = process.env.YARD_STATIC_ROOT ?? '/app/public'
const PORT = Number(process.env.PORT ?? '8080')
const HOST = process.env.YARD_BIND ?? '127.0.0.1'

const config: BerthConfig = loadConfig()
const audit: AuditSink = createAuditSink(config.auditPath)
const sessions: SessionStore = createSessionStore(config.sessionSecret)
const collector = createCollector(config.privateKeyPath)
const containerCollector = createContainerCollector(config.privateKeyPath)
const logCollector = createLogCollector(config.privateKeyPath)
const files = createFileService(config.privateKeyPath)

const passwordHash = process.env.YARD_PASSWORD_HASH ?? hashPassword(process.env.YARD_PASSWORD ?? '')
const allowedOrigins = new Set((process.env.YARD_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean))

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

function readCookie(request: IncomingMessage, name: string): string | null {
  const header = request.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

function currentSession(request: IncomingMessage) {
  const sessionId = readCookie(request, 'yard_session')
  return sessionId ? sessions.get(sessionId) : null
}

// 无人值守接口令牌：设置 YARD_API_TOKEN 后，脚本可用 Authorization: Bearer 调用主机登记 API。
// 令牌只覆盖主机登记面（list/probe/create/update），文件、终端、日志等其余 API 仍需浏览器会话。
const apiToken = process.env.YARD_API_TOKEN ?? ''

function apiTokenAuthorized(request: IncomingMessage): boolean {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return false
  return verifyApiToken(header.slice(7), apiToken)
}

function isHostAdminRequest(pathname: string, method: string | undefined): boolean {
  if (method === 'GET' || method === 'POST') {
    if (pathname === '/api/hosts' || pathname === '/api/hosts/probe') return true
  }
  if (method === 'GET' && /^\/api\/hosts\/[^/]+\/config$/.test(pathname)) return true
  if (method === 'PUT' && /^\/api\/hosts\/[^/]+$/.test(pathname) && pathname !== '/api/hosts/probe') return true
  return false
}

async function readBodyBuffer(request: IncomingMessage, limit = 8 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new Error('payload too large')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

async function readBody(request: IncomingMessage, limit = 64 * 1024): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new Error('payload too large')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function findHost(hostId: string): BerthHostConfig | null {
  return config.hosts.find((host) => host.id === hostId && host.enabled) ?? null
}

function serveStatic(response: ServerResponse, pathname: string): void {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const target = resolve(join(STATIC_ROOT, normalize(relative)))
  if (!target.startsWith(resolve(STATIC_ROOT))) {
    sendJson(response, 403, { error: 'forbidden' })
    return
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    const fallback = join(STATIC_ROOT, 'index.html')
    if (existsSync(fallback)) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      createReadStream(fallback).pipe(response)
      return
    }
    sendJson(response, 404, { error: 'not found' })
    return
  }
  response.writeHead(200, {
    'content-type': mimeTypes[extname(target)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  createReadStream(target).pipe(response)
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  const pathname = url.pathname

  if (pathname === '/api/health') {
    sendJson(response, 200, { ok: true, hosts: config.hosts.length })
    return
  }

  if (pathname === '/api/login' && request.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(request)) as { password?: string }
      const candidate = typeof body.password === 'string' ? body.password : ''
      if (!candidate || !verifyPassword(candidate, passwordHash)) {
        audit.record({ actor: 'anonymous', action: 'session.login', hostId: null, outcome: 'deny', detail: 'invalid password' })
        sendJson(response, 401, { error: 'invalid credentials' })
        return
      }
      const session = sessions.create('owner')
      audit.record({ actor: session.subjectId, action: 'session.login', hostId: null, outcome: 'allow' })
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'set-cookie': `yard_session=${encodeURIComponent(session.id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8 * 3600}`,
      })
      response.end(JSON.stringify({ ok: true, subjectId: session.subjectId }))
    } catch {
      sendJson(response, 400, { error: 'invalid request' })
    }
    return
  }

  if (pathname === '/api/logout' && request.method === 'POST') {
    const sessionId = readCookie(request, 'yard_session')
    if (sessionId) sessions.destroy(sessionId)
    audit.record({ actor: 'owner', action: 'session.logout', hostId: null, outcome: 'allow' })
    response.writeHead(200, { 'set-cookie': 'yard_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' })
    response.end(JSON.stringify({ ok: true }))
    return
  }

  if (pathname.startsWith('/api/')) {
    const session = currentSession(request)

    // 会话探测是公开的：未登录时返回布尔值而不是 401，避免前端控制台刷网络错误。
    if (pathname === '/api/session') {
      if (!session) {
        sendJson(response, 200, { authenticated: false })
        return
      }
      sendJson(response, 200, { authenticated: true, subjectId: session.subjectId, expiresAt: session.expiresAt })
      return
    }

    if (!session) {
      if (!apiTokenAuthorized(request)) {
        sendJson(response, 401, { error: 'authentication required' })
        return
      }
      if (!isHostAdminRequest(pathname, request.method)) {
        audit.record({ actor: 'api-token', action: 'api.denied', hostId: null, outcome: 'deny', detail: `${request.method} ${pathname}` })
        sendJson(response, 403, { error: 'API token covers the host registry only' })
        return
      }
    }
    const subjectId = session?.subjectId ?? 'api-token'

  if (pathname === '/api/hosts' && request.method === 'GET') {
    const snapshots = await Promise.all(config.hosts.filter((host) => host.enabled).map((host) => collector.collect(host)))
    sendJson(response, 200, { hosts: snapshots })
    return
  }

  if (pathname === '/api/audit' && request.method === 'GET') {
    sendJson(response, 200, { events: audit.recent(Number(url.searchParams.get('limit') ?? 100)) })
    return
  }

  if (pathname === '/api/hosts' && request.method === 'POST') {
    let payload: unknown
    try {
      payload = JSON.parse(await readBody(request))
    } catch {
      sendJson(response, 400, { error: 'invalid request' })
      return
    }
    const result = createHost(config, payload)
    audit.record({
      actor: subjectId,
      action: 'hosts.create',
      hostId: result.ok ? result.host.id : null,
      outcome: result.ok ? 'allow' : 'deny',
      detail: result.ok ? `${result.host.address}:${result.host.port}` : result.error,
    })
    if (result.ok) {
      sendJson(response, 201, { host: result.host })
    } else {
      sendJson(response, result.status, { error: result.error, issues: result.issues })
    }
    return
  }

  if (pathname === '/api/hosts/probe' && request.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(request)) as { address?: unknown; port?: unknown }
      const address = typeof body.address === 'string' ? body.address.trim() : ''
      const port = typeof body.port === 'number' && Number.isInteger(body.port) && body.port >= 1 && body.port <= 65535
        ? body.port
        : 22
      if (!address) throw new Error('缺少 address')
      const result = await probeHostFingerprint(address, port)
      audit.record({
        actor: subjectId,
        action: 'hosts.probe',
        hostId: null,
        outcome: result.ok ? 'allow' : 'deny',
        detail: `${address}:${port}${result.ok ? ` → ${result.fingerprint.slice(0, 17)}…` : ` → ${result.reason}`}`,
      })
      sendJson(response, result.ok ? 200 : 502, result.ok ? { fingerprint: result.fingerprint } : { error: result.reason })
    } catch (error) {
      sendJson(response, 400, { error: (error as Error).message })
    }
    return
  }

  const hostConfigMatch = pathname.match(/^\/api\/hosts\/([^/]+)\/config$/)
  if (hostConfigMatch && request.method === 'GET') {
    const host = findHostConfig(config, hostConfigMatch[1])
    if (!host) {
      sendJson(response, 404, { error: 'unknown host' })
      return
    }
    sendJson(response, 200, { host })
    return
  }

  const hostUpdateMatch = pathname.match(/^\/api\/hosts\/([^/]+)$/)
  if (hostUpdateMatch && request.method === 'PUT') {
    const hostId = decodeURIComponent(hostUpdateMatch[1])
    let payload: unknown
    try {
      payload = JSON.parse(await readBody(request))
    } catch {
      sendJson(response, 400, { error: 'invalid request' })
      return
    }
    const result = updateHost(config, hostId, payload)
    audit.record({
      actor: subjectId,
      action: 'hosts.update',
      hostId: result.ok ? result.host.id : hostId,
      outcome: result.ok ? 'allow' : 'deny',
      detail: result.ok ? `${result.host.address}:${result.host.port}` : result.error,
    })
    if (result.ok) {
      sendJson(response, 200, { host: result.host })
    } else {
      sendJson(response, result.status, { error: result.error, issues: result.issues })
    }
    return
  }

  const containerMatch = pathname.match(/^\/api\/hosts\/([^/]+)\/containers$/)
  if (containerMatch && request.method === 'GET') {
    const host = findHost(containerMatch[1])
    if (!host) {
      sendJson(response, 404, { error: 'unknown host' })
      return
    }
    const result = await containerCollector.list(host)
    audit.record({
      actor: subjectId,
      action: 'containers.list',
      hostId: host.id,
      outcome: result.ok ? 'allow' : 'deny',
      detail: result.ok ? undefined : result.reason,
    })
    sendJson(response, result.ok ? 200 : 502, result.ok ? { containers: result.containers } : { error: result.reason })
    return
  }

  const logMatch = pathname.match(/^\/api\/hosts\/([^/]+)\/logs$/)
  if (logMatch && request.method === 'GET') {
    const host = findHost(logMatch[1])
    if (!host) {
      sendJson(response, 404, { error: 'unknown host' })
      return
    }
    const unit = url.searchParams.get('unit') ?? 'docker.service'
    const lines = Number(url.searchParams.get('lines') ?? '120')
    const result = await logCollector.tail(host, unit, Number.isFinite(lines) ? lines : 120)
    audit.record({
      actor: subjectId,
      action: 'logs.read',
      hostId: host.id,
      outcome: result.ok ? 'allow' : 'deny',
      detail: result.ok ? unit : result.reason,
    })
    sendJson(response, result.ok ? 200 : 502, result.ok ? { lines: result.lines } : { error: result.reason })
    return
  }

  const fileRoute = pathname.match(/^\/api\/hosts\/([^/]+)\/files(?:\/([a-z]+))?$/)
  if (fileRoute) {
    const host = findHost(fileRoute[1])
    if (!host) {
      sendJson(response, 404, { error: 'unknown host' })
      return
    }
    const sub = fileRoute[2] ?? 'list'
    const requestedPath = url.searchParams.get('path') ?? '/root'

    if (sub === 'list' && request.method === 'GET') {
      const result = await files.list(host, requestedPath)
      audit.record({
        actor: subjectId,
        action: 'files.list',
        hostId: host.id,
        outcome: result.ok ? 'allow' : 'deny',
        detail: result.ok ? result.path : result.reason,
      })
      sendJson(response, result.ok ? 200 : 502, result.ok ? result : { error: result.reason })
      return
    }

    if (sub === 'read' && request.method === 'GET') {
      const result = await files.read(host, requestedPath)
      audit.record({
        actor: subjectId,
        action: 'files.read',
        hostId: host.id,
        outcome: result.ok ? 'allow' : 'deny',
        detail: result.ok ? result.path : result.reason,
      })
      sendJson(response, result.ok ? 200 : 502, result.ok ? result : { error: result.reason })
      return
    }

    if (sub === 'download' && request.method === 'GET') {
      const result = await files.openDownload(host, requestedPath)
      audit.record({
        actor: subjectId,
        action: 'files.download',
        hostId: host.id,
        outcome: result.ok ? 'allow' : 'deny',
        detail: result.ok ? normalizeRemotePath(requestedPath) : result.reason,
      })
      if (!result.ok) {
        sendJson(response, 502, { error: result.reason })
        return
      }
      const name = normalizeRemotePath(requestedPath).split('/').pop() ?? 'download'
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': String(result.size),
        'content-disposition': `attachment; filename="${name.replace(/["\\]/g, '_')}"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      })
      result.stream.pipe(response)
      return
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      try {
        if (sub === 'upload') {
          const name = url.searchParams.get('name') ?? ''
          const directory = url.searchParams.get('dir') ?? '/root'
          const data = await readBodyBuffer(request)
          const result = await files.upload(host, directory, name, data)
          audit.record({
            actor: subjectId,
            action: 'files.upload',
            hostId: host.id,
            outcome: result.ok ? 'allow' : 'deny',
            detail: result.ok ? `${normalizeRemotePath(directory)}/${name}` : result.reason,
          })
          sendJson(response, result.ok ? 200 : 400, result.ok ? result : { error: result.reason })
          return
        }

        const payload = JSON.parse(await readBody(request)) as Record<string, unknown>
        const asString = (value: unknown) => (typeof value === 'string' ? value : '')

        if (sub === 'write') {
          const target = asString(payload.path)
          if (!target) throw new Error('缺少 path')
          const result = await files.write(host, target, asString(payload.content))
          audit.record({
            actor: subjectId,
            action: 'files.write',
            hostId: host.id,
            outcome: result.ok ? 'allow' : 'deny',
            detail: result.ok ? normalizeRemotePath(target) : result.reason,
          })
          sendJson(response, result.ok ? 200 : 400, result.ok ? result : { error: result.reason })
          return
        }

        if (sub === 'mkdir') {
          const parent = asString(payload.path)
          const name = asString(payload.name)
          const result = await files.mkdir(host, parent, name)
          audit.record({
            actor: subjectId,
            action: 'files.mkdir',
            hostId: host.id,
            outcome: result.ok ? 'allow' : 'deny',
            detail: result.ok ? `${normalizeRemotePath(parent)}/${name}` : result.reason,
          })
          sendJson(response, result.ok ? 200 : 400, result.ok ? result : { error: result.reason })
          return
        }

        if (sub === 'rename') {
          const from = asString(payload.from)
          const to = asString(payload.to)
          const result = await files.rename(host, from, to)
          audit.record({
            actor: subjectId,
            action: 'files.rename',
            hostId: host.id,
            outcome: result.ok ? 'allow' : 'deny',
            detail: result.ok ? `${normalizeRemotePath(from)} → ${normalizeRemotePath(to)}` : result.reason,
          })
          sendJson(response, result.ok ? 200 : 400, result.ok ? result : { error: result.reason })
          return
        }

        if (sub === 'delete') {
          const target = asString(payload.path)
          if (isProtectedPath(target)) {
            audit.record({ actor: subjectId, action: 'files.delete', hostId: host.id, outcome: 'deny', detail: 'system runtime path' })
            sendJson(response, 400, { error: '系统运行时目录不允许删除' })
            return
          }
          const recursive = payload.recursive === true
          const result = await files.remove(host, target, recursive)
          audit.record({
            actor: subjectId,
            action: 'files.delete',
            hostId: host.id,
            outcome: result.ok ? 'allow' : 'deny',
            detail: result.ok ? `${normalizeRemotePath(target)}${recursive ? ' (递归)' : ''}` : result.reason,
          })
          sendJson(response, result.ok ? 200 : 400, result.ok ? result : { error: result.reason })
          return
        }

        if (sub === 'copy' || sub === 'move') {
          const from = asString(payload.from)
          const to = asString(payload.to)
          const result = sub === 'copy' ? await files.copy(host, from, to) : await files.move(host, from, to)
          audit.record({
            actor: subjectId,
            action: `files.${sub}`,
            hostId: host.id,
            outcome: result.ok ? 'allow' : 'deny',
            detail: result.ok ? `${normalizeRemotePath(from)} → ${normalizeRemotePath(to)}` : result.reason,
          })
          sendJson(response, result.ok ? 200 : 400, result.ok ? result : { error: result.reason })
          return
        }

        if (sub === 'chmod') {
          const target = asString(payload.path)
          const mode = asString(payload.mode)
          const result = await files.chmod(host, target, mode)
          audit.record({
            actor: subjectId,
            action: 'files.chmod',
            hostId: host.id,
            outcome: result.ok ? 'allow' : 'deny',
            detail: result.ok ? `${normalizeRemotePath(target)} → ${mode}` : result.reason,
          })
          sendJson(response, result.ok ? 200 : 400, result.ok ? result : { error: result.reason })
          return
        }

        if (sub === 'touch') {
          const parent = asString(payload.path)
          const name = asString(payload.name)
          const result = await files.touch(host, parent, name)
          audit.record({
            actor: subjectId,
            action: 'files.touch',
            hostId: host.id,
            outcome: result.ok ? 'allow' : 'deny',
            detail: result.ok ? `${normalizeRemotePath(parent)}/${name}` : result.reason,
          })
          sendJson(response, result.ok ? 200 : 400, result.ok ? result : { error: result.reason })
          return
        }
      } catch (error) {
        sendJson(response, 400, { error: (error as Error).message })
        return
      }
    }
  }

    sendJson(response, 404, { error: 'unknown endpoint' })
    return
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    serveStatic(response, pathname)
    return
  }

  sendJson(response, 405, { error: 'method not allowed' })
})

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  if (url.pathname !== '/api/terminal') {
    socket.destroy()
    return
  }
  const origin = request.headers.origin
  if (allowedOrigins.size > 0 && typeof origin === 'string' && !allowedOrigins.has(origin)) {
    socket.destroy()
    return
  }
  const session = currentSession(request)
  if (!session) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }
  const host = findHost(url.searchParams.get('host') ?? '')
  if (!host) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
    return
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    void handleTerminal(ws, host, session.subjectId)
  })
})

async function handleTerminal(ws: WebSocket, host: BerthHostConfig, subjectId: string): Promise<void> {
  const result = await openSshConnection(host, { privateKeyPath: config.privateKeyPath })
  if (!result.ok) {
    audit.record({ actor: subjectId, action: 'terminal.open', hostId: host.id, outcome: 'deny', detail: result.reason })
    ws.send(JSON.stringify({ type: 'error', message: result.reason }))
    ws.close(4001, 'connect failed')
    return
  }

  audit.record({ actor: subjectId, action: 'terminal.open', hostId: host.id, outcome: 'allow' })
  const connection = result.connection

  connection.client.shell({ term: 'xterm-256color', cols: 120, rows: 32 }, (error, stream) => {
    if (error) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }))
      ws.close(4002, 'shell failed')
      return
    }

    ws.send(JSON.stringify({ type: 'ready', host: host.id, label: host.label }))
    stream.on('data', (chunk: Buffer) => {
      ws.send(JSON.stringify({ type: 'output', data: chunk.toString('utf8') }))
    })
    stream.stderr.on('data', (chunk: Buffer) => {
      ws.send(JSON.stringify({ type: 'output', data: chunk.toString('utf8') }))
    })

    ws.on('message', (raw) => {
      let parsed: { type?: string; data?: string }
      try {
        parsed = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (parsed.type === 'input' && typeof parsed.data === 'string') {
        stream.write(parsed.data)
      }
      if (parsed.type === 'resize' && typeof parsed.data === 'string') {
        const [cols, rows] = parsed.data.split(':').map(Number)
        if (Number.isInteger(cols) && Number.isInteger(rows)) {
          stream.setWindow(rows, cols, 0, 0)
        }
      }
    })

    const cleanup = () => {
      audit.record({ actor: subjectId, action: 'terminal.close', hostId: host.id, outcome: 'allow' })
      stream.end()
      connection.client.end()
    }
    ws.on('close', cleanup)
    ws.on('error', cleanup)
  })
}

server.listen(PORT, HOST, () => {
  console.log(`berth server listening on ${HOST}:${PORT} with ${config.hosts.length} registered hosts`)
})
