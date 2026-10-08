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
  canonicalHostOptionsFromEnvironment,
  resolveCanonicalHost,
  type CanonicalHostResolution,
} from "./canonical-hosts";
import { sessionSharedAcrossCanonicalDomain } from "./session-cookie";

/** The resolution of the current request's Host header. */
export async function canonicalHostForRequest(): Promise<CanonicalHostResolution> {
  const h = await headers();
  return resolveCanonicalHost(h.get("host"), canonicalHostOptionsFromEnvironment());
}

/**
 * True when `rawHost` is a canonical host that is NOT the OS `code`: another
 * Sector OS's host, or a canonical SHARED-surface host (`familyoffice`,
 * `noelia`) — a capability / AI-interface host carries no OS identity, so an OS
 * surface is never served on it either. A neutral host (www, apex, preview,
 * localhost, no Host) and the OS's own host both return false. Callers use this
 * to REFUSE — never to grant — so a hostname can never carry one OS's surface
 * onto another's.
 */
export function isForeignOSHost(
  rawHost: string | null | undefined,
  code: OperatingSystemDestination["code"],
): boolean {
  const resolution = resolveCanonicalHost(rawHost, canonicalHostOptionsFromEnvironment());
  if (resolution.kind === "SECTOR_OS") return resolution.os.code !== code;
  return resolution.kind === "SURFACE";
}

/** `isForeignOSHost` for the current request. */
export async function requestIsOnForeignOSHost(
  code: OperatingSystemDestination["code"],
): Promise<boolean> {
  const h = await headers();
  return isForeignOSHost(h.get("host"), code);
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
