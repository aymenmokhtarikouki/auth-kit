/**
 * Seams and shapes for the OTP engine. The engine never touches a database or
 * a mail/SMS provider directly — apps implement `OtpStore` on their own table
 * (yuma `OtpCode`, lineo `otp_codes`) and plug an `OtpSender`.
 */

export type OtpChannel = 'EMAIL' | 'PHONE'

/** One issued code. `codeHash` is bcrypt — plaintext codes are never stored. */
export interface OtpRecord {
  id: string
  channel: OtpChannel
  destination: string
  codeHash: string
  attempts: number
  expiresAt: Date
  consumedAt: Date | null
  createdAt: Date
}

export interface OtpStore {
  create(data: {
    channel: OtpChannel
    destination: string
    codeHash: string
    expiresAt: Date
  }): Promise<OtpRecord>
  /** Newest record for the destination, consumed or not (drives cooldown + verify). */
  findLatest(channel: OtpChannel, destination: string): Promise<OtpRecord | null>
  incrementAttempts(id: string): Promise<void>
  consume(id: string): Promise<void>
}

/** Delivery seam. See senders.ts for ready-made SMTP/Twilio adapters. */
export interface OtpSender {
  send(input: {
    channel: OtpChannel
    destination: string
    code: string
    ttlSeconds: number
    /** Per-request app context forwarded from request() (e.g. Android SMS appHash). */
    context?: unknown
  }): Promise<void>
}

export interface OtpOptions {
  /** Code lifetime. Default 600 (10 min). */
  ttlSeconds: number
  /** Wrong tries before the code dies. Default 5. */
  maxAttempts: number
  /** Min seconds between two sends to one destination. Default 60. */
  resendCooldownSeconds: number
  /** Digits in the code. Default 6. */
  codeLength: number
  /** bcrypt cost. Default 10. */
  hashRounds: number
  /**
   * Fixed dev code (e.g. "123456"): generated instead of a random code and
   * NOTHING is sent. Never set this in production.
   */
  devCode?: string
  /** Override destination validation (return false to reject). */
  validateDestination?: (channel: OtpChannel, normalized: string) => boolean
}

export const DEFAULT_OTP_OPTIONS: OtpOptions = {
  ttlSeconds: 600,
  maxAttempts: 5,
  resendCooldownSeconds: 60,
  codeLength: 6,
  hashRounds: 10,
}

export type OtpErrorCode =
  | 'INVALID_DESTINATION'
  | 'COOLDOWN'
  | 'EXPIRED'
  | 'TOO_MANY_ATTEMPTS'
  | 'INVALID_CODE'

/** Engine error; adapters map `status` to HTTP. */
export class OtpError extends Error {
  readonly code: OtpErrorCode
  readonly status: number
  /** Present on COOLDOWN. */
  readonly retryAfterSeconds?: number

  constructor(code: OtpErrorCode, status: number, message: string, retryAfterSeconds?: number) {
    super(message)
    this.name = 'OtpError'
    this.code = code
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}
