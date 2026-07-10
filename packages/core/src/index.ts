/**
 * @authkit/core — OTP-first identity & sessions.
 *
 * Quick start:
 *   const auth = createAuthService<Profile, Claims>({
 *     users: myUserStore,
 *     session: { mode: 'rotating', store: myRefreshTokenStore }, // or 'static'
 *     tokens: { accessSecret, refreshSecret },
 *     otp: createOtpService({ store, sender }),                   // @authkit/otp
 *     providers: {
 *       google: googleIdTokenVerifier({ clientIds: [GOOGLE_CLIENT_ID] }),
 *       apple: appleIdTokenVerifier({ clientIds: [APPLE_SERVICE_ID] }),
 *     },
 *     claims: (user) => ({ role: user.profile.role }),
 *     hooks: { onUserCreated: (u) => createAppProfile(u) },
 *   })
 */
export type {
  AuthUser,
  ProviderIdentity,
  IdTokenVerifier,
  UserStore,
  RotatingSessionStore,
  StaticSessionStore,
  SessionStrategy,
  TokenOptions,
  AuthSession,
  AuthErrorCode,
} from './types'
export { AuthError } from './types'

export { createAuthService } from './service'
export type { AuthService, AuthHooks, CreateAuthServiceArgs } from './service'

export {
  createTokenService,
  DEFAULT_ACCESS_TTL_SECONDS,
  DEFAULT_REFRESH_TTL_SECONDS,
} from './tokens'
export type { TokenService } from './tokens'

export { googleIdTokenVerifier, appleIdTokenVerifier } from './providers'

export {
  createInMemoryUserStore,
  createInMemoryRotatingSessionStore,
  createInMemoryStaticSessionStore,
} from './memory'

// Re-export the OTP surface consumers typically need alongside auth.
export type { OtpChannel, OtpService } from '@authkit/otp'
