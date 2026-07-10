/** In-memory AddressStore — demos and tests only. */
import crypto from 'crypto'
import type { Address, AddressStore } from './types'

export function createInMemoryAddressStore<E = unknown>(): AddressStore<E> {
  const rows: Address<E>[] = []

  return {
    async listByUser(userId) {
      return rows.filter((a) => a.userId === userId)
    },
    async findById(userId, id) {
      return rows.find((a) => a.userId === userId && a.id === id) ?? null
    },
    async create(userId, data) {
      const now = new Date()
      const address: Address<E> = {
        id: crypto.randomUUID(),
        userId,
        label: data.label ?? null,
        line: data.line ?? null,
        lat: data.lat,
        lng: data.lng,
        isDefault: data.isDefault,
        extra: data.extra,
        createdAt: now,
        updatedAt: now,
      }
      rows.push(address)
      return address
    },
    async update(userId, id, data) {
      const address = rows.find((a) => a.userId === userId && a.id === id)
      if (!address) throw new Error('not found')
      Object.assign(address, data, { updatedAt: new Date() })
      return address
    },
    async delete(userId, id) {
      const i = rows.findIndex((a) => a.userId === userId && a.id === id)
      if (i >= 0) rows.splice(i, 1)
    },
    async clearDefault(userId) {
      for (const a of rows) if (a.userId === userId) a.isDefault = false
    },
  }
}
