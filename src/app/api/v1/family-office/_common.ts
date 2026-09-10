/**
 * Shared helpers for the `/api/v1/family-office/*` routes.
 *
 * The routes themselves stay thin: authentication, authorization, rate limiting,
 * idempotency, the error envelope and the audit append are all the existing
 * `guarded()` / `withIdempotency()` machinery in `src/lib/api.ts`. Nothing here
 * reimplements any of it.
 */
export const FAMILY_OFFICE_API_VERSION = "family-office-api-1.0.0";

/**
 * Today's date as ISO YYYY-MM-DD in UTC.
 *
 * Every Family Office measure needs an explicit `asOf`; defaulting it server-side
 * to a single deterministic value keeps a dashboard and its detail views on the
 * same date instead of drifting across a midnight boundary mid-render.
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
