/**
 * DNS TXT domain verification — the ONE verification mechanism actually
 * implemented for tenant domains.
 *
 * HOW IT WORKS
 *   At registration the service generates a random challenge and stores only its
 *   SHA-256 hash. The operator publishes a TXT record:
 *
 *     _beyu-domain-verification.<hostname>   TXT   "beyu-domain-verification=<challenge>"
 *
 *   Verification performs a REAL DNS lookup and compares the observed value
 *   against the stored hash in constant time. There is no way to become VERIFIED
 *   without control of the name's DNS: it is never enough for a string to look
 *   plausible, and a request can never assert verification about itself.
 *
 * HONESTY
 *   This is runtime DNS ownership verification, not a promise about the
 *   deployment platform: it does not create DNS records, certificates or Vercel
 *   domain configuration, and it does not claim they exist. Those remain
 *   human-controlled platform steps
 *   (docs/architecture/TENANT_DOMAIN_ARCHITECTURE.md).
 *
 * FAIL CLOSED
 *   Every non-match — no record, no matching value, a resolver error, a timeout
 *   — is a refusal. The resolver is injectable so the positive path can be tested
 *   deterministically; the default resolver is the real network lookup.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Resolver } from "node:dns/promises";

/** The canonical challenge record name for a hostname. */
export function dnsChallengeRecordName(hostname: string): string {
  return `_beyu-domain-verification.${hostname}`;
}

/** The canonical challenge record value for a challenge. */
export function dnsChallengeRecordValue(challenge: string): string {
  return `beyu-domain-verification=${challenge}`;
}

/** TRUE when the observed TXT value carries the platform prefix at all. */
export function isChallengeValue(value: string, challenge: string): boolean {
  return constantTimeEquals(value.trim(), dnsChallengeRecordValue(challenge));
}

/** SHA-256 of a challenge record value — what the registry stores. */
export function challengeValueHash(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex");
}

/** Constant-time comparison of two strings (length-safe). */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

/** A TXT lookup function: returns every TXT value published for a record name. */
export type DnsTxtResolver = (recordName: string) => Promise<string[]>;

/**
 * The real resolver. Bounded timeout and retries so a slow or hostile DNS
 * cannot hold a request open; every failure propagates as a lookup error and is
 * treated as a refusal by the caller.
 */
export const defaultDnsTxtResolver: DnsTxtResolver = async (recordName: string) => {
  const resolver = new Resolver({ timeout: 3_000, tries: 2 });
  const records = await resolver.resolveTxt(recordName);
  // resolveTxt returns string[][] (chunks per record); a TXT record's chunks are
  // concatenated into one value.
  return records.map((chunks) => chunks.join(""));
};

export type DnsVerificationOutcome =
  | { verified: true; reason: "MATCH"; observedRecords: number }
  | { verified: false; reason: "NO_RECORDS" | "NO_MATCH" | "LOOKUP_FAILED"; observedRecords: number };

/**
 * Verify a challenge against live DNS.
 *
 * `expectedHash` is the stored SHA-256 of the challenge VALUE. The comparison is
 * over digests, so a mismatch leaks nothing about the expected value, and the
 * resolved records themselves are never returned to the caller or logged.
 */
export async function verifyDnsTxtChallenge(
  hostname: string,
  expectedHash: string,
  resolve: DnsTxtResolver = defaultDnsTxtResolver,
): Promise<DnsVerificationOutcome> {
  const recordName = dnsChallengeRecordName(hostname);
  let records: string[];
  try {
    records = await resolve(recordName);
  } catch {
    // NXDOMAIN, SERVFAIL, timeout, no network — all refusals, never a pass.
    return { verified: false, reason: "LOOKUP_FAILED", observedRecords: 0 };
  }
  if (!Array.isArray(records) || records.length === 0) {
    return { verified: false, reason: "NO_RECORDS", observedRecords: 0 };
  }
  for (const value of records) {
    if (typeof value !== "string") continue;
    if (constantTimeEquals(challengeValueHash(value), expectedHash)) {
      return { verified: true, reason: "MATCH", observedRecords: records.length };
    }
  }
  return { verified: false, reason: "NO_MATCH", observedRecords: records.length };
}

/** 32 bytes of CSPRNG entropy, hex-encoded — a DNS-safe challenge value. */
export function generateChallenge(): string {
  return randomBytes(32).toString("hex");
}
