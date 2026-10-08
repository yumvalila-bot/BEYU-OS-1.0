/**
 * CANONICAL SECTOR OS SUBDOMAIN CONTRACT — pure, no I/O, no framework imports.
 *
 *   health.beyu.co.tz       → HEALTH_OS       (catalogue code HEALTH)
 *   finance.beyu.co.tz      → FINANCE_OS      (catalogue code FINANCE)
 *   agriculture.beyu.co.tz  → AGRICULTURE_OS  (catalogue code AGRICULTURE)
 *   ujenzi.beyu.co.tz       → UJENZI_OS       (catalogue code UJENZI)
 *
 * This module is the ONE place a hostname is turned into a Sector OS routing
 * identity. It is consumed by the request proxy (`src/proxy.ts`), the sign-in
 * page, the launcher/navigation and the per-sector server refusals, so the
 * mapping cannot drift between them. There is no second table of domains and
 * no `host.includes("health")`-style inference anywhere.
 *
 * WHERE THE FACTS COME FROM
 *   • The subdomain LABEL of each Sector OS is declared on the canonical
 *     catalogue entry (`operating-system-catalog.ts` → `subdomain`). Foundation
 *     OS and the control plane carry none; shared capabilities are not
 *     operating systems and never appear here.
 *   • The APEX (`beyu.co.tz`) is deployment configuration
 *     (`BEYU_CANONICAL_DOMAIN`). When it is not configured, NO host resolves to
 *     a sector and the application behaves exactly as it did before this module
 *     existed.
 *   • Hostnames are normalised by the ONE existing normaliser
 *     (`tenant-domain/hostname.ts`) — lower-case, numeric port stripped, one
 *     trailing root dot removed, everything else (schemes, paths, userinfo,
 *     wildcards, underscores, IDN, IP literals) rejected.
 *
 * HARD BOUNDARIES
 *   • PRESENTATION / ROUTING ONLY. A resolution selects which home a request is
 *     offered and which cross-sector paths are redirected to their canonical
 *     host. It is never an authentication or authorization input: no Principal,
 *     no `can()`, no tenant, no entity, no country, no classification and no
 *     policy is read or implied here, and every Sector OS route re-runs its own
 *     server-side gate on every request regardless of the host.
 *   • EXACT MATCH ONLY. `<label>.<apex>` resolves; `evil-health.<apex>`,
 *     `health.<apex>.attacker.example`, `x.health.<apex>`, an IP literal, a
 *     preview host, a malformed Host and an unknown subdomain all resolve to
 *     NEUTRAL — no sector, no fallback, control-plane behaviour with every
 *     existing check in force.
 *   • REDIRECT TARGETS ARE NEVER BUILT FROM INPUT. A redirect host is composed
 *     from the catalogue label and the configured apex, never from the request,
 *     so the proxy cannot be used as an open redirector.
 */
import { normalizeHostname } from "./tenant-domain/hostname";
import {
  SECTOR_OPERATING_SYSTEMS,
  type OperatingSystemDestination,
  type SectorSubdomainLabel,
} from "./operating-system-catalog";

/** Root-of-platform labels that are the canonical BEYU OS entry, never a sector. */
export const CANONICAL_ROOT_LABELS = ["www"] as const;

/**
 * Route prefixes each Sector OS OWNS, beyond its catalogue `href`. Health keeps
 * its two pre-existing aliases (`/health` entry/denial page, `/health/os`
 * mount alias). Nothing else is listed: `/api/*`, `/launcher`, `/os`, shared
 * capabilities and Foundation are served in place on every host.
 */
const ADDITIONAL_OWNED_PREFIXES: Partial<Record<OperatingSystemDestination["code"], readonly string[]>> = {
  HEALTH: ["/health"],
};

/** A Sector OS that has a canonical subdomain (the four). */
export type SubdomainSectorOS = OperatingSystemDestination & { subdomain: SectorSubdomainLabel };

/** The canonical Sector OSs that have a subdomain, in catalogue order. */
export const SUBDOMAIN_SECTOR_OPERATING_SYSTEMS: readonly SubdomainSectorOS[] = SECTOR_OPERATING_SYSTEMS.filter(
  (destination): destination is SubdomainSectorOS => typeof destination.subdomain === "string",
);

export type SectorDomainOptions = {
  /**
   * The configured apex (already normalised, e.g. `beyu.co.tz`) or null when no
   * canonical domain is configured — in which case nothing resolves to a sector.
   */
  canonicalDomain: string | null;
  /** Permit `<label>.localhost` (development only; never true in production). */
  allowLocalhost: boolean;
};

