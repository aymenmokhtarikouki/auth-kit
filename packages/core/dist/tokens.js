"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_REFRESH_TTL_SECONDS = exports.DEFAULT_ACCESS_TTL_SECONDS = void 0;
exports.createTokenService = createTokenService;
/**
 * JWT issuing/verification. Uses `jsonwebtoken` with HS256 + two secrets —
 * the SAME library and shape both apps use today, so adopting the kit keeps
 * existing tokens valid (a hard migration requirement).
 */
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const types_1 = require("./types");
exports.DEFAULT_ACCESS_TTL_SECONDS = 900; // 15 min
exports.DEFAULT_REFRESH_TTL_SECONDS = 180 * 24 * 3600; // 180 days
function createTokenService(options) {
    const accessTtlSeconds = options.accessTtlSeconds ?? exports.DEFAULT_ACCESS_TTL_SECONDS;
    const refreshTtlSeconds = options.refreshTtlSeconds ?? exports.DEFAULT_REFRESH_TTL_SECONDS;
    return {
        accessTtlSeconds,
        refreshTtlSeconds,
        signAccess(userId, claims) {
            return jsonwebtoken_1.default.sign({ ...claims }, options.accessSecret, {
                subject: userId,
                expiresIn: accessTtlSeconds,
                ...(options.issuer ? { issuer: options.issuer } : {}),
            });
        },
        verifyAccess(token) {
            try {
                const payload = jsonwebtoken_1.default.verify(token, options.accessSecret, {
                    // Pin the algorithm — never let the token header pick it.
                    algorithms: ['HS256'],
                    ...(options.issuer ? { issuer: options.issuer } : {}),
                });
                if (!payload.sub)
                    throw new Error('missing sub');
                const { sub, iat, exp, iss, jti, ...claims } = payload;
                return { userId: sub, claims: claims };
            }
            catch (err) {
                // Expired ≠ forged: clients refresh on TOKEN_EXPIRED, hard-logout on
                // INVALID_TOKEN.
                if (err instanceof jsonwebtoken_1.default.TokenExpiredError) {
                    throw new types_1.AuthError('TOKEN_EXPIRED', 401, 'Access token expired — refresh the session');
                }
                throw new types_1.AuthError('INVALID_TOKEN', 401, 'Invalid access token');
            }
        },
        signRefresh(userId) {
            const jti = crypto_1.default.randomUUID();
            const expiresAt = new Date(Date.now() + refreshTtlSeconds * 1000);
            const token = jsonwebtoken_1.default.sign({}, options.refreshSecret, {
                subject: userId,
                jwtid: jti,
                expiresIn: refreshTtlSeconds,
                ...(options.issuer ? { issuer: options.issuer } : {}),
            });
            return { token, jti, expiresAt };
        },
        verifyRefresh(token) {
            try {
                const payload = jsonwebtoken_1.default.verify(token, options.refreshSecret, {
                    algorithms: ['HS256'],
                    ...(options.issuer ? { issuer: options.issuer } : {}),
                });
                if (!payload.sub || !payload.jti)
                    throw new Error('missing sub/jti');
                return { userId: payload.sub, jti: payload.jti };
            }
            catch (err) {
                if (err instanceof jsonwebtoken_1.default.TokenExpiredError) {
                    throw new types_1.AuthError('TOKEN_EXPIRED', 401, 'Refresh token expired — sign in again');
                }
                throw new types_1.AuthError('INVALID_TOKEN', 401, 'Invalid refresh token');
            }
        },
    };
}
//# sourceMappingURL=tokens.js.map