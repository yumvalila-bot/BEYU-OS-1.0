/**
 * CANONICAL HOST CONTRACT — pure, no I/O, no framework imports.
 *
 *   beyu.co.tz              → BEYU OS control plane   (`/os`, sign-in at `/`)
 *   health.beyu.co.tz       → HEALTH_OS               (`/os/health`)
 *   finance.beyu.co.tz      → FINANCE_OS              (`/os/finance`)
 *   agriculture.beyu.co.tz  → AGRICULTURE_OS          (`/os/agriculture`)
 *   ujenzi.beyu.co.tz       → UJENZI_OS               (`/os/ujenzi`)
 *   foundation.beyu.co.tz   → FOUNDATION              (`/os/foundation`)
 *   familyoffice.beyu.co.tz → FAMILY OFFICE capability (`/os/family`)
 *   noelia.beyu.co.tz       → NOELIA_AI                (`/os/noelia`)
 *
 * This module is the ONE place a hostname is turned into a routing identity. It
 * is consumed by the request proxy (`src/proxy.ts`), the sign-in page, the
 * launcher/navigation and the per-OS server refusals, so the mapping cannot
 * drift between them. There is no second table of domains and no
 * `host.includes("health")`-style inference anywhere.
 *
 * THE PRINCIPLE THIS FILE IMPLEMENTS
 *   HOSTNAME IDENTIFIES CONTEXT. AUTHORIZATION GRANTS ACCESS.
 *
 *   Each canonical OS/subdomain is an INDEPENDENT USER ENTRY POINT: reaching
 *   `health.beyu.co.tz` never passes through the BEYU landing UI, and the
 *   browser-facing URL stays that canonical hostname. BEYU OS still governs
 *   underneath — it simply is not a mandatory user-facing router.
 *
 * WHERE THE FACTS COME FROM
 *   • The host LABEL of every destination is declared on the canonical
 *     catalogue (`operating-system-catalog.ts` → `subdomain`): the FIVE Sector
 *     OSs and the two canonical SHARED surfaces (Family Office capability,
 *     NOELIA_AI interface). The control plane carries none — it IS the root.
 *   • The APEX (`beyu.co.tz`) is deployment configuration
 *     (`BEYU_CANONICAL_DOMAIN`). When it is not configured, NO host resolves to
 *     a destination and the application behaves exactly as it did before this
 *     module existed.
 *   • Hostnames are normalised by the ONE existing normaliser
 *     (`tenant-domain/hostname.ts`) — lower-case, numeric port stripped, one
 *     trailing root dot removed, everything else (schemes, paths, userinfo,
 *     wildcards, underscores, IDN, IP literals) rejected.
 *
 * HARD BOUNDARIES
 *   • PRESENTATION / ROUTING ONLY. A resolution selects which home a request is
 *     offered and which cross-OS paths are redirected to their canonical host.
 *     It is never an authentication or authorization input: no Principal, no
 *     `can()`, no tenant, no entity, no country, no classification and no policy
 *     is read or implied here, and every route re-runs its own server-side gate
 *     on every request regardless of the host.
 *   • EXACT MATCH ONLY. `<label>.<apex>` resolves; `evil-health.<apex>`,
 *     `health.<apex>.attacker.example`, `x.health.<apex>`, an IP literal, a
 *     preview host, a malformed Host and an unknown subdomain all resolve to
 *     NEUTRAL — no destination, no fallback, control-plane behaviour with every
 *     existing check in force. Governed TENANT hostnames
 *     (`<tenant>.health.<apex>`) stay with the tenant-domain registry.
 *   • REDIRECT TARGETS ARE NEVER BUILT FROM INPUT. A redirect host is composed
 *     from the catalogue label and the configured apex, never from the request,
 *     so the proxy cannot be used as an open redirector.
 *   • SHARED SURFACES ARE NOT OSES. `familyoffice`/`noelia` resolve to the shared
 *     capability / governed-AI interface, never to a Sector OS, and a Sector OS
 *     route is never served with one of them as its identity.
 */
import { normalizeHostname } from "./tenant-domain/hostname";
import {
  BEYU_CONTROL_PLANE,
  CANONICAL_SURFACES,
  SECTOR_OPERATING_SYSTEMS,
  destinationSignInSubtitle,
  type CanonicalHostedDestination,
  type CanonicalSurfaceDestination,
  type OperatingSystemDestination,
  type SectorSubdomainLabel,
} from "./operating-system-catalog";

/** Root-of-platform labels that are the canonical BEYU OS entry, never a destination. */
export const CANONICAL_ROOT_LABELS = ["www"] as const;