export type SectorHostResolution =
  /** `<label>.<apex>` (or `<label>.localhost` in development): a canonical Sector OS host. */
  | { kind: "SECTOR"; hostname: string; os: SubdomainSectorOS; base: string }
  /** The apex itself or `www.<apex>`: the canonical BEYU OS entry. */
  | { kind: "CANONICAL_ROOT"; hostname: string }
  /**
   * Anything else: a preview host, localhost, no Host, a malformed Host, an
   * unknown subdomain. No sector is selected; the control plane serves as before.
   */
  | { kind: "NEUTRAL"; hostname: string | null };

/**
 * Parse the configured apex. Only a syntactically valid multi-label DNS name is
 * accepted; anything else disables sector-host resolution (fail closed to "no
 * sector", never to a guessed domain).
 */
export function parseCanonicalDomain(raw: string | null | undefined): string | null {
  const normalized = normalizeHostname(raw);
  if (!normalized.ok || normalized.scope !== "HOSTNAME") return null;
  return normalized.hostname;
}

/** Deployment configuration for this process. Read at request time, never cached at build. */
export function sectorDomainOptionsFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): SectorDomainOptions {
  return {
    canonicalDomain: parseCanonicalDomain(env["BEYU_CANONICAL_DOMAIN"]),
    allowLocalhost: env["NODE_ENV"] !== "production",
  };
}

function sectorForLabel(label: string): SubdomainSectorOS | null {
  return SUBDOMAIN_SECTOR_OPERATING_SYSTEMS.find((destination) => destination.subdomain === label) ?? null;
}

/**
 * Resolve a raw Host value to a canonical Sector OS host, the canonical root, or
 * nothing. Exact match only; see the module header for what is refused.
 */
export function resolveSectorHost(
  rawHost: string | null | undefined,
  options: SectorDomainOptions,
): SectorHostResolution {
  const normalized = normalizeHostname(rawHost);
  if (!normalized.ok) return { kind: "NEUTRAL", hostname: null };
  const { hostname } = normalized;
  if (normalized.scope === "LOCAL") return { kind: "NEUTRAL", hostname };

  const bases: string[] = [];
  if (options.canonicalDomain) bases.push(options.canonicalDomain);
  if (options.allowLocalhost) bases.push("localhost");

  for (const base of bases) {
    if (hostname === base) return { kind: "CANONICAL_ROOT", hostname };
    if (!hostname.endsWith(`.${base}`)) continue;
    const label = hostname.slice(0, hostname.length - base.length - 1);
    // Exactly one label between the host and the base. `a.health.<apex>` is a
    // governed TENANT hostname (tenant-domain registry), not a sector host.
    if (label.length === 0 || label.includes(".")) return { kind: "NEUTRAL", hostname };
    if ((CANONICAL_ROOT_LABELS as readonly string[]).includes(label)) {
      return { kind: "CANONICAL_ROOT", hostname };
    }
    const os = sectorForLabel(label);
    if (os) return { kind: "SECTOR", hostname, os, base };
    return { kind: "NEUTRAL", hostname };
  }
  return { kind: "NEUTRAL", hostname };
}

/** True when the host is the apex, `www.<apex>` or one of the canonical sector hosts. */
export function isCanonicalBeyuHost(rawHost: string | null | undefined, options: SectorDomainOptions): boolean {
  return resolveSectorHost(rawHost, options).kind !== "NEUTRAL";
}

/**
 * The canonical Sector OS whose route namespace contains `pathname`, or null
 * when the path belongs to the control plane, a shared capability, Foundation,
 * the API, or nothing in particular. Uses the catalogue `href` plus the declared
 * pre-existing aliases; never infers from URL text.
 */
export function sectorOwningPath(pathname: string | null | undefined): SubdomainSectorOS | null {
  const path = pathname ?? "";
  const within = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  for (const destination of SUBDOMAIN_SECTOR_OPERATING_SYSTEMS) {
    const prefixes = [destination.href, ...(ADDITIONAL_OWNED_PREFIXES[destination.code] ?? [])];
    if (prefixes.some(within)) return destination;
  }
  return null;
}

/**
 * The canonical absolute origin of a Sector OS for a given base, composed from
 * catalogue + configuration only. For the production apex this is always
 * `https://` with no port; for the development `localhost` base the caller's
 * scheme and port are preserved so `next dev` keeps working.
 */
export function canonicalSectorOrigin(
  os: SubdomainSectorOS,
  base: string,
  development?: { protocol: string; port: string },
): string {
  if (base === "localhost" && development) {
    const port = development.port ? `:${development.port}` : "";
    return `${development.protocol}//${os.subdomain}.localhost${port}`;
  }
  return `https://${os.subdomain}.${base}`;
}

/* -------------------------------------------------------------------------- */
/* Proxy decision                                                             */
/* -------------------------------------------------------------------------- */

export type ProxyRequestFacts = {
  host: string | null | undefined;
  pathname: string;
  method: string;
  /** The `Origin` request header, when present. */
  origin: string | null | undefined;
  /** Scheme/port of the incoming URL — used ONLY for the development localhost base. */
  protocol: string;
  port: string;
};

