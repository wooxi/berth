import { appendFileSync } from 'node:fs'

export type AuditEvent = {
  at: string
  actor: string
  action: string
  hostId: string | null
  outcome: 'allow' | 'deny'
  detail?: string
}

export type AuditSink = {
  record: (event: Omit<AuditEvent, 'at'>) => void
  recent: (limit?: number) => AuditEvent[]
}

export function createAuditSink(path: string, keepInMemory = 500): AuditSink {
  const buffer: AuditEvent[] = []

  return {
    record(event) {
      const full: AuditEvent = { at: new Date().toISOString(), ...event }
      buffer.push(full)
      if (buffer.length > keepInMemory) buffer.splice(0, buffer.length - keepInMemory)
      try {
        appendFileSync(path, `${JSON.stringify(full)}\n`, { mode: 0o600 })
      } catch (error) {
        console.error('audit write failed', error)
      }
    },
    recent(limit = 100) {
      return buffer.slice(-limit).reverse()
    },
  }
}
