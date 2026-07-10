/** In-memory stores — demos and tests only. Production apps map their own tables. */
import crypto from 'crypto'
import type { AuthUser, RotatingSessionStore, StaticSessionStore, UserStore } from './types'

export function createInMemoryUserStore<P = unknown>(): UserStore<P> & {
  all(): AuthUser<P>[]
} {
  const rows: AuthUser<P>[] = []
  const links = new Map<string, string>() // `${provider}:${subject}` → userId
  const passwords = new Map<string, string>()

  return {
    async findById(id) {
      return rows.find((u) => u.id === id) ?? null
    },
    async findByEmail(email) {
      return rows.find((u) => u.email === email) ?? null
    },
    async findByPhone(phone) {
      return rows.find((u) => u.phone === phone) ?? null
    },
    async findByProvider(provider, subject) {
      const userId = links.get(`${provider}:${subject}`)
      return userId ? ((await this.findById(userId)) as AuthUser<P> | null) : null
    },
    async create(data) {
      const user: AuthUser<P> = {
        id: crypto.randomUUID(),
        email: data.email ?? null,
        phone: data.phone ?? null,
        profile: (data.profile ?? {}) as P,
      }
      rows.push(user)
      return user
    },
    async linkProvider(userId, provider, subject) {
      links.set(`${provider}:${subject}`, userId)
    },
    async updateContact(userId, patch) {
      const user = rows.find((u) => u.id === userId)
      if (!user) throw new Error('not found')
      if (patch.email) user.email = patch.email
      if (patch.phone) user.phone = patch.phone
      return user
    },
    async getPasswordHash(userId) {
      return passwords.get(userId) ?? null
    },
    async setPasswordHash(userId, hash) {
      passwords.set(userId, hash)
    },
    all: () => rows,
  }
}

export function createInMemoryRotatingSessionStore(): RotatingSessionStore {
  const active = new Map<string, { userId: string; expiresAt: Date }>()
  return {
    async add(userId, jti, expiresAt) {
      active.set(jti, { userId, expiresAt })
    },
    async isActive(jti) {
      const entry = active.get(jti)
      return !!entry && entry.expiresAt.getTime() > Date.now()
    },
    async revoke(jti) {
      active.delete(jti)
    },
    async revokeAllForUser(userId) {
      for (const [jti, entry] of active) if (entry.userId === userId) active.delete(jti)
    },
  }
}

export function createInMemoryStaticSessionStore(): StaticSessionStore {
  const tokens = new Map<string, string | null>()
  return {
    async set(userId, token) {
      tokens.set(userId, token)
    },
    async get(userId) {
      return tokens.get(userId) ?? null
    },
  }
}
