/**
 * Server-side access to the CURRENT request's canonical Sector OS host.
 *
 * Thin wrappers over the pure contract in `sector-domains.ts` for server
 * components and route handlers. They read the `Host` header and nothing else,
 * and — like the contract — return PRESENTATION facts only: which home to
 * offer, which link to render, whether a surface is being asked for on another
 * sector's host. No authorization is derived from any of them; every caller
 * still runs its own session/tenant/permission/RLS gate.
 */
import { headers } from "next/headers";
import type { OperatingSystemDestination } from "./operating-system-catalog";
import {
  canonicalDestinationHref,
  resolveSectorHost,
  sectorDomainOptionsFromEnvironment,
  type SectorHostResolution,
} from "./sector-domains";
import { sessionSharedAcrossCanonicalDomain } from "./session-cookie";

/** The resolution of the current request's Host header. */
export async function sectorHostForRequest(): Promise<SectorHostResolution> {
  const h = await headers();
  return resolveSectorHost(h.get("host"), sectorDomainOptionsFromEnvironment());
}

/**
 * True when `rawHost` resolves to a canonical sector host of a DIFFERENT Sector
 * OS than `code`. A neutral host (www, apex, preview, localhost, no Host) and
 * the sector's own host both return false. Callers use this to REFUSE — never
 * to grant — so a hostname can never carry one Sector OS's surface onto
 * another's.
 */
export function isForeignSectorHost(
  rawHost: string | null | undefined,
  code: OperatingSystemDestination["code"],
): boolean {
  const resolution = resolveSectorHost(rawHost, sectorDomainOptionsFromEnvironment());
  return resolution.kind === "SECTOR" && resolution.os.code !== code;
}

/** `isForeignSectorHost` for the current request. */
export async function requestIsOnForeignSectorHost(code: OperatingSystemDestination["code"]): Promise<boolean> {
  const h = await headers();
  return isForeignSectorHost(h.get("host"), code);
}

/**
 * A function that maps a catalogue destination to the href the current request
 * should render (canonical subdomain URL when configured and safe, otherwise
 * the relative route). Computed once per request; presentation only.
 */
export async function destinationHrefForRequest(): Promise<(destination: OperatingSystemDestination) => string> {
  const options = sectorDomainOptionsFromEnvironment();
  const current = await sectorHostForRequest();
  const sharedSession = sessionSharedAcrossCanonicalDomain();
  return (destination) => canonicalDestinationHref(destination, { current, options, sharedSession });
}
