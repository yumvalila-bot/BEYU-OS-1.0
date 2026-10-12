/**
 * THE BEYU LOGIN SURFACE — the authoritative reference, pinned.
 *
 * `BEYU LOGIN PAGE .png` (repository root) is the visual authority for the
 * canonical sign-in. This suite is the executable half of that contract:
 *
 *   A. It is a REAL interface — a form, labelled inputs, real buttons — and
 *      never the reference image rendered as the page with a decorative overlay.
 *   B. The reference's composition and copy are present: emblem, wordmark,
 *      descriptor, headline, motto banner, mission statement, the five pillars,
 *      the card (Welcome / Username / Password / Forgot Password? / Cancel /
 *      Enter), the campus band and the six-capability strip.
 *   C. The canonical palette is used, and the ONE deliberate deviation (an
 *      accessible gold for small text on light surfaces) is the only one.
 *   D. Security is not traded for visual fidelity: the password is never
 *      persisted client-side, "Cancel" and "Forgot Password?" do something real,
 *      success is only ever the server's own answer, and the step-up field is
 *      never removed from the credential path.
 *   E. Nothing external is pulled in (no CDN font, no remote image) and the
 *      reference PNG itself is not shipped to the browser.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { apiGet, apiPost, serverAvailable } from "../helpers/http";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), "utf8");
/** Source with comments removed — these assertions are about code, not prose. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Collapse React's SSR text-node separators and decode the few entities the
 *  reference copy needs, so an assertion tests the rendered words. */
const text = (html: string) =>
  html
    .replace(/<!--[^>]{0,8}-->/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&ldquo;/g, "\u201c")
    .replace(/&rdquo;/g, "\u201d");

const SURFACE = code(source("src", "app", "login-surface.tsx"));
const FORM = code(source("src", "app", "sign-in-form.tsx"));
const PAGE = code(source("src", "app", "page.tsx"));
const GOVERNED = code(source("src", "app", "governed-sign-in.tsx"));
const RECOVERY_PAGE = code(source("src", "app", "forgot-password", "page.tsx"));
const RECOVERY_ROUTE = code(source("src", "app", "api", "v1", "auth", "recovery", "request", "route.ts"));
const GLOBALS = source("src", "app", "globals.css");
const available = Boolean(process.env.BEYU_TEST_BASE_URL);

/* -------------------------------------------------------------------------- */

