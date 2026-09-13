/**
 * Provider ID-token verifiers. Both Google and Apple sign-in reduce to:
 * verify the provider's signed JWT against their published JWKS, check
 * issuer + audience, extract the stable subject + email.
 *
 * Works for Flutter (native sign-in SDKs return these tokens), web one-tap,
 * AND redirect OAuth (the callback's id_token feeds the same verifier).
 * Apps already on firebase-admin can keep it: any `IdTokenVerifier` plugs in.
 *
 * `jose` is ESM-only, so it is loaded lazily via dynamic import — CJS apps
 * (both backends) stay compatible.
 */
import type { IdTokenVerifier } from './types';
/** Google Sign-In / One-Tap / Firebase-issued Google ID tokens. */
export declare function googleIdTokenVerifier(options: {
    clientIds: string[];
}): IdTokenVerifier;
/** Sign in with Apple identity tokens (iOS native + web). */
export declare function appleIdTokenVerifier(options: {
    clientIds: string[];
}): IdTokenVerifier;
/**
 * GitHub sign-in — and it does NOT work like the two above.
 *
 * Google and Apple hand the client a signed OIDC ID token, so verification is
 * offline: check the signature against published JWKS, check `iss`/`aud`, read
 * the subject. A GitHub OAuth App issues no ID token at all. What the client
 * ends up holding is an ACCESS TOKEN, which carries no signature to check and
 * no audience to pin — it is an opaque bearer string that GitHub alone can
 * interpret. So this verifier asks GitHub, over the network, twice.
 *
 * THE ATTACK THIS EXISTS TO STOP. An access token does not say who it was
 * issued FOR. Any other site running "Sign in with GitHub" also receives its
 * users' tokens, and a malicious one could replay a token it collected against
 * THIS backend: `GET /user` would answer happily, the identity would look
 * perfect, and it would sign in as that user. That is the classic OAuth token
 * substitution / "confused deputy" hole, and it is why an access-token login
 * is not simply a Bearer call to /user.
 *
 * The fix is GitHub's own check-token endpoint: POST the token to
 * `/applications/{client_id}/token` with the app's client_id:client_secret as
 * HTTP Basic. GitHub answers 200 only when that token belongs to THAT app, and
 * 404 otherwise — the audience check the token itself cannot carry. It is
 * mandatory here rather than optional, because a verifier that silently
 * accepts other apps' tokens is worse than no verifier: it looks like it works.
 *
 * Email needs a second call. `GET /user` returns `email` only when the user
 * made it public — for most accounts it is null — so the primary verified
 * address is read from `GET /user/emails`, which needs the `user:email` scope.
 * A token without that scope still signs in; it just arrives with no email,
 * which the caller can treat as it treats an unverified one.
 */
export declare function githubAccessTokenVerifier(options: {
    /** OAuth App client id — also the audience this token must belong to. */
    clientId: string;
    /** OAuth App client secret. Used ONLY for the check-token Basic auth. */
    clientSecret: string;
    /** GitHub requires a User-Agent on every API call; name your app. */
    userAgent?: string;
    /** Override for GitHub Enterprise Server. Default: api.github.com. */
    apiBaseUrl?: string;
}): IdTokenVerifier;
//# sourceMappingURL=providers.d.ts.map