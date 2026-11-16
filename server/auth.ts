import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export type Session = {
  id: string
  subjectId: string
  createdAt: number
  expiresAt: number
}

export type SessionStore = {
  create: (subjectId: string) => Session
  get: (sessionId: string) => Session | null
  destroy: (sessionId: string) => void
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000

export function createSessionStore(secret: string): SessionStore {
  const sessions = new Map<string, Session>()

  function sign(value: string): string {
    return createHash('sha256').update(`${secret}:${value}`).digest('hex')
  }

  return {
    create(subjectId) {
      const id = randomBytes(24).toString('base64url')
      const now = Date.now()
      const session: Session = { id, subjectId, createdAt: now, expiresAt: now + SESSION_TTL_MS }
      sessions.set(`${sign(id)}:${id}`, session)
      return session
    },
    get(sessionId) {
      if (!sessionId) return null
      const key = `${sign(sessionId)}:${sessionId}`
      const session = sessions.get(key)
      if (!session) return null
      if (session.expiresAt < Date.now()) {
        sessions.delete(key)
        return null
      }
      return session
    },
    destroy(sessionId) {
      sessions.delete(`${sign(sessionId)}:${sessionId}`)
    },
  }
}

export function verifyPassword(candidate: string, expectedHash: string): boolean {
  const candidateHash = createHash('sha256').update(candidate).digest('hex')
  const candidateBuffer = Buffer.from(candidateHash, 'hex')
  const expectedBuffer = Buffer.from(expectedHash, 'hex')
  if (candidateBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(candidateBuffer, expectedBuffer)
}

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}
