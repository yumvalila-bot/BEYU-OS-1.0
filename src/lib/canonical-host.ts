/**
 * Server-side access to the CURRENT request's canonical destination host.
 *
 * Thin wrappers over the pure contract in `canonical-hosts.ts` for server
 * components and route handlers. They read the `Host` header and nothing else,
 * and — like the contract — return PRESENTATION facts only: which home to
 * offer, which link to render, whether an OS surface is being asked for on
 * another canonical host. No authorization is derived from any of them; every
 * caller still runs its own session/tenant/permission/RLS gate.
 */
import { headers } from "next/headers";
import type { CanonicalHostedDestination } from "./operating-system-catalog";
import type { OperatingSystemDestination } from "./operating-system-catalog";
import {
  canonicalDestinationHref,
  canonicalEntryHref,
  canonicalHostOptionsFromEnvironment,
  resolveCanonicalHost,
  type CanonicalContext,
  type CanonicalHostResolution,
} from "./canonical-hosts";
import { sessionSharedAcrossCanonicalDomain } from "./session-cookie";

/** The resolution of the current request's Host header. */
export async function canonicalHostForRequest(): Promise<CanonicalHostResolution> {
  const h = await headers();
  return resolveCanonicalHost(h.get("host"), canonicalHostOptionsFromEnvironment());
}

/**
 * True when `rawHost` selects a canonical destination other than `code`.
 * Neutral/control-plane hosts return false. This function only refuses cross-
 * destination rendering; it never grants authority.
 */
export function isForeignCanonicalHost(
  rawHost: string | null | undefined,
  code: CanonicalContext["code"],
): boolean {
  const resolution = resolveCanonicalHost(rawHost, canonicalHostOptionsFromEnvironment());
  if (resolution.kind === "SECTOR_OS") return resolution.os.code !== code;
  if (resolution.kind === "SURFACE") return resolution.surface.code !== code;
  return false;
}

/** OS-typed compatibility wrapper for Sector OS layouts. */
export function isForeignOSHost(
  rawHost: string | null | undefined,
  code: OperatingSystemDestination["code"],
): boolean {
  return isForeignCanonicalHost(rawHost, code);
}

/** `isForeignOSHost` for the current request. */
export async function requestIsOnForeignOSHost(
  code: OperatingSystemDestination["code"],
): Promise<boolean> {
  const h = await headers();
  return isForeignOSHost(h.get("host"), code);
}

/** Generic current-request refusal for a Sector OS or non-OS destination. */
export async function requestIsOnForeignCanonicalHost(
  code: CanonicalContext["code"],
): Promise<boolean> {
  const h = await headers();
  return isForeignCanonicalHost(h.get("host"), code);
}

/**
 * A function that maps a canonical destination to the href the current request
 * should render (canonical absolute host URL when configured and safe,
 * otherwise the relative route). Computed once per request; presentation only.
 */
export async function destinationHrefForRequest(): Promise<(destination: CanonicalHostedDestination) => string> {
  const options = canonicalHostOptionsFromEnvironment();
  const current = await canonicalHostForRequest();
  const sharedSession = sessionSharedAcrossCanonicalDomain();
  return (destination) => canonicalDestinationHref(destination, { current, options, sharedSession });
}

/**
 * A function that maps a canonical destination to its PUBLIC ENTRY URL for an
 * anonymous visitor — the canonical hostname when `BEYU_CANONICAL_DOMAIN` is
 * configured, otherwise the pre-existing internal route.
 *
 * Used by the public homepage's destination gateway, which previously hard-coded
 * `https://health.beyu.co.tz/`, `https://finance.beyu.co.tz/`, … in the rendered
 * markup. Those literals (a) drift from the catalogue the rest of the routing
 * layer is derived from, and (b) point at hosts that are not attached in an
 * environment where the apex is not configured (preview deployments). The host is
 * now composed from the catalogue + configuration only; no label is written here.
 */
export async function entryHrefForRequest(): Promise<(destination: CanonicalHostedDestination) => string> {
  const options = canonicalHostOptionsFromEnvironment();
  if (!options.allowLocalhost) {
    // Production: the composed origin is always `https://<label>.<apex>`; no
    // request fact is needed at all.
    return (destination) => canonicalEntryHref(destination, options);
  }
  // Development only: `next dev` serves plain HTTP, so preserve the request's
  // port so a composed `<label>.localhost:<port>` URL is reachable. The Host
  // header is the only request fact read — the same one the resolver uses.
  const h = await headers();
  const port = /:(\d{1,5})$/.exec(h.get("host") ?? "")?.[1] ?? "";
  return (destination) => canonicalEntryHref(destination, options, { protocol: "http:", port });
}