/**
 * Route prefixes each Sector OS OWNS, beyond its catalogue `href`. Health keeps
 * its two pre-existing aliases (`/health` entry/denial page, `/health/os` mount
 * alias). Nothing else is listed: `/api/*`, `/launcher`, `/os`, shared
 * capabilities and the shared surfaces are served in place on every host.
 */
const ADDITIONAL_OWNED_PREFIXES: Partial<Record<OperatingSystemDestination["code"], readonly string[]>> = {
  HEALTH: ["/health"],
};

/** An operating system that has a canonical host (all five do). */
export type CanonicalOSDestination = OperatingSystemDestination & { subdomain: SectorSubdomainLabel };

/** The canonical OSs that have a canonical host, in catalogue order. */
export const CANONICAL_OS_HOSTS: readonly CanonicalOSDestination[] = SECTOR_OPERATING_SYSTEMS.filter(
  (destination): destination is CanonicalOSDestination => typeof destination.subdomain === "string",
);

/**
 * Any canonical destination a hostname can select: the control plane, a Sector
 * OS, or a shared surface. All three expose `code`, `name`, `href` and `icon`,
 * so callers that only need presentation facts work with the union directly.
 */
export type CanonicalContext = OperatingSystemDestination | CanonicalSurfaceDestination;

export type CanonicalHostOptions = {
  /**
   * The configured apex (already normalised, e.g. `beyu.co.tz`) or null when no
   * canonical domain is configured — in which case nothing resolves to a
   * destination.
   */
  canonicalDomain: string | null;
  /** Permit `<label>.localhost` (development only; never true in production). */
  allowLocalhost: boolean;
};

export type CanonicalHostResolution =
  /** `<label>.<apex>` of a Sector OS: an independent OS entry point. */
  | { kind: "SECTOR_OS"; hostname: string; os: CanonicalOSDestination; base: string }
  /** `<label>.<apex>` of a canonical SHARED surface (capability / AI interface). */
  | { kind: "SURFACE"; hostname: string; surface: CanonicalSurfaceDestination; base: string }
  /** The apex itself or `www.<apex>`: the canonical BEYU OS entry. */
  | { kind: "CONTROL_PLANE"; hostname: string; base: string }
  /**
   * Anything else: a preview host, localhost, no Host, a malformed Host, an
   * unknown subdomain, a governed tenant hostname. No destination is selected;
   * the control plane serves as before.
   */
  | { kind: "NEUTRAL"; hostname: string | null };

/**
 * Parse the configured apex. Only a syntactically valid multi-label DNS name is
 * accepted; anything else disables canonical-host resolution (fail closed to
 * "no destination", never to a guessed domain).
 */
export function parseCanonicalDomain(raw: string | null | undefined): string | null {
  const normalized = normalizeHostname(raw);
  if (!normalized.ok || normalized.scope !== "HOSTNAME") return null;
  return normalized.hostname;
}

/** Deployment configuration for this process. Read at request time, never cached at build. */
export function canonicalHostOptionsFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): CanonicalHostOptions {
  return {
    canonicalDomain: parseCanonicalDomain(env["BEYU_CANONICAL_DOMAIN"]),
    allowLocalhost: env["NODE_ENV"] !== "production",
  };
}

function resolutionForLabel(label: string): { os: CanonicalOSDestination } | { surface: CanonicalSurfaceDestination } | null {
  const os = CANONICAL_OS_HOSTS.find((destination) => destination.subdomain === label);
  if (os) return { os };
  const surface = CANONICAL_SURFACES.find((destination) => destination.subdomain === label);
  if (surface) return { surface };
  return null;
}

/**
 * Resolve a raw Host value to a canonical destination host, the canonical root,
 * or nothing. Exact match only; see the module header for what is refused.
 */
