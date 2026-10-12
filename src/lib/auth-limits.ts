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
 * Governed password-recovery REQUEST rate-limit policy.
 *
 * Deliberately tighter than login: a recovery request is a low-frequency,
 * high-value action (it asks a human administrator to act on an identity), so
 * the same bucket identity model is applied with a much smaller budget. It is
 * NOT a credential path — the endpoint never verifies, issues or changes a
 * password — but it must not become a way to enumerate accounts by timing or by
 * volume, nor a way to flood the audit ledger.
 */
export const RECOVERY_RATE_LIMIT = {
  perAccount: 5,
  perIpAccount: 3,
  windowMs: 15 * 60_000,
} as const;

/**
 * Recovery bucket keys, using the SAME identity model as login: the account key
 * always applies, the (IP, account) key is added only under a trusted proxy.
 */
export function recoveryRateLimitKeys(ip: string | null, identifier: string): string[] {
  const account = identifier.trim().toLowerCase();
  const accountKey = `recovery:acct:${account}`;
  if (!ip) return [accountKey];
  return [`recovery:ipacct:${ip}:${account}`, accountKey];
}

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
