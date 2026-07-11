/**
 * In-memory OtpStore — for demos and app tests ONLY (codes vanish on restart
 * and it is single-process). Production apps implement OtpStore on their own
 * table; see docs/INTEGRATION.md for Prisma and raw-SQL recipes.
 */
import crypto from 'crypto'
import type { OtpChannel, OtpRecord, OtpStore } from './types'

export function createInMemoryOtpStore(): OtpStore & { size(): number } {
  const records: OtpRecord[] = []

  return {
    async create(data) {
      const record: OtpRecord = {
        id: crypto.randomUUID(),
        channel: data.channel,
        destination: data.destination,
        codeHash: data.codeHash,
        attempts: 0,
        expiresAt: data.expiresAt,
        consumedAt: null,
        createdAt: new Date(),
      }
      records.push(record)
      return record
    },
    async findLatest(channel: OtpChannel, destination: string) {
      for (let i = records.length - 1; i >= 0; i--) {
        const r = records[i]!
        if (r.channel === channel && r.destination === destination) return r
      }
      return null
    },
    async incrementAttempts(id: string) {
      const r = records.find((x) => x.id === id)
      if (r) r.attempts += 1
    },
    async consume(id: string) {
      const r = records.find((x) => x.id === id)
      if (r) r.consumedAt = new Date()
    },
    size: () => records.length,
  }
}
