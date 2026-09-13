import type { OtpChannel, OtpOptions, OtpSender, OtpStore } from './types';
/** EMAIL → trimmed lowercase; PHONE → strip spaces/dashes/parens (E.164-ish). */
export declare function normalizeDestination(channel: OtpChannel, destination: string): string;
export interface OtpService {
    /** Issue + deliver a code. Returns TTL; throws COOLDOWN when re-requested too fast.  is forwarded to the sender. */
    request(channel: OtpChannel, destination: string, context?: unknown): Promise<{
        expiresInSeconds: number;
        sent: boolean;
    }>;
    /** Verify + consume the latest code. Throws EXPIRED / TOO_MANY_ATTEMPTS / INVALID_CODE. */
    verify(channel: OtpChannel, destination: string, code: string): Promise<void>;
    normalize(channel: OtpChannel, destination: string): string;
}
export interface CreateOtpServiceArgs {
    store: OtpStore;
    sender: OtpSender;
    options?: Partial<OtpOptions>;
}
export declare function createOtpService(args: CreateOtpServiceArgs): OtpService;
//# sourceMappingURL=service.d.ts.map