export type ProxyAction =
  | { kind: "NEXT"; sector: SectorHostResolution }
  | { kind: "REDIRECT"; status: 307; location: string; sector: SectorHostResolution }
  | { kind: "FORBIDDEN"; reason: "ORIGIN_MISMATCH" };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The `host[:port]` of an `Origin` header value, or null when the header is
 * absent. An unparseable value (including the literal `null` origin) yields
 * INVALID, which fails every comparison below — the fail-closed direction.
 */
function originHost(origin: string | null | undefined): string | null | "INVALID" {
  if (origin === null || origin === undefined || origin === "") return null;
  try {
    const host = new URL(origin).host.trim().toLowerCase();
    return host.length > 0 ? host : "INVALID";
  } catch {
    return "INVALID";
  }
}

/**
 * True when an Origin host and the request Host denote the same origin host:
 * byte-equal (`host:port`, which also covers IP literals), or equal after the
 * one canonical normalisation (so `Example.beyu.co.tz:443` ≡ `example.beyu.co.tz`).
 */
function sameOriginHost(origin: string, requestHost: string | null | undefined): boolean {
  const request = (requestHost ?? "").trim().toLowerCase();
  if (request.length === 0) return false;
  if (origin === request) return true;
  const a = normalizeHostname(origin);
  const b = normalizeHostname(request);
  return a.ok && b.ok && a.hostname === b.hostname;
}

/**
 * The ONE routing decision for a request, as a pure function of request facts
 * and configuration. `src/proxy.ts` is a thin adapter around it.
 *
 *   1. Unsafe method with a foreign `Origin` → FORBIDDEN. Same-origin requests,
 *      requests between canonical BEYU hosts, requests without `Origin`
 *      (server-to-server webhooks, the mobile API) and all safe methods pass.
 *      No CORS header is ever emitted, so this only ever REFUSES.
 *   2. Sector host + a path owned by a DIFFERENT canonical sector → 307 to the
 *      same path on that sector's canonical host. The target host comes from the
 *      catalogue and configuration, never from the request. Because the target
 *      host owns the path, the redirected request is served — no loop.
 *   3. Everything else → NEXT (served in place; the route's own gate decides).
 */
export function decideProxyAction(facts: ProxyRequestFacts, options: SectorDomainOptions): ProxyAction {
  const sector = resolveSectorHost(facts.host, options);

  if (!SAFE_METHODS.has(facts.method.toUpperCase())) {
    const origin = originHost(facts.origin);
    if (origin !== null) {
      const sameHost = origin !== "INVALID" && sameOriginHost(origin, facts.host);
      // A request between two canonical BEYU hosts (www ↔ sector) is permitted
      // only when the REQUEST host is itself canonical; a preview or unknown host
      // never accepts a cross-host origin, even a canonical one.
      const canonicalPeer =
        origin !== "INVALID" && sector.kind !== "NEUTRAL" && isCanonicalBeyuHost(origin, options);
      if (!sameHost && !canonicalPeer) return { kind: "FORBIDDEN", reason: "ORIGIN_MISMATCH" };
    }
  }

  if (sector.kind !== "SECTOR") return { kind: "NEXT", sector };

  const owner = sectorOwningPath(facts.pathname);
  if (!owner || owner.code === sector.os.code) return { kind: "NEXT", sector };

  const origin = canonicalSectorOrigin(owner, sector.base, { protocol: facts.protocol, port: facts.port });
  return { kind: "REDIRECT", status: 307, location: `${origin}${facts.pathname}`, sector };
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

export type LinkContext = {
  /** Resolution of the CURRENT request's host. */
  current: SectorHostResolution;
  /** Deployment configuration. */
  options: SectorDomainOptions;
  /**
   * True only when the session cookie is scoped to the canonical apex
   * (`BEYU_SESSION_COOKIE_DOMAIN` equals `BEYU_CANONICAL_DOMAIN`). Without a
   * shared session a cross-host link would force a second sign-in, so links
   * stay relative.
   */
  sharedSession: boolean;
};

/**
 * The href the launcher/navigation should use for a destination from the
 * current request: the canonical absolute subdomain URL when the deployment is
 * configured for it and the current request is already on a canonical BEYU host,
 * otherwise the pre-existing relative route. Destinations without a subdomain
 * (control plane, Foundation) always keep their relative href.
 */
export function canonicalDestinationHref(destination: OperatingSystemDestination, context: LinkContext): string {
  if (!destination.subdomain) return destination.href;
  if (!context.sharedSession || !context.options.canonicalDomain) return destination.href;
  if (context.current.kind === "NEUTRAL") return destination.href;
  if (context.current.kind === "SECTOR" && context.current.base !== context.options.canonicalDomain) {
    return destination.href;
  }
  return `${canonicalSectorOrigin(destination as SubdomainSectorOS, context.options.canonicalDomain)}${destination.href}`;
}
