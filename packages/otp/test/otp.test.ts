import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOtpService,
  createInMemoryOtpStore,
  channelRouter,
  smtpEmailSender,
  twilioSmsSender,
  normalizeDestination,
  OtpError,
  type OtpSender,
} from '../src/index'

function fakeSender() {
  const sent: Array<{ channel: string; destination: string; code: string }> = []
  const sender: OtpSender = {
    async send({ channel, destination, code }) {
      sent.push({ channel, destination, code })
    },
  }
  return { sender, sent }
}

describe('normalizeDestination', () => {
  it('lowercases + trims email; strips phone formatting', () => {
    expect(normalizeDestination('EMAIL', '  Foo@Bar.COM ')).toBe('foo@bar.com')
    expect(normalizeDestination('PHONE', '+49 (151) 234-567')).toBe('+49151234567')
  })
})

describe('request', () => {
  beforeEach(() => vi.useRealTimers())

  it('issues a hashed code, delivers it, and verify consumes it', async () => {
    const store = createInMemoryOtpStore()
    const { sender, sent } = fakeSender()
    const otp = createOtpService({ store, sender })

    const res = await otp.request('EMAIL', 'User@Example.com')
    expect(res).toEqual({ expiresInSeconds: 600, sent: true })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.destination).toBe('user@example.com')
    expect(sent[0]!.code).toMatch(/^\d{6}$/)

    // stored hashed, not plaintext
    const rec = await store.findLatest('EMAIL', 'user@example.com')
    expect(rec!.codeHash).not.toContain(sent[0]!.code)

    await otp.verify('EMAIL', 'user@example.com', sent[0]!.code)
    // second use fails (consumed)
    await expect(otp.verify('EMAIL', 'user@example.com', sent[0]!.code)).rejects.toMatchObject({
      code: 'EXPIRED',
    })
  })

  it('rejects invalid destinations', async () => {
    const store = createInMemoryOtpStore()
    const { sender } = fakeSender()
    const otp = createOtpService({ store, sender })
    await expect(otp.request('EMAIL', 'not-an-email')).rejects.toMatchObject({
      code: 'INVALID_DESTINATION',
      status: 400,
    })
    await expect(otp.request('PHONE', 'abc')).rejects.toMatchObject({ code: 'INVALID_DESTINATION' })
  })

  it('enforces the resend cooldown with retryAfterSeconds', async () => {
    const store = createInMemoryOtpStore()
    const { sender } = fakeSender()
    const otp = createOtpService({ store, sender, options: { resendCooldownSeconds: 60 } })

    await otp.request('PHONE', '+49151234567')
    const err = await otp.request('PHONE', '+49151234567').catch((e) => e)
    expect(err).toBeInstanceOf(OtpError)
    expect(err.code).toBe('COOLDOWN')
    expect(err.status).toBe(429)
    expect(err.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('devCode: fixed code, nothing sent', async () => {
    const store = createInMemoryOtpStore()
    const { sender, sent } = fakeSender()
    const otp = createOtpService({ store, sender, options: { devCode: '123456' } })

    const res = await otp.request('EMAIL', 'dev@example.com')
    expect(res.sent).toBe(false)
    expect(sent).toHaveLength(0)
    await otp.verify('EMAIL', 'dev@example.com', '123456') // resolves
  })
})

describe('verify', () => {
  it('expires codes after TTL', async () => {
    vi.useFakeTimers()
    const store = createInMemoryOtpStore()
    const { sender, sent } = fakeSender()
    const otp = createOtpService({ store, sender, options: { ttlSeconds: 600 } })

    await otp.request('EMAIL', 'a@b.co')
    vi.advanceTimersByTime(601_000)
    await expect(otp.verify('EMAIL', 'a@b.co', sent[0]!.code)).rejects.toMatchObject({
      code: 'EXPIRED',
      status: 401,
    })
    vi.useRealTimers()
  })

  it('caps attempts then locks the code', async () => {
    const store = createInMemoryOtpStore()
    const { sender, sent } = fakeSender()
    const otp = createOtpService({ store, sender, options: { maxAttempts: 3 } })

    await otp.request('EMAIL', 'a@b.co')
    for (let i = 0; i < 3; i++) {
      await expect(otp.verify('EMAIL', 'a@b.co', '000000')).rejects.toMatchObject({
        code: 'INVALID_CODE',
      })
    }
    // Correct code now rejected too — attempts exhausted.
    await expect(otp.verify('EMAIL', 'a@b.co', sent[0]!.code)).rejects.toMatchObject({
      code: 'TOO_MANY_ATTEMPTS',
      status: 429,
    })
  })

  it('normalizes the destination on verify (raw input works)', async () => {
    const store = createInMemoryOtpStore()
    const { sender, sent } = fakeSender()
    const otp = createOtpService({ store, sender })
    await otp.request('PHONE', '+49 151 234 5678')
    await otp.verify('PHONE', '+49 (151) 234-5678', sent[0]!.code) // resolves
  })
})

describe('senders', () => {
  it('channelRouter routes per channel; adapters shape provider calls', async () => {
    const mails: unknown[] = []
    const smses: unknown[] = []
    const sender = channelRouter({
      EMAIL: smtpEmailSender(
        { sendMail: async (o) => void mails.push(o) },
        { from: 'no-reply@app.com' },
      ),
      PHONE: twilioSmsSender(
        { messages: { create: async (o) => void smses.push(o) } },
        { from: '+1000' },
      ),
    })

    await sender.send({ channel: 'EMAIL', destination: 'a@b.co', code: '111111', ttlSeconds: 600 })
    await sender.send({ channel: 'PHONE', destination: '+4915100', code: '222222', ttlSeconds: 600 })

    expect(mails[0]).toMatchObject({ to: 'a@b.co', from: 'no-reply@app.com' })
    expect((mails[0] as { text: string }).text).toContain('111111')
    expect(smses[0]).toMatchObject({ to: '+4915100', from: '+1000' })
    expect((smses[0] as { body: string }).body).toContain('222222')
  })
})
