/**
 * THE CANONICAL HOST → DESTINATION CONTRACT (typed, pure, no I/O).
 *
 *   beyu.co.tz              → HOME           (`/os`, sign-in at `/`)
 *   health.beyu.co.tz       → HEALTH_OS      (`/os/health`)
 *   finance.beyu.co.tz      → FINANCE_OS     (`/os/finance`)
 *   agriculture.beyu.co.tz  → AGRICULTURE_OS (`/os/agriculture`)
 *   ujenzi.beyu.co.tz       → UJENZI_OS      (`/os/ujenzi`)
 *   foundation.beyu.co.tz   → FOUNDATION     (`/os/foundation`)
 *   familyoffice.beyu.co.tz → FAMILY_OFFICE  (`/os/family`)
 *   noelia.beyu.co.tz       → NOELIA_AI      (`/os/noelia`)
 *
 * WHAT THIS MODULE IS
 *   The ONE typed statement of the host-to-destination contract, and the ONE
 *   server-side resolver that returns it as a discriminated result
 *   (`resolved` / `unknown_host` / `invalid_host`). It is the presentation-facing
 *   vocabulary of the routing layer: a destination identifier and the internal
 *   route that identifier lives at.
 *
 * WHAT THIS MODULE IS NOT
 *   • It is NOT a second host registry. The hostnames come from
 *     `operating-system-catalog.ts` (`subdomain`), the apex from deployment
 *     configuration, and every resolution is delegated to the pre-existing pure
 *     contract `canonical-hosts.ts` (`resolveCanonicalHost`) and the ONE existing
 *     hostname normaliser (`tenant-domain/hostname.ts`). Nothing here re-derives,
 *     re-parses or re-lists a domain.
 *   • It is NOT an authorization authority — and it never can become one. A
 *     resolution carries no principal, no tenant, no entity, no country, no
 *     classification, no role and no permission. It answers exactly two
 *     questions: WHICH EXPERIENCE DID THE HOSTNAME REQUEST, and WHERE DOES THAT
 *     EXPERIENCE LIVE. Whether the authenticated identity may ENTER is decided
 *     afterwards by the pre-existing gates (`checkBeyuOSAuthorization`,
 *     `authorizedGovernedDestinations`, the Foundation organization resolver, the
 *     Health federation mount, the shared-surface guards) on every request.
 *
 * THE RULE
 *   THE HOSTNAME SELECTS THE REQUESTED APPLICATION EXPERIENCE.
 *   THE IDENTITY AND GOVERNANCE SYSTEMS DECIDE WHETHER IT IS GRANTED.
 *
 * FAIL-CLOSED
 *   An unknown hostname never resolves to a destination and never falls back to
 *   a privileged one; a malformed hostname is rejected outright. Unknown and
 *   invalid hosts keep the pre-existing NEUTRAL behaviour (the BEYU control-plane
 *   entry with every check in force), which is the safe direction: an
 *   attacker-controlled name can never select a destination frontend at all.
 */
import { normalizeHostname, type HostnameRejection } from "./tenant-domain/hostname";
import {
  CANONICAL_ROOT_LABELS,
  resolveCanonicalHost,
  type CanonicalHostOptions,
} from "./canonical-hosts";
import {
  BEYU_CONTROL_PLANE,
  CANONICAL_NON_OS_DESTINATIONS,
  SECTOR_OPERATING_SYSTEMS,
  type CanonicalNonOSDestination,
  type OperatingSystemDestination,
} from "./operating-system-catalog";

/**
 * The destination identifiers of the canonical contract. `HOME` is the BEYU OS
 * control plane (the apex and its explicit `www` root label); the four Sector OSs
 * are `*_OS`; FOUNDATION is the separate nonprofit organization; FAMILY_OFFICE and
 * NOELIA_AI are the two canonical shared surfaces. No fifth Sector OS exists, and
 * neither the Foundation nor the Family Office identifier is ever an OS one.
 */
