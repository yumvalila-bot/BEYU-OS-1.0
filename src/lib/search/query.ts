/**
 * BEYU OS — Shared Search capability: governed query input.
 *
 * One canonical parse for the search endpoint. Every bound is a safety property:
 *
 *   q      — required, trimmed, 2..200 characters. The text is passed to
 *            `websearch_to_tsquery` as a single parameter, so it is never
 *            parsed as SQL or as tsquery operators; pathological input
 *            (wildcards, quotes, FTS operators) degrades to a normal
 *            web-search query, never an error or an injection.
 *   os     — optional narrowing to one canonical OS code. It only restricts
 *            which already-authorized sources are searched; it is never an
 *            authorization input (the principal's grants decide that).
 *   type   — optional narrowing to one result type. Same property.
 *   limit  — 1..50 (bounded result sets).
 *   offset — 0..500 (bounded pagination window).
 *
 * There is deliberately NO tenant, entity, country or clearance parameter:
 * those are resolved exclusively from the authenticated principal, so a
 * request can never widen its own scope by supplying them.
 */
import { z } from "zod";
import { SEARCH_OS_CODES } from "./resources";

export const MAX_QUERY_LENGTH = 200;
export const MIN_QUERY_LENGTH = 2;
export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 20;
export const MAX_OFFSET = 500;

/** Per-source match cap: keeps every search query bounded regardless of corpus size. */
export const MAX_PER_SOURCE = 25;

const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(MIN_QUERY_LENGTH, "Search query must be at least 2 characters.")
    .max(MAX_QUERY_LENGTH, `Search query must be at most ${MAX_QUERY_LENGTH} characters.`),
  os: z.enum(SEARCH_OS_CODES).optional(),
  type: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,39}$/, "Result type must be an uppercase token (e.g. TENANT).")
    .optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).max(MAX_OFFSET).default(0),
});

export type ParsedSearchQuery = {
  query: string;
  os?: (typeof SEARCH_OS_CODES)[number];
  type?: string;
  limit: number;
  offset: number;
};

export type ParsedSearchQueryResult =
  | { ok: true; value: ParsedSearchQuery }
  | { ok: false; message: string; details: Array<{ code: string; path: Array<string | number>; message: string }> };

/** Parse and bound the search request parameters. Never throws. */
export function parseSearchQuery(searchParams: URLSearchParams): ParsedSearchQueryResult {
  const raw: Record<string, unknown> = {};
  for (const key of ["q", "os", "type", "limit", "offset"]) {
    const value = searchParams.get(key);
    if (value !== null) raw[key] = value;
  }
  const result = searchQuerySchema.safeParse(raw);
  if (result.success) {
    const data = result.data;
    return { ok: true, value: { query: data.q, os: data.os, type: data.type, limit: data.limit, offset: data.offset } };
  }
  return {
    ok: false,
    message: "Search query failed validation.",
    details: result.error.issues.map((issue) => ({
      code: issue.code,
      path: issue.path.filter((p): p is string | number => typeof p === "string" || typeof p === "number"),
      message: issue.message,
    })),
  };
}
