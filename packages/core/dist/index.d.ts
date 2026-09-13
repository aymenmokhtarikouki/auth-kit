/**
 * @aymenkits/auth-core — OTP-first identity & sessions.
 *
 * Quick start:
 *   const auth = createAuthService<Profile, Claims>({
 *     users: myUserStore,
 *     session: { mode: 'rotating', store: myRefreshTokenStore }, // or 'static'
 *     tokens: { accessSecret, refreshSecret },
 *     otp: createOtpService({ store, sender }),                   // @aymenkits/auth-otp
 *     providers: {
 *       google: googleIdTokenVerifier({ clientIds: [GOOGLE_CLIENT_ID] }),
 *       apple: appleIdTokenVerifier({ clientIds: [APPLE_SERVICE_ID] }),
 *       // GitHub issues no ID token — this verifies the ACCESS token belongs
 *       // to your app (check-token) before trusting the identity behind it.
 *       github: githubAccessTokenVerifier({ clientId, clientSecret }),
 *     },
 *     claims: (user) => ({ role: user.profile.role }),
 *     hooks: { onUserCreated: (u) => createAppProfile(u) },
 *   })
 */
export type { AuthUser, ProviderIdentity, IdTokenVerifier, UserStore, RotatingSessionStore, StaticSessionStore, SessionStrategy, TokenOptions, AuthSession, AuthErrorCode, } from './types';
export { AuthError } from './types';
export { createAuthService } from './service';
export type { AuthService, AuthHooks, CreateAuthServiceArgs } from './service';
export { createTokenService, DEFAULT_ACCESS_TTL_SECONDS, DEFAULT_REFRESH_TTL_SECONDS, } from './tokens';
export type { TokenService } from './tokens';
export { googleIdTokenVerifier, appleIdTokenVerifier, githubAccessTokenVerifier } from './providers';
export { createInMemoryUserStore, createInMemoryRotatingSessionStore, createInMemoryStaticSessionStore, } from './memory';
export type { OtpChannel, OtpService } from '@aymenkits/auth-otp';
//# sourceMappingURL=index.d.ts.map