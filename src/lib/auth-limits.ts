/**
 * BEYU OS — authentication rate-limit policy and bucket identity (C-07).
 *
 * Dependency-free so the security suite can unit-test it without importing the
 * HTTP/database stack. This is the single definition of how login attempts are
 * bucketed; the login route and `session.ts` consume it.
 */

/**
 * Login rate-limit policy. The bucket identity is deliberately PER-PRINCIPAL so
 * an attacker exhausting one account can never exhaust another account's
 * budget, and it never collapses to a single global bucket when the client IP
 * is absent.
 *
 *  - `perIpAccount`: tightest limit, keyed by (source IP, account) — throttles a
 *    single source hammering one account.
 *  - `perAccount`: looser limit, keyed by the account across ALL sources —
 *    throttles distributed-IP credential stuffing against one account while
 *    still isolating distinct principals from each other.
 *
 * When the proxy is NOT trusted (`ip === null`), forwarding headers are ignored
 * and only the per-account bucket applies, so a client cannot rotate
 * `X-Forwarded-For` to evade the control, and no global bucket is created.
 */
export const LOGIN_RATE_LIMIT = {
  perAccount: 30,
  perIpAccount: 10,
  windowMs: 60_000,
} as const;

/**
 * Derive the deterministic set of login rate-limit bucket keys for an identity.
 * The account key is always present (so protection never depends on IP); the
 * (IP, account) key is added only when a trusted client IP is available.
 * `email` is normalized to lowercase so the same account cannot dodge its
 * budget via case variation.
 */
export function loginRateLimitKeys(ip: string | null, email: string): string[] {
  const account = email.trim().toLowerCase();
  const accountKey = `login:acct:${account}`;
  if (!ip) return [accountKey];
  return [`login:ipacct:${ip}:${account}`, accountKey];
}

/**
 * Resolve a client address only when the deployment explicitly declares a
 * trusted reverse proxy. Direct clients can forge forwarding headers; treating
 * them as an authentication rate-limit identity would let an attacker rotate
 * `X-Forwarded-For` values to evade the control.
 */
export function trustedClientIp(h: Headers): string | null {
  if (process.env.BEYU_TRUST_PROXY !== "true") return null;
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && forwarded.length <= 128 ? forwarded : null;
}
