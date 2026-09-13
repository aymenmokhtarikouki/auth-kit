"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeDestination = normalizeDestination;
exports.createOtpService = createOtpService;
/**
 * The OTP engine. Semantics extracted from a production OTP service:
 * bcrypt-hashed codes, TTL, attempt cap, resend cooldown, dev master code,
 * destination normalization — all tunable via OtpOptions.
 */
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const types_1 = require("./types");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;
/** EMAIL → trimmed lowercase; PHONE → strip spaces/dashes/parens (E.164-ish). */
function normalizeDestination(channel, destination) {
    if (channel === 'EMAIL')
        return destination.trim().toLowerCase();
    return destination.replace(/[\s()-]/g, '');
}
function defaultValidate(channel, normalized) {
    return channel === 'EMAIL' ? EMAIL_RE.test(normalized) : PHONE_RE.test(normalized);
}
function createOtpService(args) {
    const { store, sender } = args;
    const options = { ...types_1.DEFAULT_OTP_OPTIONS, ...args.options };
    const validate = options.validateDestination ?? defaultValidate;
    // Refuse to boot with the fixed dev code in production — otherwise every
    // account is one publicly-known OTP away from takeover.
    if (options.devCode && process.env.NODE_ENV === 'production') {
        throw new Error('@aymenkits/auth-otp: devCode must not be set when NODE_ENV=production — remove it from the production config.');
    }
    function generateCode() {
        if (options.devCode)
            return options.devCode;
        const max = 10 ** options.codeLength;
        return crypto_1.default.randomInt(0, max).toString().padStart(options.codeLength, '0');
    }
    async function request(channel, rawDestination, context) {
        const destination = normalizeDestination(channel, rawDestination);
        if (!validate(channel, destination)) {
            throw new types_1.OtpError('INVALID_DESTINATION', 400, `Enter a valid ${channel === 'EMAIL' ? 'email address' : 'phone number'}`);
        }
        // Resend cooldown against the newest code, consumed or not.
        const latest = await store.findLatest(channel, destination);
        if (latest) {
            const elapsedMs = Date.now() - latest.createdAt.getTime();
            const cooldownMs = options.resendCooldownSeconds * 1000;
            if (elapsedMs < cooldownMs) {
                const retryAfter = Math.ceil((cooldownMs - elapsedMs) / 1000);
                throw new types_1.OtpError('COOLDOWN', 429, `Please wait ${retryAfter}s before requesting a new code`, retryAfter);
            }
        }
        const code = generateCode();
        const codeHash = await bcryptjs_1.default.hash(code, options.hashRounds);
        await store.create({
            channel,
            destination,
            codeHash,
            expiresAt: new Date(Date.now() + options.ttlSeconds * 1000),
        });
        // Dev mode: fixed code, nothing leaves the machine.
        if (!options.devCode) {
            await sender.send({ channel, destination, code, ttlSeconds: options.ttlSeconds, context });
        }
        return { expiresInSeconds: options.ttlSeconds, sent: !options.devCode };
    }
    async function verify(channel, rawDestination, code) {
        const destination = normalizeDestination(channel, rawDestination);
        const otp = await store.findLatest(channel, destination);
        if (!otp || otp.consumedAt || otp.expiresAt.getTime() < Date.now()) {
            throw new types_1.OtpError('EXPIRED', 401, 'Code expired or not found — request a new one');
        }
        if (otp.attempts >= options.maxAttempts) {
            // Burn the locked code — it must never verify again, whatever happens
            // to the attempt counter later.
            await store.consume(otp.id);
            throw new types_1.OtpError('TOO_MANY_ATTEMPTS', 429, 'Too many attempts — request a new code');
        }
        const matches = await bcryptjs_1.default.compare(code, otp.codeHash);
        if (!matches) {
            await store.incrementAttempts(otp.id);
            throw new types_1.OtpError('INVALID_CODE', 401, 'Invalid code');
        }
        await store.consume(otp.id);
    }
    return { request, verify, normalize: normalizeDestination };
}
//# sourceMappingURL=service.js.map