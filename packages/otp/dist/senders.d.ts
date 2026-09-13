/**
 * Ready-made OtpSender adapters. Zero dependencies: each factory takes the
 * app's ALREADY-CONFIGURED client (nodemailer transporter, twilio client) via
 * structural typing — the kit never owns provider credentials or versions.
 */
import type { OtpChannel, OtpSender } from './types';
/** Anything with nodemailer's sendMail shape. */
export interface MailTransport {
    sendMail(options: {
        from: string;
        to: string;
        subject: string;
        text: string;
    }): Promise<unknown>;
}
export declare function smtpEmailSender(transport: MailTransport, opts: {
    from: string;
    subject?: string;
    /** Customize the body; receives the code and TTL in minutes. */
    buildText?: (code: string, ttlMinutes: number) => string;
}): OtpSender;
/** Anything with twilio's messages.create shape. */
export interface SmsClient {
    messages: {
        create(options: {
            from: string;
            to: string;
            body: string;
        }): Promise<unknown>;
    };
}
export declare function twilioSmsSender(client: SmsClient, opts: {
    from: string;
    buildBody?: (code: string) => string;
}): OtpSender;
/** Route EMAIL / PHONE to different senders (the usual production setup). */
export declare function channelRouter(senders: Partial<Record<OtpChannel, OtpSender>>): OtpSender;
/** Dev/demo sender: prints the code to the console. Never use in production. */
export declare function consoleSender(): OtpSender;
//# sourceMappingURL=senders.d.ts.map