import type { OtpChannel, OtpService } from '@aymenkits/auth-otp';
import type { AuthSession, AuthUser, IdTokenVerifier, SessionStrategy, TokenOptions, UserStore } from './types';
export interface AuthHooks<P> {
    /** After a brand-new user row is created (any flow). Attach app follow-ups here. */
    onUserCreated?: (user: AuthUser<P>, context: {
        flow: string;
    }) => void | Promise<void>;
    /** After every successful sign-in (audit trails, last-login stamps). */
    onLogin?: (user: AuthUser<P>, context: {
        flow: string;
    }) => void | Promise<void>;
}
export interface CreateAuthServiceArgs<P, C extends object> {
    users: UserStore<P>;
    session: SessionStrategy;
    tokens: TokenOptions;
    /** Wire an @aymenkits/auth-otp service to enable OTP login + contact change. */
    otp?: OtpService;
    /** ID-token verifiers by provider name ('google', 'apple', …). */
    providers?: Record<string, IdTokenVerifier>;
    /** Extra JWT claims derived from the user (role, activeSalonId, …). */
    claims?: (user: AuthUser<P>) => C;
    hooks?: AuthHooks<P>;
    /** bcrypt cost for passwords. Default 12. */
    passwordHashRounds?: number;
}
export interface AuthService<P = unknown, C extends object = Record<string, never>> {
    requestOtp(channel: OtpChannel, destination: string): Promise<{
        expiresInSeconds: number;
        sent: boolean;
    }>;
    verifyOtp(input: {
        channel: OtpChannel;
        destination: string;
        code: string;
        /** Profile for first-time users (names, role, …). Ignored for existing users. */
        profile?: P;
    }): Promise<AuthSession<P>>;
    signInWithProvider(provider: string, idToken: string, profile?: P): Promise<AuthSession<P>>;
    loginWithPassword(email: string, password: string): Promise<AuthSession<P>>;
    registerWithPassword(input: {
        email: string;
        password: string;
        profile?: P;
    }): Promise<AuthSession<P>>;
    refresh(refreshToken: string): Promise<{
        token: string;
        refreshToken: string;
        expiresInSeconds: number;
    }>;
    logout(refreshToken: string): Promise<void>;
    verifyAccess(token: string): {
        userId: string;
        claims: C;
    };
    requestContactChange(userId: string, channel: OtpChannel, destination: string): Promise<{
        expiresInSeconds: number;
        sent: boolean;
    }>;
    confirmContactChange(userId: string, channel: OtpChannel, destination: string, code: string): Promise<AuthUser<P>>;
}
export declare function createAuthService<P = unknown, C extends object = Record<string, never>>(args: CreateAuthServiceArgs<P, C>): AuthService<P, C>;
//# sourceMappingURL=service.d.ts.map