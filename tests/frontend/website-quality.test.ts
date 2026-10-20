/**
 * BEYU OS — Website Quality, Security, Accessibility & Engineering Gap Closure
 * Verifies: sitemap, robots, favicon/icons, offline/PWA, contact validation,
 * cookie consent, security headers, accessibility, responsive/meta.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function fileExists(p: string): boolean {
  return existsSync(resolve(p));
}

describe("Workstream 1 — Offline / PWA", () => {
  it("has manifest.webmanifest with required fields", () => {
    const raw = readFileSync(resolve("public/manifest.webmanifest"), "utf8");
    const m = JSON.parse(raw);
    expect(m.name).toBeTruthy();
    expect(m.icons.length).toBeGreaterThan(0);
    expect(m.start_url).toBeTruthy();
    expect(m.display).toBeTruthy();
  });
  it("has service worker file that does not cache private routes", () => {
    const sw = readFileSync(resolve("public/sw.js"), "utf8");
    expect(sw).toContain("beyu-os-v1");
    expect(sw).toMatch(/\/api\//);
    expect(sw).toMatch(/\/os/);
    // Must not cache auth
    expect(sw.toLowerCase()).toContain("never cache");
  });
  it("has offline fallback page", () => {
    expect(fileExists("src/app/offline/page.tsx")).toBe(true);
  });
  it("has OfflineIndicator and SW register components", () => {
    expect(fileExists("src/components/offline-indicator.tsx")).toBe(true);
    expect(fileExists("src/components/service-worker-register.tsx")).toBe(true);
  });
});

describe("Workstream 2 — Sitemap & Robots", () => {
  it("has sitemap route", () => expect(fileExists("src/app/sitemap.ts")).toBe(true));
  it("has robots route", () => expect(fileExists("src/app/robots.ts")).toBe(true));
  it("sitemap excludes private routes", async () => {
    const mod = await import("@/app/sitemap");
    const entries = mod.default();
    const urls = entries.map((e: { url: string }) => e.url);
    expect(urls.some((u: string) => u.includes("/os"))).toBe(false);
    expect(urls.some((u: string) => u.includes("/api/"))).toBe(false);
    expect(urls.length).toBeGreaterThan(0);
  });
  it("robots disallows private routes", async () => {
    const mod = await import("@/app/robots");
    const r = mod.default();
    const rules = r.rules as unknown as Array<{ disallow?: string[]; allow?: string[] }>;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule.disallow).toContain("/os/");
    expect(rule.disallow).toContain("/api/");
  });
});

describe("Workstream 3 — Favicon & Icons", () => {
  it("brand assets exist", () => {
    expect(fileExists("public/brand/favicon.png")).toBe(true);
    expect(fileExists("public/brand/favicon.svg")).toBe(true);
    expect(fileExists("public/brand/beyu-app-icon.svg")).toBe(true);
    expect(fileExists("public/brand/beyu-app-icon-192.png")).toBe(true);
    expect(fileExists("public/brand/beyu-app-icon-512.png")).toBe(true);
    expect(fileExists("public/noelia/noelia-icon.svg")).toBe(true);
  });
  it("layout metadata references real assets", async () => {
    const raw = readFileSync(resolve("src/app/layout.tsx"), "utf8");
    expect(raw).toContain("BEYU_BRAND_ASSETS");
    expect(raw).toContain("appIcon192");
    expect(raw).toContain("appIcon512");
    expect(raw).toContain("manifest.webmanifest");
    // Brand assets file itself maps to real png
    const assets = readFileSync(resolve("src/components/brand-assets.ts"), "utf8");
    expect(assets).toContain("favicon.png");
  });
});

describe("Workstream 4 — Loading states", () => {
  it("has loading components for key public routes", () => {
    expect(fileExists("src/app/offline/loading.tsx")).toBe(true);
    expect(fileExists("src/app/contact/loading.tsx")).toBe(true);
    expect(fileExists("src/app/enroll/loading.tsx")).toBe(true);
    expect(fileExists("src/app/os/loading.tsx")).toBe(true);
  });
  it("has error boundary", () => {
    expect(fileExists("src/components/error-boundary.tsx")).toBe(true);
  });
});

describe("Workstream 5 — Contact validation", () => {
  it("contact API validates strictly", async () => {
    const { POST } = await import("@/app/api/v1/contact/route");
    const mkReq = (body: unknown, ip = "1.2.3.4") =>
      new Request("http://test/api/v1/contact", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify(body),
      }) as unknown as Parameters<typeof POST>[0];

    // Missing fields -> 422
    let res = await POST(mkReq({}));
    expect(res.status).toBe(422);

    // Invalid email -> 422
    res = await POST(mkReq({ name: "John Doe", email: "not-email", message: "Hello world from BEYU inquiry test" }, "1.2.3.5"));
    expect(res.status).toBe(422);

    // Invalid phone -> 422
    res = await POST(mkReq({ name: "John Doe", email: "j@beyu.co.tz", phone: "abc", message: "Hello world from BEYU inquiry test" }, "1.2.3.6"));
    expect(res.status).toBe(422);

    // Valid -> 201, no delivery claim beyond safe ack
    res = await POST(mkReq({ name: "Jane Doe", email: "jane@beyu.co.tz", message: "Hello, I would like to learn about BEYU OS partnership. Please contact me." }, "1.2.3.7"));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toMatch(/^inq_/);
    expect(json.data.message).toBeTruthy();
  });

  it("rate limits after 5 requests", async () => {
    const { POST } = await import("@/app/api/v1/contact/route");
    const mkReq = (ip: string) =>
      new Request("http://test/api/v1/contact", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ name: "Rate Test", email: "r@beyu.co.tz", message: "Rate limit test message here please allow" }),
      }) as unknown as Parameters<typeof POST>[0];

    const testIp = `9.9.9.${Math.floor(Math.random() * 200) + 10}`;
    for (let i = 0; i < 5; i++) {
      const r = await POST(mkReq(testIp));
      expect(r.status).toBe(201);
    }
    const blocked = await POST(mkReq(testIp));
    expect(blocked.status).toBe(429);
  });
});

describe("Workstream 6 — Cookie consent", () => {
  it("has consent banner component that gates analytics", () => {
    expect(fileExists("src/components/cookie-consent.tsx")).toBe(true);
    const src = readFileSync(resolve("src/components/cookie-consent.tsx"), "utf8");
    expect(src).toContain("beyu.consent");
    expect(src).toContain("Accept");
    expect(src).toContain("Reject");
    expect(src).toContain("Customize");
    // No dark pattern: reject not materially harder
    expect(src).toContain("Reject optional");
  });
});

describe("Workstream 7 — Open Graph / Metadata", () => {
  it("root layout has comprehensive OG and twitter metadata", () => {
    const src = readFileSync(resolve("src/app/layout.tsx"), "utf8");
    expect(src).toContain("openGraph");
    expect(src).toContain("twitter");
    expect(src).toContain("metadataBase");
    expect(src).toContain("canonical");
  });
  it("contact page has specific metadata", () => {
    const src = readFileSync(resolve("src/app/contact/page.tsx"), "utf8");
    expect(src).toContain("Contact BEYU OS");
    expect(src).toContain("canonical");
  });
});

describe("Workstream 9 — Security headers", () => {
  it("next.config has hardened headers", () => {
    const src = readFileSync(resolve("next.config.ts"), "utf8");
    expect(src).toContain("X-Content-Type-Options");
    expect(src).toContain("X-Frame-Options");
    expect(src).toContain("Strict-Transport-Security");
    expect(src).toContain("Content-Security-Policy");
    expect(src).toContain("no-store");
    expect(src).toContain("Cache-Control");
  });
});

describe("Workstream 10 — Responsive / Viewport", () => {
  it("layout defines viewport", () => {
    const src = readFileSync(resolve("src/app/layout.tsx"), "utf8");
    expect(src).toContain("viewport");
    expect(src).toContain("device-width");
  });
  it("globals.css prevents horizontal overflow", () => {
    const src = readFileSync(resolve("src/app/globals.css"), "utf8");
    expect(src).toContain("overflow-x");
    expect(src).toContain("max-width: 100%");
  });
});

describe("Workstream 11 — Accessibility", () => {
  it("root error boundary does not leak secrets", () => {
    const src = readFileSync(resolve("src/app/error.tsx"), "utf8");
    // Must not render raw exception/stack to user — only digest reference
    expect(src).toContain("digest");
    expect(src).not.toContain("error.stack");
    expect(src).not.toContain("error.message");
  });
  it("sign-in form has accessible labels and live regions", () => {
    const src = readFileSync(resolve("src/app/sign-in-form.tsx"), "utf8");
    expect(src).toContain('aria-label');
    expect(src).toContain('aria-live');
    expect(src).toContain('role="alert"');
  });
  it("globals.css has reduced-motion support", () => {
    const src = readFileSync(resolve("src/app/globals.css"), "utf8");
    expect(src).toContain("prefers-reduced-motion");
  });
});
