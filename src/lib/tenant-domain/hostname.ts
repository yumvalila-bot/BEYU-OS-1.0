/**
 * CANONICAL HOSTNAME NORMALISATION AND TENANT-SLUG DERIVATION (pure, no I/O).
 *
 * ONE normalisation exists for the whole platform. Every component that has to
 * understand a hostname — the governed registry service, the request resolver,
 * the DNS challenge builder — calls these functions instead of re-implementing
 * string handling, so a hostname can never be interpreted two different ways
 * (which is how "apparently equivalent" names become an authorization bypass).
 *
 * BOUNDARIES
 *   • Nothing here authorizes anything. A normalised hostname is a LOOKUP KEY
 *     into the governed tenant-domain registry; access is decided afterwards by
 *     the existing session/federation/tenant/entity/RBAC/ABAC/policy/RLS chain.
 *   • Nothing here grants wildcard semantics. `*.health.beyuos.co.tz` is DNS
 *     infrastructure; the application resolves an EXACT registered hostname.
 *   • A malformed, absent, IP-literal or local host is never "close enough".
 *     It is classified explicitly and fails closed at the call site.
 */

/** Hosts that belong to the execution environment, not to a tenant. */
const LOCAL_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/** Reserved names that must never be registered as a tenant domain. */
const RESERVED_LABELS = new Set(["www", "mail", "smtp", "ns", "ns1", "ns2", "_dmarc", "_domainkey"]);

export type HostnameScope = "LOCAL" | "HOSTNAME";

export type HostnameRejection =
  /** No host at all (e.g. an internal server-side render without a Host header). */
  | "ABSENT"
  /** Not a syntactically valid DNS name (scheme, path, port, wildcard, IDN, space…). */
  | "MALFORMED"
  /** An IPv4/IPv6 literal: never a tenant domain. */
  | "IP_LITERAL"
  /** A single label such as `health`: not inside any registrable namespace. */
  | "SINGLE_LABEL";

export type NormalizedHostname =
  | { ok: true; hostname: string; scope: HostnameScope }
  | { ok: false; reason: HostnameRejection };

const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Normalise a raw Host header (or any caller-supplied name) into a canonical
 * lookup key.
 *
 * Accepts: `Mwanza.Health.BEYUOS.co.tz` → `mwanza.health.beyuos.co.tz`,
 *          `health.beyuos.co.tz:443`     → `health.beyuos.co.tz`,
 *          `health.beyuos.co.tz.`        → `health.beyuos.co.tz` (root dot).
 * Rejects: schemes, paths, userinfo, ports that are not numeric, spaces,
 *          control characters, wildcards, underscores, non-ASCII (punycode must
 *          be pre-encoded by the client), leading/trailing hyphens, over-long
 *          labels or names.
 */
export function normalizeHostname(raw: string | null | undefined): NormalizedHostname {
  if (raw === null || raw === undefined) return { ok: false, reason: "ABSENT" };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: "ABSENT" };

  // Strip a single numeric port. Anything else (scheme, path, userinfo) is
  // malformed — never "parsed leniently".
  let host = trimmed;
  const portMatch = /^(.*):(\d{1,5})$/.exec(host);
  if (portMatch) host = portMatch[1];
  // Bracketed IPv6, optionally with a port.
  if (host.startsWith("[")) {
    const closing = host.indexOf("]");
    if (closing === -1) return { ok: false, reason: "MALFORMED" };
    const inner = host.slice(1, closing);
    return /^[0-9a-f:.]+$/.test(inner) ? { ok: false, reason: "IP_LITERAL" } : { ok: false, reason: "MALFORMED" };
  }

  // Exactly ONE trailing root dot is allowed (`health.beyuos.co.tz.`); two or
  // more is a malformed name, not a name to be "cleaned up".
  if (host.endsWith("..")) return { ok: false, reason: "MALFORMED" };
  host = (host.endsWith(".") ? host.slice(0, -1) : host).toLowerCase();

  if (host.length === 0) return { ok: false, reason: "ABSENT" };
  if (host.length > 253) return { ok: false, reason: "MALFORMED" };
  if (LOCAL_HOSTNAMES.has(host)) return { ok: true, hostname: host, scope: "LOCAL" };
  if (IPV4.test(host)) return { ok: false, reason: "IP_LITERAL" };
  // Any character outside the DNS hostname alphabet is malformed: this rejects
  // `http://`, `/`, `\`, `@`, `_`, `*`, whitespace, percent-encoding, unicode.
  if (!/^[a-z0-9.-]+$/.test(host)) return { ok: false, reason: "MALFORMED" };
  if (host.startsWith(".") || host.includes("..")) return { ok: false, reason: "MALFORMED" };

  const labels = host.split(".");
  if (labels.length < 2) return { ok: false, reason: "SINGLE_LABEL" };
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return { ok: false, reason: "MALFORMED" };
    if (!LABEL.test(label)) return { ok: false, reason: "MALFORMED" };
  }
  return { ok: true, hostname: host, scope: "HOSTNAME" };
}

/**
 * The canonical tenant slug for a tenant code.
 *
 * `BEYU-HEALTH` → `beyu-health`, `BEYU_HEALTH_MWANZA` → `beyu-health-mwanza`.
 * Returns null when the code cannot produce a valid DNS label — the caller must
 * fail closed rather than invent a name.
 */
export function tenantSlugForCode(code: string): string | null {
  const slug = code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  if (slug.length === 0 || slug.length > 63) return null;
  if (!LABEL.test(slug)) return null;
  return slug;
}

/** True when `hostname` is a strict subdomain of `base` (never equal to it). */
export function isWithinNamespace(hostname: string, base: string): boolean {
  if (hostname === base) return false;
  if (!hostname.endsWith(`.${base}`)) return false;
  return hostname.length > base.length + 1;
}

/** True when the label is reserved and must not be registered as a tenant name. */
export function isReservedLabel(label: string): boolean {
  return RESERVED_LABELS.has(label.toLowerCase());
}