describe("A. the login page is a real interface, not the reference image", () => {
  it("builds the page from semantic elements, and the form is a real form", () => {
    expect(SURFACE).toContain("<main");
    expect(SURFACE).toContain("<header");
    expect(SURFACE).toContain("<section");
    expect(FORM).toContain("<form onSubmit={submit}");
    expect(FORM).toContain('type="submit"');
    for (const id of ["beyu-signin-email", "beyu-signin-password", "beyu-signin-mfa"]) {
      expect(FORM, id).toContain(`id="${id}"`);
    }
    // Native validation semantics preserved on the credential fields.
    expect(FORM).toContain('type="email"');
    expect(FORM).toContain('autoComplete="username"');
    expect(FORM).toContain('autoComplete="current-password"');
  });

  it("never renders the reference artwork as the page or via injected markup", () => {
    for (const [name, file] of [
      ["login-surface", SURFACE],
      ["sign-in-form", FORM],
      ["page", PAGE],
      ["governed-sign-in", GOVERNED],
    ] as const) {
      expect(file, name).not.toContain("dangerouslySetInnerHTML");
      expect(file, name).not.toMatch(/BEYU LOGIN PAGE/i);
      expect(file, name).not.toMatch(/background(-image)?:\s*url\(/i);
    }
    // The reference is a repository-root artefact, not a served asset.
    expect(existsSync(path.join(ROOT, "public", "BEYU LOGIN PAGE .png"))).toBe(false);
  });

  it("pulls in nothing external — every asset is same-origin", () => {
    for (const [name, file] of [
      ["login-surface", SURFACE],
      ["sign-in-form", FORM],
      ["forgot-password", RECOVERY_PAGE],
    ] as const) {
      expect(file, name).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    }
  });
});

describe("B. the reference composition and copy are reproduced", () => {
  it("carries the brand statement block", () => {
    expect(SURFACE).toContain("HEALTHCARE");
    expect(SURFACE).toContain("GOVERNANCE");
    expect(SURFACE).toContain("TRUST");
    expect(SURFACE).toContain("INNOVATION");
    expect(SURFACE).toContain("Bridging Care. Building Trust.");
    expect(SURFACE).toContain("Transforming Healthcare for");
    expect(SURFACE).toContain("Generations.");
    expect(SURFACE).toContain("A legacy of trust. A future of better health.");
    expect(SURFACE).toContain("Building a great Africa through");
    expect(SURFACE).toContain("technology, compassion and excellence");
    // The motto itself, canonical since before this change.
    expect(SURFACE).toMatch(/Bridging Care\. Building Trust\./);
  });

  it("renders the five canonical pillars with the reference's own descriptions", () => {
    for (const [title, copy] of [
      ["Trust", "The foundation of everything we do."],
      ["Care", "Compassion across communities."],
      ["Integrity", "Honesty and transparency in all actions."],
      ["Innovation", "Technology for a healthier tomorrow."],
      ["Impact", "Shaping a healthier environment."],
    ] as const) {
      expect(SURFACE, title).toContain(`"${title}"`);
      expect(SURFACE, copy).toContain(copy);
    }
    expect(SURFACE).toContain("OUR PILLARS");
  });

  it("renders the reference's card, actions and capability strip", () => {
    expect(SURFACE).toContain("Welcome");
    expect(SURFACE).toContain("Log in to access your account");
    expect(FORM).toContain("Enter your username");
    expect(FORM).toContain("Enter your password");
    expect(FORM).toContain("Forgot Password?");
    expect(FORM).toContain("Cancel");
    for (const line of ["Secure", "& Trusted", "Patient", "Centered", "AI Powered", "Insights", "Cloud", "Native", "Connected", "Ecosystem", "Better", "Outcomes"]) {
      expect(SURFACE, line).toContain(`"${line}"`);
    }
    // The campus band and the navy footer wordmark.
    expect(SURFACE).toContain("CARE | TRUST | INNOVATION");
    expect(SURFACE).toContain("BEYU");
  });

  it("presents the authoritative emblem, never a redrawn symbol", () => {
    expect(SURFACE).toContain("BeyuOsLogo");
    expect(SURFACE).toContain("BEYU — official emblem");
    expect(SURFACE).not.toMatch(/family-trust-logo|BEYU_FAMILY_TRUST_ASSETS/);
    // Every hand-drawn mark here is decorative: no accessible name leaks in.
    expect(SURFACE).toContain('aria-hidden="true"');
  });
});

describe("C. canonical palette, with the one documented contrast correction", () => {
  it("uses institutional navy and gold", () => {
    expect(SURFACE).toContain("#0B1F4D");
    expect(SURFACE).toContain("#d4a017");
    expect(GLOBALS).toContain("--beyu-institutional-navy: #0B1F4D");
    expect(GLOBALS).toContain("--beyu-institutional-gold: #D4A017");
  });

  it("uses the accessible gold ONLY for small text on light surfaces, and says why", () => {
    expect(GLOBALS).toContain("--beyu-gold-ink: #8a6a12");
    expect(GLOBALS).toContain("4.60:1");
    // The login surfaces consume it for text; the brand gold stays the graphic accent.
    expect(SURFACE).toContain("beyu-gold-ink");
    expect(SURFACE).toContain("text-[#d4a017]");
  });
});

describe("D. security is not traded for visual fidelity", () => {
  it("never persists the password anywhere client-side", () => {
    expect(FORM).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
    expect(FORM).not.toMatch(/console\.(log|info|warn|debug|error)/);
    expect(FORM).not.toMatch(/password\s*[:=]\s*[`"'][^`"']*[`"']\s*;?\s*$/m);
    // The password only ever exists as state, and only ever leaves in the body.
    expect(FORM).toContain("JSON.stringify({ email, password, mfaCode })");
  });

  it("keeps the second factor in the credential path", () => {
    // Hidden is not removed: the field, its label, its autocomplete and its
    // help association stay in the server-rendered document.
    expect(FORM).toContain("hidden={!mfaVisible}");
    expect(FORM).toContain('autoComplete="one-time-code"');
    expect(FORM).toContain('aria-describedby="beyu-signin-mfa-help beyu-signin-error"');
    expect(FORM).toContain('name="mfaCode"');
    // …and the server's own refusal reveals it rather than the page guessing.
    expect(FORM).toContain('code === "MFA_REQUIRED"');
  });

  it("Cancel is a real action and navigates nowhere", () => {
    expect(FORM).toContain("function cancel()");
    expect(FORM).toContain("onClick={cancel}");
    const cancelBody = FORM.slice(FORM.indexOf("function cancel()"), FORM.indexOf("const field ="));
    expect(cancelBody).not.toMatch(/router\.push|window\.location|fetch\(/);
    expect(cancelBody).toContain("setPassword(\"\")");
    expect(cancelBody).toContain("setError(null)");
  });

  it("only reports success after the server said so", () => {
    const submit = FORM.slice(FORM.indexOf("async function submit"), FORM.indexOf("function cancel()"));
    const guard = submit.indexOf("if (!res.ok)");
    const push = submit.indexOf("router.push(");
    expect(guard).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(guard);
    // The landing is re-validated as a same-origin path, never taken from input.
    expect(submit).toContain('/^\\/(?!\\/)/.test(landing) ? landing : "/os"');
    expect(submit).not.toMatch(/URLSearchParams|searchParams|window\.location/);
    // Duplicate submissions are prevented, not merely discouraged.
    expect(submit).toContain("if (busy) return;");
  });

  it("Forgot Password? reaches a real governed recovery surface", () => {
    expect(FORM).toContain('href="/forgot-password"');
    expect(existsSync(path.join(ROOT, "src", "app", "forgot-password", "page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src", "app", "api", "v1", "auth", "recovery", "request", "route.ts"))).toBe(true);
    // The recovery path is a REQUEST recorder: it changes no credential, opens
    // no session and sets no cookie.
    expect(RECOVERY_ROUTE).not.toMatch(/passwordHash|hashPassword|verifyPassword|createSession|newSessionValues/);
    expect(RECOVERY_ROUTE).not.toMatch(/jar\.set|SESSION_COOKIE|cookies\(\)/);
    // It reuses the existing ledger/event infrastructure rather than adding any.
    expect(RECOVERY_ROUTE).toContain("recordAudit");
    expect(RECOVERY_ROUTE).toContain("publishEvent");
    expect(RECOVERY_ROUTE).toContain("withDatabaseRlsContext");
    // Uniform answer: one message, no account oracle.
    expect(RECOVERY_ROUTE).toContain("ACCEPTED_MESSAGE");
    expect(RECOVERY_ROUTE).not.toMatch(/notFound\(\)|404/);
  });

  it("keeps the ONE shared form: no second sign-in implementation appeared", () => {
    // The presentation layer never authenticates, and the surfaces never
    // re-implement the form.
    expect(SURFACE).not.toMatch(/fetch\(|\/api\/v1\/auth\/login/);
    expect(PAGE).toContain("<SignInForm");
    expect(GOVERNED).toContain("<SignInForm");
    expect(GOVERNED).not.toMatch(/fetch\(|\/api\/v1\/auth\/login/);
    // A hostname may only be read through the ONE server helper, whose
    // consumers are enumerated by canonical-host-security.test.ts — the login
    // surface must not become a tenth one.
    expect(SURFACE).not.toMatch(/canonical-host|canonicalHostForRequest|\bhost\b\s*[:=]\s*h\.get/);
  });
});

describe("E. the rendered surface (live server)", () => {
  it.skipIf(!available)("serves the reference login page unauthenticated", async () => {
    const res = await apiGet("/", null);
    expect(res.status).toBe(200);
    const body = text(res.html);
    for (const marker of [
      "Welcome",
      "Log in to access your account",
      "OUR PILLARS",
      "Trust",
      "The foundation of everything we do.",
      "Care",
      "Compassion across communities.",
      "Integrity",
      "Honesty and transparency in all actions.",
      "Innovation",
      "Technology for a healthier tomorrow.",
      "Impact",
      "Shaping a healthier environment.",
      "Bridging Care. Building Trust.",
      "Transforming Healthcare for",
      "A legacy of trust. A future of better health.",
      "Building a great Africa through",
      "technology, compassion and excellence",
      "HEALTHCARE",
      "GOVERNANCE",
      "INNOVATION",
      "CARE | TRUST | INNOVATION",
      "Secure",
      "& Trusted",
      "Patient",
      "Centered",
      "AI Powered",
      "Insights",
      "Cloud",
      "Native",
      "Connected",
      "Ecosystem",
      "Better",
      "Outcomes",
      "Enter",
      "Cancel",
      "Forgot Password?",
      "Enter your username",
      "Enter your password",
    ]) {
      expect(body, marker).toContain(marker);
    }
    // The authoritative asset — never a substitute, never the reference PNG.
    expect(res.html).toContain("/brand/beyu-os-logo.png");
    expect(res.html).not.toContain("BEYU LOGIN PAGE");
    // Real controls, present in the server-rendered HTML.
    expect(res.html).toContain("<form");
    expect(res.html).toContain('type="password"');
    expect(res.html).toContain('id="beyu-signin-mfa"');
    expect(res.html).toContain('for="beyu-signin-mfa"');
    expect(res.html).toContain("viewport");
  });

  it.skipIf(!available)("serves the governed recovery page and refuses nothing silently", async () => {
    const page = await apiGet("/forgot-password", null);
    expect(page.status).toBe(200);
    expect(text(page.html)).toContain("Recovery is a governed administrative action");
    expect(page.html).toContain('id="beyu-recovery-identifier"');
    // Real endpoint (not a decorative link target).
    expect(page.html).toContain("Request recovery");
  });

  it.skipIf(!available)("records a recovery request without revealing whether the identity exists", async () => {
    const unknown = await apiPost(
      "/api/v1/auth/recovery/request",
      { identifier: "no-such-identity@beyu.os" },
      {},
    );
    expect([202, 422, 429]).toContain(unknown.status);
    if (unknown.status === 202) {
      const body = unknown.body as { data?: { accepted?: boolean; message?: string } };
      expect(body.data?.accepted).toBe(true);
      expect(body.data?.message ?? "").toContain("If that identity exists");
    }
    // No session is minted by a recovery request, and no credential is returned.
    expect(unknown.headers.getSetCookie()).toEqual([]);
    expect(JSON.stringify(unknown.body)).not.toMatch(/password|secret|token/i);
  });
});
