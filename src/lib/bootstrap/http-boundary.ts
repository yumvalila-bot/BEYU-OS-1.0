import { apiError } from "@/lib/api";
import type { NextResponse } from "next/server";

/** Treat security-dependency failures as unavailable, never as permission or success. */
export async function attemptBootstrapOperation<T>(
  traceId: string,
  operation: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, value: await operation() };
  } catch {
    // The exception may contain SQL, credentials, connection strings or inputs.
    console.error(JSON.stringify({ event: "bootstrap_dependency_unavailable", traceId }));
    const response = apiError("BOOTSTRAP_UNAVAILABLE", "Administrator enrollment is temporarily unavailable.", 503, traceId);
    response.headers.set("Retry-After", "30");
    return { ok: false, response };
  }
}

/** Enrollment responses may contain a one-time TOTP secret and recovery codes. */
export function noStoreBootstrapResponse<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", "no-store");
  return response;
}
