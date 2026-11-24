import { createHash } from "node:crypto";

/**
 * Offline building block for the proposed Health BFF pilot. This is NOT an
 * authorization check, a proxy, or a JWS verifier, and is not wired to a route.
 *
 * `rawTarget` MUST be the original HTTP request-target, before URL parsing or
 * normalization. Next.js Request.url and WHATWG URL may already normalize paths;
 * passing either is unsafe. The eventual transport must prove access to the raw
 * target at a trusted boundary or refuse the request. No query, encoded path,
 * body or alternative method is accepted for this read-only pilot.
 */
export type PilotRequestBinding = {
  method: "GET";
  target: string;
  body_sha256: string;
};

/**
 * Match one pre-approved literal route exactly. `approvedPath` is trusted
 * server configuration, never derived from a request. Null means deny.
 * Assertion signature, replay prevention, mTLS, identity and authorization are
 * separate mandatory checks and are deliberately not implemented here.
 */
export function bindHealthPilotRequest(
  approvedPath: string,
  rawTarget: string,
  method: string,
  body: Uint8Array,
): PilotRequestBinding | null {
  // Restrict the contract to static, unambiguous ASCII path segments. A path
  // with a query, percent escape, slash duplication, dot segment or trailing
  // slash cannot be approved through this helper.
  if (!/^\/(?:[A-Za-z0-9_-]+)(?:\/[A-Za-z0-9_-]+)*$/.test(approvedPath)) return null;
  if (method !== "GET" || rawTarget !== approvedPath || body.byteLength !== 0) return null;
  return {
    method: "GET",
    target: approvedPath,
    body_sha256: createHash("sha256").update(body).digest("base64url"),
  };
}
