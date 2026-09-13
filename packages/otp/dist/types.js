"use strict";
/**
 * Seams and shapes for the OTP engine. The engine never touches a database or
 * a mail/SMS provider directly — apps implement `OtpStore` on their own table
 * (any table with destination/code/expiry/attempts columns) and plug an `OtpSender`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OtpError = exports.DEFAULT_OTP_OPTIONS = void 0;
exports.DEFAULT_OTP_OPTIONS = {
    ttlSeconds: 600,
    maxAttempts: 5,
    resendCooldownSeconds: 60,
    codeLength: 6,
    hashRounds: 10,
};
/** Engine error; adapters map `status` to HTTP. */
class OtpError extends Error {
    code;
    status;
    /** Present on COOLDOWN. */
    retryAfterSeconds;
    constructor(code, status, message, retryAfterSeconds) {
        super(message);
        this.name = 'OtpError';
        this.code = code;
        this.status = status;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
exports.OtpError = OtpError;
//# sourceMappingURL=types.js.map