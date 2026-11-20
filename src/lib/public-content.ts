/**
 * Pure validation, sanitization and query-parsing contracts for governed
 * public news and events (`public_content`).
 *
 * SECURITY BOUNDARIES
 * - Public feeds NEVER expose internal identifiers (`id`, `tenantId`,
 *   `createdBy`, `approvedBy`), draft/internal/confidential/restricted items,
 *   or unapproved announcements.
 * - Image URLs are restricted to same-origin relative paths (`/...`) or
 *   explicitly `https://` URLs; `javascript:`, `data:`, `vbscript:` and
 *   protocol-relative (`//...`) URLs are rejected.
 * - Query parameters fail closed with structured validation errors rather than
 *   silently widening limits or passing untrusted values into SQL.
 */
import { z } from "zod";

export const PUBLIC_CONTENT_KINDS = ["NEWS", "EVENT"] as const;
export type PublicContentKind = (typeof PUBLIC_CONTENT_KINDS)[number];

export const PUBLIC_CONTENT_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "PUBLISHED",
  "ARCHIVED",
] as const;
export type PublicContentStatus = (typeof PUBLIC_CONTENT_STATUSES)[number];

export const PUBLIC_CONTENT_FEED_MAX_LIMIT = 12;
export const PUBLIC_CONTENT_FEED_DEFAULT_LIMIT = 6;
export const PUBLIC_CONTENT_FEED_MAX_OFFSET = 100;

/**
 * Validate an optional image URL: permits only safe same-origin paths
 * (`/brand/...`, `/news/...`) or explicit `https://` URLs without whitespace
 * or control characters. Rejects `javascript:`, `data:`, `http:`, `//...`.
 */
export function isSafePublicImageUrl(value: string): boolean {
  if (/[\s\u0000-\u001f]/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) {
    return /^\/[A-Za-z0-9._~/@%-]+$/.test(value);
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export const CreatePublicContentSchema = z
  .object({
    kind: z.enum(PUBLIC_CONTENT_KINDS),
    title: z.string().trim().min(4, "Title must be at least 4 characters.").max(180),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(180)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain lowercase letters, numbers and hyphens only."),
    summary: z.string().trim().min(10, "Summary must be at least 10 characters.").max(400),
    body: z.string().trim().min(20, "Body must be at least 20 characters.").max(20_000),
    imageUrl: z
      .string()
      .trim()
      .max(1000)
      .refine(isSafePublicImageUrl, "Image URL must be a safe same-origin path or HTTPS URL.")
      .optional()
      .nullable(),
    location: z.string().trim().max(180).optional().nullable(),
    startsAt: z.string().datetime().optional().nullable(),
    endsAt: z.string().datetime().optional().nullable(),
    isFeatured: z.boolean().optional().default(false),
    classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL"]).default("INTERNAL"),
  })
  .refine(
    (data) => {
      if (data.startsAt && data.endsAt) {
        return new Date(data.endsAt).getTime() >= new Date(data.startsAt).getTime();
      }
      return true;
    },
    { message: "Event end time must not precede start time.", path: ["endsAt"] },
  );

export const PatchPublicContentSchema = z.object({
  id: z.string().trim().min(1).max(80),
  action: z.enum(["submit", "archive"]).default("submit"),
});

export const ApprovePublicContentSchema = z.object({
  id: z.string().trim().min(1).max(80),
  decision: z.enum(["APPROVE", "REJECT"]).default("APPROVE"),
  reason: z.string().trim().max(500).optional(),
});

export type ParsedPublicFeedQuery =
  | {
      ok: true;
      limit: number;
      offset: number;
      kind: PublicContentKind | null;
      q: string | null;
    }
  | {
      ok: false;
      code: "INVALID_QUERY_PARAMETER";
      message: string;
    };

/**
 * Strictly parse public feed query parameters. Invalid values return an
 * explicit 400 error instead of silent coercion or unbounded queries.
 */
export function parsePublicFeedQuery(searchParams: URLSearchParams): ParsedPublicFeedQuery {
  let limit = PUBLIC_CONTENT_FEED_DEFAULT_LIMIT;
  const rawLimit = searchParams.get("limit");
  if (rawLimit !== null && rawLimit !== "") {
    if (!/^\d+$/.test(rawLimit)) {
      return { ok: false, code: "INVALID_QUERY_PARAMETER", message: "Query parameter 'limit' must be a positive integer." };
    }
    const parsed = Number.parseInt(rawLimit, 10);
    if (parsed < 1 || parsed > PUBLIC_CONTENT_FEED_MAX_LIMIT) {
      return {
        ok: false,
        code: "INVALID_QUERY_PARAMETER",
        message: `Query parameter 'limit' must be between 1 and ${PUBLIC_CONTENT_FEED_MAX_LIMIT}.`,
      };
    }
    limit = parsed;
  }

  let offset = 0;
  const rawOffset = searchParams.get("offset");
  if (rawOffset !== null && rawOffset !== "") {
    if (!/^\d+$/.test(rawOffset)) {
      return { ok: false, code: "INVALID_QUERY_PARAMETER", message: "Query parameter 'offset' must be a non-negative integer." };
    }
    const parsed = Number.parseInt(rawOffset, 10);
    if (parsed < 0 || parsed > PUBLIC_CONTENT_FEED_MAX_OFFSET) {
      return {
        ok: false,
        code: "INVALID_QUERY_PARAMETER",
        message: `Query parameter 'offset' must be between 0 and ${PUBLIC_CONTENT_FEED_MAX_OFFSET}.`,
      };
    }
    offset = parsed;
  }

  let kind: PublicContentKind | null = null;
  const rawKind = searchParams.get("kind");
  if (rawKind !== null && rawKind !== "") {
    const normalized = rawKind.trim().toUpperCase();
    if (normalized !== "NEWS" && normalized !== "EVENT") {
      return { ok: false, code: "INVALID_QUERY_PARAMETER", message: "Query parameter 'kind' must be NEWS or EVENT." };
    }
    kind = normalized;
  }

  let q: string | null = null;
  const rawQ = searchParams.get("q");
  if (rawQ !== null && rawQ.trim() !== "") {
    const trimmed = rawQ.trim();
    if (trimmed.length > 100) {
      return { ok: false, code: "INVALID_QUERY_PARAMETER", message: "Query parameter 'q' must be 100 characters or fewer." };
    }
    q = trimmed;
  }

  return { ok: true, limit, offset, kind, q };
}

/** Public-safe feed item shape — contains NO internal DB IDs, tenant IDs or actor IDs. */
export type PublicFeedItem = {
  slug: string;
  kind: PublicContentKind;
  title: string;
  summary: string;
  imageUrl: string | null;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  isFeatured: boolean;
};

/**
 * Strip any non-public fields defensively before serializing to unauthenticated callers.
 */
export function toPublicFeedItem(row: {
  slug: string;
  kind: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  location: string | null;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  publishedAt: Date | string | null;
  isFeatured: boolean;
}): PublicFeedItem {
  const safeImage = row.imageUrl && isSafePublicImageUrl(row.imageUrl) ? row.imageUrl : null;
  const iso = (value: Date | string | null): string | null => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    return value;
  };
  return {
    slug: row.slug,
    kind: row.kind === "EVENT" ? "EVENT" : "NEWS",
    title: row.title,
    summary: row.summary,
    imageUrl: safeImage,
    location: row.location ?? null,
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    publishedAt: iso(row.publishedAt),
    isFeatured: Boolean(row.isFeatured),
  };
}