export const HOST_DESTINATION_IDENTIFIERS = [
  "HOME",
  "HEALTH_OS",
  "FINANCE_OS",
  "AGRICULTURE_OS",
  "UJENZI_OS",
  "FOUNDATION",
  "FAMILY_OFFICE",
  "NOELIA_AI",
] as const;

export type HostDestination = (typeof HOST_DESTINATION_IDENTIFIERS)[number];

/**
 * Catalogue identity → contract identifier. Total by construction: the key type
 * is the catalogue's own code union, so adding a catalogue destination without
 * giving it a contract identifier is a compile error, not a silent gap.
 */
type CatalogueDestination = OperatingSystemDestination | CanonicalNonOSDestination;

const DESTINATION_IDENTIFIER_BY_CODE: Record<CatalogueDestination["code"], HostDestination> = {
  BEYU: "HOME",
  HEALTH: "HEALTH_OS",
  FINANCE: "FINANCE_OS",
  AGRICULTURE: "AGRICULTURE_OS",
  UJENZI: "UJENZI_OS",
  FOUNDATION: "FOUNDATION",
  FAMILY_OFFICE: "FAMILY_OFFICE",
  NOELIA_AI: "NOELIA_AI",
};

/** The catalogue entry a contract identifier corresponds to. */
export function destinationCatalogueEntry(
  destination: HostDestination,
): CatalogueDestination {
  if (destination === "HOME") return BEYU_CONTROL_PLANE;
  const entry = [...SECTOR_OPERATING_SYSTEMS, ...CANONICAL_NON_OS_DESTINATIONS].find(
    (candidate) => DESTINATION_IDENTIFIER_BY_CODE[candidate.code] === destination,
  );
  if (!entry) throw new Error(`no catalogue entry for host destination ${destination}`);
  return entry;
}

/**
 * The internal entry route of a destination — taken from the catalogue `href`,
 * never concatenated from input. `/os/health` is served by a route handler that
 * shares the Health federation mount with `/health/os`; the other seven are
 * pages. A destination identifier can never become an arbitrary URL.
 */
export function destinationRoute(destination: HostDestination): string {
  return destinationCatalogueEntry(destination).href;
}

/**
 * Host LABEL → destination identifier, apex-independent. This is the whole
 * mapping: the control plane's root labels (`www` is the explicitly permitted
 * root alias — see `CANONICAL_ROOT_LABELS`) plus one label per catalogue
 * destination that declares a canonical `subdomain`. No label is written twice
 * and none is inferred from URL text.
 */
export const HOST_DESTINATION_LABELS: Readonly<Record<string, HostDestination>> = Object.freeze({
  ...Object.fromEntries(CANONICAL_ROOT_LABELS.map((label) => [label, "HOME" as HostDestination])),
  ...Object.fromEntries(
    [...SECTOR_OPERATING_SYSTEMS, ...CANONICAL_NON_OS_DESTINATIONS]
      .filter((entry) => typeof entry.subdomain === "string")
      .map((entry) => [entry.subdomain as string, DESTINATION_IDENTIFIER_BY_CODE[entry.code]]),
  ),
});

/**
 * The canonical host-to-destination map for a configured apex — exactly the eight
 * hosts of the contract, apex first. `www.<apex>` is deliberately NOT an entry of
 * this map: it is an explicit root alias handled by the resolver, so the map
 * stays a one-host-per-destination contract.
 */
export function hostDestinationMap(apex: string): Record<string, HostDestination> {
  const normalized = normalizeHostname(apex);
  if (!normalized.ok || normalized.scope !== "HOSTNAME") {
    throw new Error(`hostDestinationMap requires a valid apex hostname, received ${JSON.stringify(apex)}`);
  }
  const map: Record<string, HostDestination> = { [normalized.hostname]: "HOME" };
  for (const [label, destination] of Object.entries(HOST_DESTINATION_LABELS)) {
    if (label === "" || (CANONICAL_ROOT_LABELS as readonly string[]).includes(label)) continue;
    map[`${label}.${normalized.hostname}`] = destination;
  }
  return map;
}

