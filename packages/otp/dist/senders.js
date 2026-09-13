"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.smtpEmailSender = smtpEmailSender;
exports.twilioSmsSender = twilioSmsSender;
exports.channelRouter = channelRouter;
exports.consoleSender = consoleSender;
function smtpEmailSender(transport, opts) {
    return {
        async send({ channel, destination, code, ttlSeconds }) {
            if (channel !== 'EMAIL') {
                throw new Error('smtpEmailSender only handles EMAIL — combine with channelRouter()');
            }
            const ttlMinutes = Math.round(ttlSeconds / 60);
            await transport.sendMail({
                from: opts.from,
                to: destination,
                subject: opts.subject ?? 'Your verification code',
                text: opts.buildText?.(code, ttlMinutes) ??
                    `Your verification code is ${code}. It expires in ${ttlMinutes} minutes.`,
            });
        },
    };
}
function twilioSmsSender(client, opts) {
    return {
        async send({ channel, destination, code }) {
            if (channel !== 'PHONE') {
                throw new Error('twilioSmsSender only handles PHONE — combine with channelRouter()');
            }
            await client.messages.create({
                from: opts.from,
                to: destination,
                body: opts.buildBody?.(code) ?? `Your verification code is ${code}.`,
            });
        },
    };
}
/** Route EMAIL / PHONE to different senders (the usual production setup). */
function channelRouter(senders) {
    return {
        async send(input) {
            const sender = senders[input.channel];
            if (!sender)
                throw new Error(`No OTP sender configured for channel ${input.channel}`);
            await sender.send(input);
        },
    };
}
/** Dev/demo sender: prints the code to the console. Never use in production. */
function consoleSender() {
    return {
        async send({ channel, destination, code }) {
            console.log(`[authkit/otp] ${channel} code for ${destination}: ${code}`);
        },
    };
}
//# sourceMappingURL=senders.js.map