export function resolveCanonicalHost(
  rawHost: string | null | undefined,
  options: CanonicalHostOptions,
): CanonicalHostResolution {
  const normalized = normalizeHostname(rawHost);
  if (!normalized.ok) return { kind: "NEUTRAL", hostname: null };
  const { hostname } = normalized;
  if (normalized.scope === "LOCAL") return { kind: "NEUTRAL", hostname };

  const bases: string[] = [];
  if (options.canonicalDomain) bases.push(options.canonicalDomain);
  if (options.allowLocalhost) bases.push("localhost");

  for (const base of bases) {
    if (hostname === base) return { kind: "CONTROL_PLANE", hostname, base };
    if (!hostname.endsWith(`.${base}`)) continue;
    const label = hostname.slice(0, hostname.length - base.length - 1);
    // Exactly one label between the host and the base. `a.health.<apex>` is a
    // governed TENANT hostname (tenant-domain registry), not a destination host.
    if (label.length === 0 || label.includes(".")) return { kind: "NEUTRAL", hostname };
    if ((CANONICAL_ROOT_LABELS as readonly string[]).includes(label)) {
      return { kind: "CONTROL_PLANE", hostname, base };
    }
    const match = resolutionForLabel(label);
    if (!match) return { kind: "NEUTRAL", hostname };
    return "os" in match
      ? { kind: "SECTOR_OS", hostname, os: match.os, base }
      : { kind: "SURFACE", hostname, surface: match.surface, base };
  }
  return { kind: "NEUTRAL", hostname };
}

/** True when the host is the apex, `www.<apex>` or any canonical destination host. */
export function isCanonicalBeyuHost(rawHost: string | null | undefined, options: CanonicalHostOptions): boolean {
  return resolveCanonicalHost(rawHost, options).kind !== "NEUTRAL";
}

/**
 * The configured base (`<apex>` or the development `localhost`) a canonical
 * resolution was matched against, or null for a NEUTRAL host. Used to decide
 * whether an absolute cross-host link is safe to render: it is only rendered
 * when the current request arrived on the canonical apex itself.
 */
export function resolutionBase(resolution: CanonicalHostResolution): string | null {
  return resolution.kind === "NEUTRAL" ? null : resolution.base;
}

/**
 * The canonical destination a resolution selected: the control plane for the
 * apex/`www`, the OS or the surface for a `<label>.<apex>` host, and nothing at
 * all for a NEUTRAL host. Presentation facts only.
 */
