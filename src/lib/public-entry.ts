/**
 * Public entry routing is presentation only. A destination code is an
 * allowlisted request, never an authorization grant or a URL supplied by the
 * browser. The actual destination remains subject to the live server gates.
 */
import { CANONICAL_NON_OS_DESTINATIONS, SECTOR_OPERATING_SYSTEMS, destinationSignInSubtitle } from "./operating-system-catalog";
import type { CanonicalDestination, CanonicalHostResolution } from "./canonical-hosts";

export function requestedEntryDestination(value: unknown): CanonicalDestination | null {
  if (typeof value !== "string") return null;
  const os = SECTOR_OPERATING_SYSTEMS.find((item) => item.code === value);
  if (os) return { hostKind: "SECTOR_OS", context: os, signInSubtitle: destinationSignInSubtitle(os) };
  const surface = CANONICAL_NON_OS_DESTINATIONS.find((item) => item.code === value);
  if (surface) return { hostKind: "SURFACE", context: surface, signInSubtitle: destinationSignInSubtitle(surface) };
  return null;
}

/** Only configured, exact canonical destination hosts may redirect cross-host. */
export function canonicalSignInForHost(host: CanonicalHostResolution, canonicalDomain: string | null): string {
  if ((host.kind === "SECTOR_OS" || host.kind === "SURFACE") && canonicalDomain && host.base === canonicalDomain) {
    const code = host.kind === "SECTOR_OS" ? host.os.code : host.surface.code;
    return `https://www.${canonicalDomain}/sign-in?destination=${encodeURIComponent(code)}`;
  }
  return "/sign-in";
}

/** A sanitized, same-origin continuation; never accepts paths or URLs. */
export function signInContinuation(destination: CanonicalDestination | null): string {
  return destination ? `/sign-in?destination=${encodeURIComponent(destination.context.code)}` : "/launcher";
}
