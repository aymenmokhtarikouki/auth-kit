/**
 * @aymenkits/auth-otp — one-time-code engine with storage + delivery seams.
 *
 * Quick start:
 *   const otp = createOtpService({
 *     store: myOtpStore,                       // maps to your otp table
 *     sender: channelRouter({
 *       EMAIL: smtpEmailSender(transporter, { from: 'no-reply@app.com' }),
 *       PHONE: twilioSmsSender(twilioClient, { from: '+123456789' }),
 *     }),
 *     options: { devCode: process.env.OTP_DEV_CODE },  // dev only
 *   })
 *   await otp.request('EMAIL', 'user@example.com')
 *   await otp.verify('EMAIL', 'user@example.com', '123456')
 */
export type {
  OtpChannel,
  OtpRecord,
  OtpStore,
  OtpSender,
  OtpOptions,
  OtpErrorCode,
} from './types'
export { OtpError, DEFAULT_OTP_OPTIONS } from './types'

export { createOtpService, normalizeDestination } from './service'
export type { OtpService, CreateOtpServiceArgs } from './service'

export {
  smtpEmailSender,
  twilioSmsSender,
  channelRouter,
  consoleSender,
} from './senders'
export type { MailTransport, SmsClient } from './senders'

export { createInMemoryOtpStore } from './memory'
