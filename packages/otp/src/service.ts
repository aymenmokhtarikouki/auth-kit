/**
 * The OTP engine. Semantics extracted from a production OTP service:
 * bcrypt-hashed codes, TTL, attempt cap, resend cooldown, dev master code,
 * destination normalization — all tunable via OtpOptions.
 */
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import type { OtpChannel, OtpOptions, OtpSender, OtpStore } from './types'
import { DEFAULT_OTP_OPTIONS, OtpError } from './types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?[0-9]{7,15}$/

/** EMAIL → trimmed lowercase; PHONE → strip spaces/dashes/parens (E.164-ish). */
export function normalizeDestination(channel: OtpChannel, destination: string): string {
  if (channel === 'EMAIL') return destination.trim().toLowerCase()
  return destination.replace(/[\s()-]/g, '')
}

function defaultValidate(channel: OtpChannel, normalized: string): boolean {
  return channel === 'EMAIL' ? EMAIL_RE.test(normalized) : PHONE_RE.test(normalized)
}

export interface OtpService {
  /** Issue + deliver a code. Returns TTL; throws COOLDOWN when re-requested too fast.  is forwarded to the sender. */
  request(channel: OtpChannel, destination: string, context?: unknown): Promise<{ expiresInSeconds: number; sent: boolean }>
  /** Verify + consume the latest code. Throws EXPIRED / TOO_MANY_ATTEMPTS / INVALID_CODE. */
  verify(channel: OtpChannel, destination: string, code: string): Promise<void>
  normalize(channel: OtpChannel, destination: string): string
}

export interface CreateOtpServiceArgs {
  store: OtpStore
  sender: OtpSender
  options?: Partial<OtpOptions>
}

export function createOtpService(args: CreateOtpServiceArgs): OtpService {
  const { store, sender } = args
  const options: OtpOptions = { ...DEFAULT_OTP_OPTIONS, ...args.options }
  const validate = options.validateDestination ?? defaultValidate

  function generateCode(): string {
    if (options.devCode) return options.devCode
    const max = 10 ** options.codeLength
    return crypto.randomInt(0, max).toString().padStart(options.codeLength, '0')
  }

  async function request(channel: OtpChannel, rawDestination: string, context?: unknown) {
    const destination = normalizeDestination(channel, rawDestination)
    if (!validate(channel, destination)) {
      throw new OtpError('INVALID_DESTINATION', 400, `Enter a valid ${channel === 'EMAIL' ? 'email address' : 'phone number'}`)
    }

    // Resend cooldown against the newest code, consumed or not.
    const latest = await store.findLatest(channel, destination)
    if (latest) {
      const elapsedMs = Date.now() - latest.createdAt.getTime()
      const cooldownMs = options.resendCooldownSeconds * 1000
      if (elapsedMs < cooldownMs) {
        const retryAfter = Math.ceil((cooldownMs - elapsedMs) / 1000)
        throw new OtpError('COOLDOWN', 429, `Please wait ${retryAfter}s before requesting a new code`, retryAfter)
      }
    }

    const code = generateCode()
    const codeHash = await bcrypt.hash(code, options.hashRounds)
    await store.create({
      channel,
      destination,
      codeHash,
      expiresAt: new Date(Date.now() + options.ttlSeconds * 1000),
    })

    // Dev mode: fixed code, nothing leaves the machine.
    if (!options.devCode) {
      await sender.send({ channel, destination, code, ttlSeconds: options.ttlSeconds, context })
    }

    return { expiresInSeconds: options.ttlSeconds, sent: !options.devCode }
  }

  async function verify(channel: OtpChannel, rawDestination: string, code: string): Promise<void> {
    const destination = normalizeDestination(channel, rawDestination)
    const otp = await store.findLatest(channel, destination)

    if (!otp || otp.consumedAt || otp.expiresAt.getTime() < Date.now()) {
      throw new OtpError('EXPIRED', 401, 'Code expired or not found — request a new one')
    }
    if (otp.attempts >= options.maxAttempts) {
      throw new OtpError('TOO_MANY_ATTEMPTS', 429, 'Too many attempts — request a new code')
    }

    const matches = await bcrypt.compare(code, otp.codeHash)
    if (!matches) {
      await store.incrementAttempts(otp.id)
      throw new OtpError('INVALID_CODE', 401, 'Invalid code')
    }

    await store.consume(otp.id)
  }

  return { request, verify, normalize: normalizeDestination }
}