export function canonicalContextOf(resolution: CanonicalHostResolution): CanonicalContext | null {
  switch (resolution.kind) {
    case "CONTROL_PLANE":
      return BEYU_CONTROL_PLANE;
    case "SECTOR_OS":
      return resolution.os;
    case "SURFACE":
      return resolution.surface;
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Destination frontend                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The complete frontend contract of the destination a host selected: the
 * catalogue entry (which carries the registry code, destination class, global
 * operating status, headline, accent and highlights) plus the sign-in sub-line
 * for that destination.
 *
 * PRESENTATION ONLY. There is no authorization fact in this type and none may be
 * added: `status` is the GLOBAL operating state of the destination, never a
 * statement about the requesting identity, and whether a signed-in user may
 * enter is answered exclusively by the pre-existing server-side authorization
 * (`authorizedOperatingSystems()` for a Sector OS, the destination's own declared
 * guard for a shared surface). An ACTIVE destination and a user who does not hold
 * access to it are both true at the same time.
 */
export type CanonicalDestination = {
  /** Which class of canonical host selected this destination. */
  hostKind: "CONTROL_PLANE" | "SECTOR_OS" | "SURFACE";
  /** The ONE catalogue entry — every presentation fact comes from it. */
  context: CanonicalContext;
  /** `Sign in to <destination> — governed by BEYU OS`. */
  signInSubtitle: string;
};

/**
 * Resolve a host resolution to its destination frontend contract, or null for a
 * NEUTRAL host (a preview host, localhost without configuration, an unknown
 * subdomain, a malformed Host, a governed tenant hostname). A NEUTRAL host
 * selects no destination and keeps the pre-existing control-plane surface —
 * which is the fail-safe direction: an attacker-controlled host can never
 * select a first-class destination frontend, privileged or otherwise.
 */
export function destinationForResolution(resolution: CanonicalHostResolution): CanonicalDestination | null {
  const context = canonicalContextOf(resolution);
  if (!context) return null;
  return {
    hostKind: resolution.kind === "SURFACE" ? "SURFACE" : resolution.kind === "SECTOR_OS" ? "SECTOR_OS" : "CONTROL_PLANE",
    context,
    signInSubtitle: destinationSignInSubtitle(context),
  };
}

/**
 * The canonical Sector OS whose route namespace contains `pathname` (all five,
 * Foundation included — it is an independently addressable OS), or null when the
 * path belongs to the control plane, a shared capability/surface, the API, or
 * nothing in particular. Uses the catalogue `href` plus the declared pre-existing
 * aliases; never infers ownership from URL text.
 */
export function osOwningPath(pathname: string | null | undefined): CanonicalOSDestination | null {
  const path = pathname ?? "";
  const within = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  for (const destination of CANONICAL_OS_HOSTS) {
    const prefixes = [destination.href, ...(ADDITIONAL_OWNED_PREFIXES[destination.code] ?? [])];
    if (prefixes.some(within)) return destination;
  }
  return null;
}

/**
 * The canonical absolute origin of a destination for a given base, composed from
 * catalogue + configuration only. For the production apex this is always
 * `https://` with no port; for the development `localhost` base the caller's
 * scheme and port are preserved so `next dev` keeps working.
 */
export function canonicalOrigin(
  destination: CanonicalHostedDestination & { subdomain: string },
  base: string,
  development?: { protocol: string; port: string },
): string {
  if (base === "localhost" && development) {
    const port = development.port ? `:${development.port}` : "";
    return `${development.protocol}//${destination.subdomain}.localhost${port}`;
  }
  return `https://${destination.subdomain}.${base}`;
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
  | { kind: "NEXT"; host: CanonicalHostResolution }
  | { kind: "REDIRECT"; status: 307; location: string; host: CanonicalHostResolution }
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
 *   2. Canonical OS/surface host + a path owned by a DIFFERENT canonical OS →
 *      307 to the same path on that OS's canonical host. The target host comes
 *      from the catalogue and configuration, never from the request. Because the
 *      target host owns the path, the redirected request is served — no loop.
 *      The apex/`www` control plane is deliberately exempt: it is the central
 *      BEYU experience and every pre-existing URL keeps working there.
 *   3. Everything else → NEXT (served in place; the route's own gate decides).
 */
export function decideProxyAction(facts: ProxyRequestFacts, options: CanonicalHostOptions): ProxyAction {
  const host = resolveCanonicalHost(facts.host, options);

  if (!SAFE_METHODS.has(facts.method.toUpperCase())) {
    const origin = originHost(facts.origin);
    if (origin !== null) {
      const sameHost = origin !== "INVALID" && sameOriginHost(origin, facts.host);
      // A request between two canonical BEYU hosts (www ↔ any destination host)
      // is permitted only when the REQUEST host is itself canonical; a preview or
      // unknown host never accepts a cross-host origin, even a canonical one.
      const canonicalPeer =
        origin !== "INVALID" && host.kind !== "NEUTRAL" && isCanonicalBeyuHost(origin, options);
      if (!sameHost && !canonicalPeer) return { kind: "FORBIDDEN", reason: "ORIGIN_MISMATCH" };
    }
  }

  if (host.kind === "NEUTRAL" || host.kind === "CONTROL_PLANE") return { kind: "NEXT", host };

  const owner = osOwningPath(facts.pathname);
  const hostOSCode = host.kind === "SECTOR_OS" ? host.os.code : null;
  if (!owner || owner.code === hostOSCode) return { kind: "NEXT", host };

  const origin = canonicalOrigin(owner, host.base, { protocol: facts.protocol, port: facts.port });
  return { kind: "REDIRECT", status: 307, location: `${origin}${facts.pathname}`, host };
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

export type LinkContext = {
  /** Resolution of the CURRENT request's host. */
  current: CanonicalHostResolution;
  /** Deployment configuration. */
  options: CanonicalHostOptions;
  /**
   * True only when the session cookie is scoped to the canonical apex
   * (`BEYU_SESSION_COOKIE_DOMAIN` equals `BEYU_CANONICAL_DOMAIN`). Without a
   * shared session a cross-host link would force a second sign-in, so links
   * stay relative.
   */
  sharedSession: boolean;
};

/**
 * The href the launcher/navigation should use for a destination from the current
 * request: the canonical absolute host URL when the deployment is configured for
 * it and the current request is already on a canonical BEYU host, otherwise the
 * pre-existing relative route. Destinations without a canonical host (the
 * control plane and every other shared capability) always keep their relative
 * href. This is the OS-switching affordance: from any canonical host, another
 * authorized OS is one link away — and the destination re-runs its own
 * server-side authorization on arrival.
 */
export function canonicalDestinationHref(
  destination: CanonicalHostedDestination & { code?: string; name?: string },
  context: LinkContext,
): string {
  if (!destination.subdomain) return destination.href;
  if (!context.sharedSession || !context.options.canonicalDomain) return destination.href;
  // Only from the configured apex: a preview/neutral host gets the relative
  // route (the cookie would not travel), and the development `*.localhost` base
  // must never render a production URL.
  if (resolutionBase(context.current) !== context.options.canonicalDomain) return destination.href;
  return `${canonicalOrigin(destination as CanonicalHostedDestination & { subdomain: string }, context.options.canonicalDomain)}${destination.href}`;
}
