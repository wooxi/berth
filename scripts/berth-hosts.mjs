#!/usr/bin/env node
// Berth 主机登记 CLI：token 或口令登录，add / edit / probe / list。
// 凭据一律走环境变量（BERTH_API_TOKEN / BERTH_PASSWORD），不落明文参数。
//
// 用法示例：
//   BERTH_API_TOKEN=xxx node scripts/berth-hosts.mjs add --id lab-01 --label "Lab node" --address 192.0.2.10 --probe
//   BERTH_PASSWORD=xxx  node scripts/berth-hosts.mjs edit lab-01 --group Lab
//   node scripts/berth-hosts.mjs list | probe --address 192.0.2.10

const URL_BASE = process.env.BERTH_URL ?? 'http://192.168.100.6:5180'

function parseArgs(argv) {
  const positionals = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token.startsWith('--no-')) { flags[token.slice(5)] = false; continue }
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) { flags[key] = true }
      else { flags[key] = next; i++ }
      continue
    }
    positionals.push(token)
  }
  return { positionals, flags }
}

function usage() {
  console.log(`用法: node scripts/berth-hosts.mjs <command> [options]

  list                                            列出已登记主机
  probe  --address <host> [--port <n>]            探测 SSH 主机密钥指纹
  add    --id <id> --label <名称> --address <host> [options]
         [--port 22] [--username root] [--group default] [--role server]
         [--runtime docker|podman|none] [--systemd|--no-systemd] [--enabled|--no-enabled]
         [--fingerprint SHA256:... | --probe]     登记新服务器
  edit   <id> [同上可改字段] [--probe]            编辑既有服务器（标识不可改）

环境变量: BERTH_URL(默认 ${URL_BASE})  BERTH_API_TOKEN(优先) 或 BERTH_PASSWORD`)
  process.exit(2)
}

async function auth() {
  const headers = {}
  if (process.env.BERTH_API_TOKEN) {
    headers.authorization = `Bearer ${process.env.BERTH_API_TOKEN}`
    return headers
  }
  if (!process.env.BERTH_PASSWORD) {
    console.error('需要 BERTH_API_TOKEN 或 BERTH_PASSWORD')
    process.exit(1)
  }
  const response = await fetch(`${URL_BASE}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: process.env.BERTH_PASSWORD }),
  })
  if (!response.ok) {
    console.error(`登录失败: HTTP ${response.status}`)
    process.exit(1)
  }
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]
  if (!cookie) { console.error('未拿到会话 cookie'); process.exit(1) }
  headers.cookie = cookie
  return headers
}

async function call(path, options, authHeaders) {
  const response = await fetch(`${URL_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders, ...(options.body ? { 'content-type': 'application/json' } : {}) },
  })
  const payload = await response.json().catch(() => ({ error: 'invalid response' }))
  if (!response.ok) {
    const issues = payload.issues?.map((issue) => `  · ${issue.field}: ${issue.message}`).join('\n')
    throw new Error(`HTTP ${response.status} ${payload.error ?? ''}${issues ? `\n${issues}` : ''}`)
  }
  return payload
}

function draftFromFlags(flags, base) {
  const draft = { ...base }
  const set = (key, value) => { if (value !== undefined && value !== true) draft[key] = value }
  set('id', flags.id)
  set('label', flags.label)
  set('address', flags.address)
  if (flags.port !== undefined) draft.port = Number(flags.port)
  set('username', flags.username)
  set('fingerprint', flags.fingerprint)
  set('group', flags.group)
  set('role', flags.role)
  set('runtime', flags.runtime)
  if (flags.systemd !== undefined) draft.systemd = Boolean(flags.systemd)
  if (flags.enabled !== undefined) draft.enabled = Boolean(flags.enabled)
  return draft
}

const { positionals, flags } = parseArgs(process.argv.slice(2))
const command = positionals[0]
if (!command) usage()

const authHeaders = await auth()

if (command === 'list') {
  const { hosts } = await call('/api/hosts', {}, authHeaders)
  for (const host of hosts) {
    console.log(`${host.hostId.padEnd(12)} ${host.status.padEnd(8)} ${host.address}  ${host.label}`)
  }
  process.exit(0)
}

if (command === 'probe') {
  if (!flags.address) usage()
  const { fingerprint } = await call('/api/hosts/probe', {
    method: 'POST',
    body: JSON.stringify({ address: flags.address, port: flags.port === undefined ? 22 : Number(flags.port) }),
  }, authHeaders)
  console.log(fingerprint)
  process.exit(0)
}

if (command === 'add' || command === 'edit') {
  const isEdit = command === 'edit'
  if (isEdit && !positionals[1]) usage()
  if (!isEdit && (!flags.id || !flags.label || !flags.address)) usage()

  let draft
  if (isEdit) {
    const { host } = await call(`/api/hosts/${encodeURIComponent(positionals[1])}/config`, {}, authHeaders)
    draft = draftFromFlags(flags, host)
    draft.id = host.id
  } else {
    draft = draftFromFlags(flags, {
      id: flags.id, label: flags.label, address: flags.address,
      port: 22, username: 'root', fingerprint: '', group: 'default', role: 'server',
      runtime: 'none', systemd: true, enabled: true,
    })
  }

  if (flags.probe || !draft.fingerprint) {
    if (!draft.address) { console.error('缺 address，无法探测指纹'); process.exit(1) }
    const { fingerprint } = await call('/api/hosts/probe', {
      method: 'POST', body: JSON.stringify({ address: draft.address, port: draft.port }),
    }, authHeaders)
    draft.fingerprint = fingerprint
    console.log(`已探测指纹: ${fingerprint}`)
  }

  const result = isEdit
    ? await call(`/api/hosts/${encodeURIComponent(draft.id)}`, { method: 'PUT', body: JSON.stringify(draft) }, authHeaders)
    : await call('/api/hosts', { method: 'POST', body: JSON.stringify(draft) }, authHeaders)
  console.log(`${isEdit ? '已保存' : '已登记'} ${result.host.id} (${result.host.label})`)
  process.exit(0)
}

usage()
