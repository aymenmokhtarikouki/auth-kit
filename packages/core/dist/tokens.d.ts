import type { TokenOptions } from './types';
export declare const DEFAULT_ACCESS_TTL_SECONDS = 900;
export declare const DEFAULT_REFRESH_TTL_SECONDS: number;
export interface TokenService<C extends object = Record<string, never>> {
    signAccess(userId: string, claims: C): string;
    verifyAccess(token: string): {
        userId: string;
        claims: C;
    };
    signRefresh(userId: string): {
        token: string;
        jti: string;
        expiresAt: Date;
    };
    verifyRefresh(token: string): {
        userId: string;
        jti: string;
    };
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
}
export declare function createTokenService<C extends object>(options: TokenOptions): TokenService<C>;
//# sourceMappingURL=tokens.d.ts.map