/** Why a well-formed request host selected no destination. */
export type UnknownHostReason =
  /** No canonical domain is configured for this deployment. */
  | "NO_CANONICAL_DOMAIN"
  /** A host of the execution environment (`localhost`, `127.0.0.1`, …). */
  | "LOCAL_SCOPE"
  /** A label of the configured apex that is not a canonical destination. */
  | "UNKNOWN_LABEL"
  /** A governed TENANT hostname (`<tenant>.<label>.<apex>`), not a destination. */
  | "TENANT_HOSTNAME"
  /** A well-formed host outside the configured apex (preview, foreign, look-alike). */
  | "OUTSIDE_CANONICAL_APEX";

/**
 * The outcome of resolving a request hostname. `resolved` is the ONLY status that
 * carries a destination or a route; `unknown_host` carries a normalized name but
 * no destination; `invalid_host` carries the normaliser's rejection reason.
 */
export type HostResolution =
  | {
      status: "resolved";
      /** The normalized hostname that resolved. */
      hostname: string;
      destination: HostDestination;
      /** The apex (or development `localhost` base) that matched. */
      base: string;
      /** The internal route the destination lives at (catalogue `href`). */
      route: string;
    }
  | { status: "unknown_host"; hostname: string; reason: UnknownHostReason }
  | { status: "invalid_host"; reason: HostnameRejection };

/**
 * Resolve a raw request host to its destination. Delegates the mapping to the ONE
 * authoritative contract and the ONE normaliser; adds only the classification the
 * contract needs (resolved vs. well-formed-but-unknown vs. malformed).
 *
 * The caller must pass the host the trusted server boundary actually received
 * (`Host`), never a client-supplied destination, tenant or forwarded value.
 */
export function resolveHostDestination(
  rawHost: string | null | undefined,
  options: CanonicalHostOptions,
): HostResolution {
  const normalized = normalizeHostname(rawHost);
  if (!normalized.ok) return { status: "invalid_host", reason: normalized.reason };

  const resolution = resolveCanonicalHost(rawHost, options);

  if (resolution.kind === "CONTROL_PLANE") {
    return {
      status: "resolved",
      hostname: resolution.hostname,
      destination: "HOME",
      base: resolution.base,
      route: destinationRoute("HOME"),
    };
  }
  if (resolution.kind === "SECTOR_OS") {
    const destination = DESTINATION_IDENTIFIER_BY_CODE[resolution.os.code];
    return {
      status: "resolved",
      hostname: resolution.hostname,
      destination,
      base: resolution.base,
      route: destinationRoute(destination),
    };
  }
  if (resolution.kind === "SURFACE") {
    const destination = DESTINATION_IDENTIFIER_BY_CODE[resolution.surface.code];
    return {
      status: "resolved",
      hostname: resolution.hostname,
      destination,
      base: resolution.base,
      route: destinationRoute(destination),
    };
  }

  return {
    status: "unknown_host",
    hostname: normalized.hostname,
    reason: unknownHostReason(normalized.hostname, normalized.scope, options),
  };
}

function unknownHostReason(
  hostname: string,
  scope: "LOCAL" | "HOSTNAME",
  options: CanonicalHostOptions,
): UnknownHostReason {
  if (scope === "LOCAL") return "LOCAL_SCOPE";
  const bases = [options.canonicalDomain, options.allowLocalhost ? "localhost" : null].filter(
    (base): base is string => typeof base === "string",
  );
  if (bases.length === 0) return "NO_CANONICAL_DOMAIN";
  for (const base of bases) {
    if (hostname === base) return "UNKNOWN_LABEL";
    if (!hostname.endsWith(`.${base}`)) continue;
    const label = hostname.slice(0, hostname.length - base.length - 1);
    // More than one label below the apex is the governed TENANT namespace
    // (`<tenant>.<label>.<apex>`), which the tenant-domain registry owns — never a
    // destination host.
    if (label.includes(".")) return "TENANT_HOSTNAME";
    return "UNKNOWN_LABEL";
  }
  return "OUTSIDE_CANONICAL_APEX";
}
