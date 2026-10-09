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
