/**
 * THE session-cookie attribute policy — one definition, used by login AND
 * logout so the two can never disagree (a cookie cleared with different
 * attributes than it was set with is not cleared at all).
 *
 * Unchanged defaults: `beyu_os_session`, `httpOnly`, `SameSite=Lax`,
 * `Secure` in production, `Path=/`, HOST-ONLY (no `Domain`).
 *
 * CANONICAL-DOMAIN SESSION SHARING (opt-in, narrow)
 *   BEYU OS now has four canonical Sector OS subdomains beneath the apex. A
 *   host-only cookie is NOT sent to a sibling host, so "sign in once at
 *   www.beyu.co.tz, launch Health OS at health.beyu.co.tz" needs the cookie
 *   scoped to the apex. That broadening happens ONLY when every one of these
 *   holds, and otherwise the cookie stays host-only:
 *
 *     1. `BEYU_SESSION_COOKIE_DOMAIN` is configured;
 *     2. it equals `BEYU_CANONICAL_DOMAIN` exactly (the cookie can never be
 *        scoped to a domain the deployment does not declare canonical);
 *     3. the REQUEST host is that apex or one of its subdomains (a
 *        `*.vercel.app` preview or `localhost` request never receives a
 *        domain-scoped cookie — browsers would reject it, and it must not be
 *        attempted).
 *
 *   When a domain IS applied, `Secure` is forced on regardless of mode: a
 *   domain-wide credential is never sent over plain HTTP.
 *
 * The cookie VALUE is the same opaque session token as before; its validity is
 * decided by the database on every request (`resolvePrincipal`). Scope decides
 * where the token travels, never what it may do.
 */
import { SESSION_COOKIE } from "./constants";
import { parseCanonicalDomain } from "./sector-domains";
import { normalizeHostname } from "./tenant-domain/hostname";

export type SessionCookieAttributes = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  domain?: string;
};

export type SessionCookieEnvironment = Record<string, string | undefined>;

function productionMode(env: SessionCookieEnvironment): boolean {
  return env["NODE_ENV"] === "production" || env["BEYU_ENV"] === "production";
}

/**
 * The cookie `Domain` to apply for a request host, or undefined for host-only.
 * Pure; see the module header for the three conditions.
 */
export function sessionCookieDomain(
  requestHost: string | null | undefined,
  env: SessionCookieEnvironment = process.env,
): string | undefined {
  const canonical = parseCanonicalDomain(env["BEYU_CANONICAL_DOMAIN"]);
  const configured = parseCanonicalDomain(env["BEYU_SESSION_COOKIE_DOMAIN"]);
  if (!canonical || !configured || canonical !== configured) return undefined;
  const host = normalizeHostname(requestHost);
  if (!host.ok || host.scope !== "HOSTNAME") return undefined;
  if (host.hostname !== canonical && !host.hostname.endsWith(`.${canonical}`)) return undefined;
  return canonical;
}

/** True when the deployment shares one session across the canonical apex. */
export function sessionSharedAcrossCanonicalDomain(env: SessionCookieEnvironment = process.env): boolean {
  const canonical = parseCanonicalDomain(env["BEYU_CANONICAL_DOMAIN"]);
  const configured = parseCanonicalDomain(env["BEYU_SESSION_COOKIE_DOMAIN"]);
  return canonical !== null && configured !== null && canonical === configured;
}

/** The attributes to SET the session cookie with for this request. */
export function sessionCookieAttributes(
  requestHost: string | null | undefined,
  env: SessionCookieEnvironment = process.env,
): SessionCookieAttributes {
  const domain = sessionCookieDomain(requestHost, env);
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: domain !== undefined || productionMode(env),
    path: "/",
    ...(domain ? { domain } : {}),
  };
}

/**
 * Every attribute set a session cookie may have been issued with for this
 * request: the host-only variant always, plus the domain-scoped variant when
 * sharing applies. Logout clears ALL of them so sign-out works on every
 * canonical host and after a configuration change.
 */
export function sessionCookieClearTargets(
  requestHost: string | null | undefined,
  env: SessionCookieEnvironment = process.env,
): Array<{ name: string; path: "/"; domain?: string }> {
  const targets: Array<{ name: string; path: "/"; domain?: string }> = [{ name: SESSION_COOKIE, path: "/" }];
  const domain = sessionCookieDomain(requestHost, env);
  if (domain) targets.push({ name: SESSION_COOKIE, path: "/", domain });
  return targets;
}
