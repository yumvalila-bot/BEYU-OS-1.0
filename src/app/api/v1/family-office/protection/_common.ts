import { apiError } from "@/lib/api";
import {
  FAMILY_OFFICE_PROTECTION_ERROR_STATUS,
  FamilyOfficeProtectionError,
} from "@/lib/family-office-protection-service";

/**
 * Shared error mapping for the protection routes so every endpoint answers
 * engine refusals the same way (404 for out-of-scope reads, 422 for engine
 * findings, 403 for scope, 409 for lifecycle refusals). Lives OUTSIDE any
 * route.ts because Next validates route module exports; `_common.ts` is not
 * a route.
 */
export function protectionError(err: unknown, traceId: string): never | ReturnType<typeof apiError> {
  if (err instanceof FamilyOfficeProtectionError) {
    return apiError(err.code, err.message, FAMILY_OFFICE_PROTECTION_ERROR_STATUS[err.code], traceId, { findings: err.findings });
  }
  throw err;
}
