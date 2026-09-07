import { NextResponse } from "next/server";
import { apiOk } from "@/lib/api";
import { newId, ID_PREFIX } from "@/lib/ids";
import { getBootstrapStatus } from "@/lib/bootstrap/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/auth/bootstrap/status
 *
 * Unauthenticated readiness probe for the enrollment page. Returns ONLY the
 * coarse lifecycle (NOT_PREPARED | AVAILABLE | IN_PROGRESS | SEALED), whether an
 * owner-controlled bootstrap secret is configured, and whether a fresh
 * enrollment can start. It never reveals the administrator email, any credential
 * state, or whether a specific token is valid — so it is not an enumeration aid.
 */
export async function GET(): Promise<NextResponse> {
  const traceId = newId(ID_PREFIX.event);
  try {
    const status = await getBootstrapStatus();
    return apiOk(status, traceId);
  } catch {
    // Fail closed: if the control plane cannot determine state, report the
    // safest non-enrollable answer rather than leaking an internal error.
    return apiOk({ state: "NOT_PREPARED", secretConfigured: false, enrollable: false }, traceId);
  }
}
