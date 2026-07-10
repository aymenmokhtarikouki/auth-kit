/**
 * Ready-made OtpSender adapters. Zero dependencies: each factory takes the
 * app's ALREADY-CONFIGURED client (nodemailer transporter, twilio client) via
 * structural typing — the kit never owns provider credentials or versions.
 */
import type { OtpChannel, OtpSender } from './types'

/** Anything with nodemailer's sendMail shape. */
export interface MailTransport {
  sendMail(options: { from: string; to: string; subject: string; text: string }): Promise<unknown>
}

export function smtpEmailSender(
  transport: MailTransport,
  opts: {
    from: string
    subject?: string
    /** Customize the body; receives the code and TTL in minutes. */
    buildText?: (code: string, ttlMinutes: number) => string
  },
): OtpSender {
  return {
    async send({ channel, destination, code, ttlSeconds }) {
      if (channel !== 'EMAIL') {
        throw new Error('smtpEmailSender only handles EMAIL — combine with channelRouter()')
      }
      const ttlMinutes = Math.round(ttlSeconds / 60)
      await transport.sendMail({
        from: opts.from,
        to: destination,
        subject: opts.subject ?? 'Your verification code',
        text:
          opts.buildText?.(code, ttlMinutes) ??
          `Your verification code is ${code}. It expires in ${ttlMinutes} minutes.`,
      })
    },
  }
}

/** Anything with twilio's messages.create shape. */
export interface SmsClient {
  messages: { create(options: { from: string; to: string; body: string }): Promise<unknown> }
}

export function twilioSmsSender(
  client: SmsClient,
  opts: { from: string; buildBody?: (code: string) => string },
): OtpSender {
  return {
    async send({ channel, destination, code }) {
      if (channel !== 'PHONE') {
        throw new Error('twilioSmsSender only handles PHONE — combine with channelRouter()')
      }
      await client.messages.create({
        from: opts.from,
        to: destination,
        body: opts.buildBody?.(code) ?? `Your verification code is ${code}.`,
      })
    },
  }
}

/** Route EMAIL / PHONE to different senders (the usual production setup). */
export function channelRouter(senders: Partial<Record<OtpChannel, OtpSender>>): OtpSender {
  return {
    async send(input) {
      const sender = senders[input.channel]
      if (!sender) throw new Error(`No OTP sender configured for channel ${input.channel}`)
      await sender.send(input)
    },
  }
}

/** Dev/demo sender: prints the code to the console. Never use in production. */
export function consoleSender(): OtpSender {
  return {
    async send({ channel, destination, code }) {
      console.log(`[authkit/otp] ${channel} code for ${destination}: ${code}`)
    },
  }
}
