"use strict";
/**
 * Identity types and seams. `P` = the app's user-profile payload (e.g.
 * firstName/lastName or name/role) — the kit carries it
 * through registration untouched. `C` = extra JWT claims (e.g. role,
 * activeTenantId). Addresses/avatars/etc. are NOT identity — they live in
 * the app (or @aymenkits/location-addresses) and compose via hooks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthError = void 0;
class AuthError extends Error {
    code;
    status;
    constructor(code, status, message) {
        super(message);
        this.name = 'AuthError';
        this.code = code;
        this.status = status;
    }
}
exports.AuthError = AuthError;
//# sourceMappingURL=types.js.map