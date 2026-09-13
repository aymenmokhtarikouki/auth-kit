"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendKitError = sendKitError;
exports.createAuthMiddleware = createAuthMiddleware;
exports.createAuthHandlers = createAuthHandlers;
const auth_core_1 = require("@aymenkits/auth-core");
const auth_otp_1 = require("@aymenkits/auth-otp");
// ── Error mapping ─────────────────────────────────────────────────────────────
/** Map kit errors to HTTP; unknown errors → 500 (or forward with onError:'next'). */
function sendKitError(res, err) {
    if (err instanceof auth_core_1.AuthError || err instanceof auth_otp_1.OtpError) {
        res.status(err.status).json({ error: { code: err.code, message: err.message } });
        return;
    }
    // Unknown = a bug or an outage — never swallow it silently.
    console.error('[authkit/express] unhandled error:', err);
    res.status(500).json({ error: { code: 'InternalError', message: 'Something went wrong' } });
}
function createAuthMiddleware(auth) {
    function extractToken(req) {
        const header = req.headers['authorization'];
        if (typeof header !== 'string' || !header.startsWith('Bearer '))
            return null;
        return header.slice('Bearer '.length);
    }
    return {
        requireAuth(req, res, next) {
            const token = extractToken(req);
            if (!token) {
                res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Authentication required' } });
                return;
            }
            try {
                req.auth = auth.verifyAccess(token);
                next?.();
            }
            catch (err) {
                sendKitError(res, err);
            }
        },
        optionalAuth(req, _res, next) {
            const token = extractToken(req);
            if (token) {
                try {
                    req.auth = auth.verifyAccess(token);
                }
                catch {
                    /* anonymous */
                }
            }
            next?.();
        },
        requireClaims(predicate, message = 'Forbidden') {
            return (req, res, next) => {
                if (!req.auth || !predicate(req.auth.claims)) {
                    res.status(403).json({ error: { code: 'FORBIDDEN', message } });
                    return;
                }
                next?.();
            };
        },
    };
}
function asBody(req) {
    return (req.body ?? {});
}
function str(v) {
    return typeof v === 'string' ? v : '';
}
function channel(v) {
    return v === 'PHONE' ? 'PHONE' : 'EMAIL';
}
function createAuthHandlers(auth, options = {}) {
    const wrap = options.wrapResponse ?? ((d) => d);
    function guarded(fn) {
        return async (req, res, next) => {
            try {
                res.json(wrap(await fn(req)));
            }
            catch (err) {
                if (options.onError === 'next' && next)
                    next(err);
                else
                    sendKitError(res, err);
            }
        };
    }
    return {
        /** POST { channel, destination } */
        otpRequest: guarded(async (req) => {
            const b = asBody(req);
            return auth.requestOtp(channel(b.channel), str(b.destination));
        }),
        /** POST { channel, destination, code, profile? } → session */
        otpVerify: guarded(async (req) => {
            const b = asBody(req);
            return auth.verifyOtp({
                channel: channel(b.channel),
                destination: str(b.destination),
                code: str(b.code),
                profile: b.profile,
            });
        }),
        /** POST { provider, idToken, profile? } → session (google/apple/…) */
        providerSignIn: guarded(async (req) => {
            const b = asBody(req);
            return auth.signInWithProvider(str(b.provider), str(b.idToken), b.profile);
        }),
        /** POST { refreshToken } → new pair (rotating) / new access (static) */
        refresh: guarded(async (req) => auth.refresh(str(asBody(req).refreshToken))),
        /** POST { refreshToken } — always 200 (logout is best-effort). */
        logout: guarded(async (req) => {
            await auth.logout(str(asBody(req).refreshToken));
            return { ok: true };
        }),
        /** POST { channel, destination } — authed; code goes to the NEW destination. */
        contactChangeRequest: guarded(async (req) => {
            if (!req.auth)
                throw new auth_core_1.AuthError('INVALID_TOKEN', 401, 'Authentication required');
            const b = asBody(req);
            return auth.requestContactChange(req.auth.userId, channel(b.channel), str(b.destination));
        }),
        /** POST { channel, destination, code } — authed; writes the verified contact. */
        contactChangeConfirm: guarded(async (req) => {
            if (!req.auth)
                throw new auth_core_1.AuthError('INVALID_TOKEN', 401, 'Authentication required');
            const b = asBody(req);
            return {
                user: await auth.confirmContactChange(req.auth.userId, channel(b.channel), str(b.destination), str(b.code)),
            };
        }),
    };
}
//# sourceMappingURL=index.js.map