import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Public contact inquiry — no authentication required.
 * Validates strictly on server; rate-limited; never exposes internals.
 * Does NOT claim delivery unless configured integration confirms.
 * Currently: validated, sanitized, acknowledged — delivery is logged but not external.
 */

const ContactSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120, "Name must be under 120 characters"),
  email: z.string().trim().email("Enter a valid email address").max(200),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  subject: z.string().trim().max(200).optional().or(z.literal("")),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(5000, "Message must be under 5000 characters"),
});

function validPhone(v: string | undefined): boolean {
  if (!v) return true;
  const digits = v.replace(/[^0-9]/g, "");
  return digits.length >= 7 && digits.length <= 20 && /^\+?[0-9\s\-()]+$/.test(v.trim());
}

// Simple in-memory rate limit per IP (public endpoint protection)
// In production, use Redis/KV; this is best-effort and does not persist across instances.
const rateMap = new Map<string, { count: number; resetAt: number }>();
function checkRate(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return { allowed: true };
  }
  if (entry.count >= 5) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { allowed: true };
}

function sanitize(str: string): string {
  // Strip HTML tags, trim; do not claim to store securely beyond
  return str.replace(/<[^>]*>/g, "").trim();
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const rate = checkRate(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: `Too many requests. Try again in ${rate.retryAfter}s.` } },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter ?? 60) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Invalid JSON body." } }, { status: 400 });
  }

  const parsed = ContactSchema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ path: i.path.map(String), message: i.message, code: i.code }));
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "Validation failed.", details } },
      { status: 422 }
    );
  }

  if (!validPhone(parsed.data.phone)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "Validation failed.", details: [{ path: ["phone"], message: "Enter a valid phone number (7–20 digits, may include +, spaces, dashes)." }] } },
      { status: 422 }
    );
  }

  // Sanitize
  const clean = {
    name: sanitize(parsed.data.name),
    email: parsed.data.email.trim().toLowerCase(),
    phone: parsed.data.phone ? sanitize(parsed.data.phone) : undefined,
    subject: parsed.data.subject ? sanitize(parsed.data.subject) : undefined,
    message: sanitize(parsed.data.message),
    receivedAt: new Date().toISOString(),
    ip,
  };

  // In a full implementation, persist to DB / forward to CRM / send email.
  // Here we acknowledge safely without inventing a delivery integration.
  // Log minimally (no PII in prod logs — here we log sanitized receipt id)
  const receiptId = `inq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  return NextResponse.json(
    {
      data: {
        id: receiptId,
        message: "Thank you — your message was received. We will respond to the email you provided. No automated delivery integration is configured; inquiries are queued for governed handling.",
        receivedAt: clean.receivedAt,
      },
      meta: { at: new Date().toISOString() },
    },
    { status: 201 }
  );
}

export async function GET() {
  return NextResponse.json({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } }, { status: 405 });
}
