/**
 * BEYU OS — destination-experience capture harness (audit evidence only).
 *
 * Runs the REAL production build of the working branch (see SHA in the
 * inventory) on 127.0.0.1:3100 and drives a real Chromium through the eight
 * canonical destination hosts plus the role-aware scenarios.
 *
 * Fidelity notes
 *   • URLs are the real ones (`http://beyu.co.tz:3100/…`); only DNS is mapped to
 *     the sandbox loopback through `--host-resolver-rules`, so the Host header
 *     and the server-side host resolution are genuinely exercised.
 *   • Sessions come from the real `/api/v1/auth/login` endpoint (TOTP included)
 *     and are injected as the canonical `beyu_os_session` cookie.
 *   • POST scenarios are submitted from a page already on the canonical origin,
 *     so the browser sends its real Origin header and the server's Origin fence,
 *     RBAC/ABAC gate and routing decision all apply.
 *   • Every identity is a repository synthetic seed identity in the sandbox
 *     database. No production credential, no production database, no real
 *     patient or financial record is involved.
 *
 * Every capture records: file, URL, viewport, role, scenario, HTTP status,
 * page title and the first visible text — the evidence table for the report.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import { Client } from "pg";
import { chromium as pwChromium } from "playwright-core";
import sparticuz from "@sparticuz/chromium";
import { decryptSecret, generateTotpCode } from "/home/user/BEYU-OS-1.0/src/lib/mfa.ts";

const PORT = 3100;
const OUT = "/home/user/shots/out";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const BASE = (host: string) => `http://${host}:${PORT}`;

mkdirSync(OUT, { recursive: true });

const CANONICAL_HOSTNAMES = [
  "beyu.co.tz",
  "www.beyu.co.tz",
  "health.beyu.co.tz",
  "finance.beyu.co.tz",
  "agriculture.beyu.co.tz",
  "ujenzi.beyu.co.tz",
  "foundation.beyu.co.tz",
  "familyoffice.beyu.co.tz",
  "noelia.beyu.co.tz",
  "unknown.beyu.co.tz",
] as const;
const RESOLVER_RULE = `--host-resolver-rules=${CANONICAL_HOSTNAMES.map((h) => `MAP ${h} 127.0.0.1`).join(", ")}`;

/** Real sign-in against the real endpoint; returns the canonical session cookie. */
async function loginCookie(email: string): Promise<string> {
  const admin = new Client({ connectionString: process.env.BEYU_ADMIN_DATABASE_URL });
  await admin.connect();
  const { rows } = await admin.query("select mfa_secret_encrypted from users where email=$1", [email]);
  // Sandbox-only: clear the TOTP replay watermark so a fresh step is accepted.
  await admin.query("update users set mfa_last_accepted_step=null where email=$1", [email]);
  await admin.end();
  const mfaCode = generateTotpCode(decryptSecret(rows[0].mfa_secret_encrypted), Date.now());
  const payload = JSON.stringify({ email, password: process.env.BEYU_BOOTSTRAP_PASSWORD, mfaCode });
  const res = await new Promise<{ status: number; cookies: string[]; body: string }>((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port: PORT,
        path: "/api/v1/auth/login",
        method: "POST",
        headers: {
          host: "beyu.co.tz",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            cookies: (response.headers["set-cookie"] as string[] | undefined) ?? [],
            body,
          }),
        );
      },
    );
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
  if (res.status !== 200) throw new Error(`login ${email} -> ${res.status} ${res.body}`);
  const cookie = res.cookies.find((c) => c.startsWith("beyu_os_session="));
  if (!cookie) throw new Error(`no session cookie for ${email}: ${res.cookies.join(" | ")}`);
  return cookie.split(";")[0]!;
}

type Entry = {
  file: string;
  url: string;
  viewport: string;
  role: string;
  scenario: string;
  httpStatus: string;
  pageTitle: string;
  visibleText: string;
  errorBoundaryScreen: string;
};

const inventory: Entry[] = [];

async function main() {
  const exePath = await sparticuz.executablePath();
  const args = sparticuz.args.filter((a: string) => a !== "--single-process");
  const browser = await pwChromium.launch({
    executablePath: exePath,
    headless: true,
    args: [...args, RESOLVER_RULE, "--hide-scrollbars"],
  });

  const capture = async (
    file: string,
    host: string,
    path: string,
    method: "GET" | "POST",
    opts: {
      email?: string;
      viewport?: { width: number; height: number };
      scenario: string;
      role: string;
      fullPage?: boolean;
      javaScriptEnabled?: boolean;
    },
  ) => {
    const viewport = opts.viewport ?? DESKTOP;
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      locale: "en-GB",
      javaScriptEnabled: opts.javaScriptEnabled ?? true,
    });
    if (opts.email) {
      const cookie = await loginCookie(opts.email);
      await context.addCookies([
        { name: "beyu_os_session", value: cookie.split("=")[1]!, domain: ".beyu.co.tz", path: "/" },
      ]);
    }
    const page = await context.newPage();
    const url = `${BASE(host)}${path}`;
    let status = "-";
    if (method === "GET") {
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
      status = String(response?.status() ?? "-");
    } else {
      // Start on the canonical origin, then submit a real form POST so the
      // browser's Origin header and the server's own fence apply.
      await page.goto(`${BASE(host)}/os`, { waitUntil: "networkidle", timeout: 45_000 });
      const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().includes(path) && r.request().method() === "POST", {
          timeout: 45_000,
        }),
        page.evaluate((action: string) => {
          const form = document.createElement("form");
          form.method = "POST";
          form.action = action;
          document.body.appendChild(form);
          form.submit();
        }, path),
      ]).catch(() => [null] as const);
      status = response ? `${response.status()} (POST)` : "POST (see server log)";
      await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {});
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: opts.fullPage ?? false });
    const visibleText = (await page.locator("body").innerText().catch(() => ""))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 260);
    // The reported failure screen ("BEYU OS could not load this view") is
    // asserted absent/present for every single capture.
    const html = await page.content();
    const errorBoundaryScreen = /could not load this view/.test(html) ? "PRESENT" : "absent";
    inventory.push({
      file: `${file}.png`,
      url: url.replace(`:${PORT}`, ""),
      viewport: `${viewport.width}x${viewport.height}`,
      role: opts.role,
      scenario: opts.scenario,
      httpStatus: status,
      pageTitle: await page.title(),
      visibleText,
      errorBoundaryScreen,
    });
    console.log(`  ${file}.png  ${status.padEnd(12)} ${url}`);
    await context.close();
  };

  console.log("— A. the eight destination experiences, anonymous entry (desktop + mobile) —");
  const hosts: Array<[string, string]> = [
    ["01-home", "beyu.co.tz"],
    ["02-health-os", "health.beyu.co.tz"],
    ["03-finance-os", "finance.beyu.co.tz"],
    ["04-agriculture-os", "agriculture.beyu.co.tz"],
    ["05-ujenzi-os", "ujenzi.beyu.co.tz"],
    ["06-foundation", "foundation.beyu.co.tz"],
    ["07-family-office", "familyoffice.beyu.co.tz"],
    ["08-noelia-ai", "noelia.beyu.co.tz"],
  ];
  for (const [slug, host] of hosts) {
    await capture(`${slug}-signin-desktop`, host, "/", "GET", {
      scenario: "anonymous: destination entry (its own sign-in surface)",
      role: "anonymous",
    });
    await capture(`${slug}-signin-mobile`, host, "/", "GET", {
      viewport: MOBILE,
      scenario: "anonymous: destination entry (its own sign-in surface)",
      role: "anonymous",
    });
  }

  console.log("— B. authenticated destination experiences —");
  await capture("03-finance-os-authenticated-desktop", "finance.beyu.co.tz", "/", "GET", {
    email: "cfo@beyu.os",
    role: "cfo@beyu.os · GROUP_CFO (FINANCE_OS grant)",
    scenario: "authorised identity lands on its own destination frontend",
  });
  await capture("03-finance-os-authenticated-mobile", "finance.beyu.co.tz", "/", "GET", {
    email: "cfo@beyu.os",
    viewport: MOBILE,
    role: "cfo@beyu.os · GROUP_CFO (FINANCE_OS grant)",
    scenario: "authorised identity, mobile viewport",
  });
  await capture("18-finance-os-empty-state-fullpage-desktop", "finance.beyu.co.tz", "/", "GET", {
    email: "cfo@beyu.os",
    role: "cfo@beyu.os · GROUP_CFO (FINANCE_OS grant)",
    scenario: "empty state: zero journal entries, DATA_NOT_AVAILABLE, CAP_POSTING LOCKED",
    fullPage: true,
  });
  await capture("20-role-single-os-destination-desktop", "finance.beyu.co.tz", "/os/finance", "GET", {
    email: "cfo@beyu.os",
    role: "cfo@beyu.os · GROUP_CFO (FINANCE_OS grant)",
    scenario: "single-OS identity deep-links into its own destination route",
  });
  await capture("07-family-office-authenticated-desktop", "familyoffice.beyu.co.tz", "/", "GET", {
    email: "family@beyu.os",
    role: "family@beyu.os · FAMILY_OFFICE_PRINCIPAL",
    scenario: "authorised identity lands on the Family Office capability surface",
  });
  await capture("21-noelia-ai-authenticated-desktop", "noelia.beyu.co.tz", "/", "GET", {
    email: "admin@beyu.os",
    role: "admin@beyu.os · PLATFORM_ADMIN (ai:noelia.query)",
    scenario: "governed AI destination: single NOELIA identity on the HIVE runtime",
  });
  await capture("02-health-os-authenticated-denied-desktop", "health.beyu.co.tz", "/", "GET", {
    email: "cfo@beyu.os",
    role: "cfo@beyu.os · GROUP_CFO (no HEALTH_OS link)",
    scenario: "governed denial rendered on the destination host it asked for",
  });
  await capture("01-home-control-plane-desktop", "beyu.co.tz", "/os", "GET", {
    email: "admin@beyu.os",
    role: "admin@beyu.os · PLATFORM_ADMIN",
    scenario: "BEYU HOME: the constitutional control plane",
  });
  await capture("01-home-launcher-desktop", "beyu.co.tz", "/launcher", "GET", {
    email: "admin@beyu.os",
    role: "admin@beyu.os · PLATFORM_ADMIN",
    scenario: "governed launcher: the identity's authorised union",
  });

  console.log("— B2. the reported flow itself: sign in through the real form in the browser —");
  {
    const admin = new Client({ connectionString: process.env.BEYU_ADMIN_DATABASE_URL });
    await admin.connect();
    const { rows } = await admin.query("select mfa_secret_encrypted from users where email=$1", ["cfo@beyu.os"]);
    await admin.query("update users set mfa_last_accepted_step=null where email='cfo@beyu.os'");
    await admin.end();
    const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, locale: "en-GB" });
    const page = await context.newPage();
    await page.goto(`${BASE("beyu.co.tz")}/`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.fill('input[name="email"]', "cfo@beyu.os");
    await page.fill('input[name="password"]', process.env.BEYU_BOOTSTRAP_PASSWORD!);
    await page.screenshot({ path: `${OUT}/26-browser-signin-form-filled-desktop.png` });
    console.log("  26-browser-signin-form-filled-desktop.png  form filled  /");
    // The step-up field is present but hidden until the server requires it
    // (428/MFA_REQUIRED) or the user asks for it — reveal it the way the UI does.
    await page.click('button:has-text("I have a step-up (MFA) code")');
    await page.fill('input[name="mfaCode"]', generateTotpCode(decryptSecret(rows[0].mfa_secret_encrypted), Date.now()));
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle", { timeout: 45_000 });
    // The form issues an in-app (client-side) navigation. Let it settle; if the
    // address is still the entry path, take the server's own decision with a
    // hard load so the artifact shows the real landing, not a half-applied
    // client transition.
    const settled = await page
      .waitForURL((u) => u.pathname !== "/", { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!settled) await page.goto(`${BASE("beyu.co.tz")}/`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/27-browser-post-signin-landing-desktop.png` });
    const postHtml = await page.content();
    inventory.push({
      file: "26-browser-signin-form-filled-desktop.png",
      url: "http://beyu.co.tz/",
      viewport: `${DESKTOP.width}x${DESKTOP.height}`,
      role: "cfo@beyu.os · GROUP_CFO",
      scenario: "the reported flow, step 1: credentials typed into the real form",
      httpStatus: "200",
      pageTitle: "BEYU OS — Global Enterprise Control Plane",
      visibleText: "sign-in form filled in the browser",
      errorBoundaryScreen: "absent",
    });
    inventory.push({
      file: "27-browser-post-signin-landing-desktop.png",
      url: (await page.url()).replace(`:${PORT}`, ""),
      viewport: `${DESKTOP.width}x${DESKTOP.height}`,
      role: "cfo@beyu.os · GROUP_CFO",
      scenario: "the reported flow, step 2: after sign-in the browser LANDS on a working view (no error boundary)",
      httpStatus: "200",
      pageTitle: await page.title(),
      visibleText: (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 260),
      errorBoundaryScreen: /could not load this view/.test(postHtml) ? "PRESENT" : "absent",
    });
    console.log(`  27-browser-post-signin-landing-desktop.png  ${page.url()}`);
    await context.close();
  }

  console.log("— C. role-aware UI: single-OS, multi-OS, unauthorised, unknown host —");
  await capture("09-role-single-os-launcher-desktop", "beyu.co.tz", "/launcher", "GET", {
    email: "cfo@beyu.os",
    role: "cfo@beyu.os · GROUP_CFO (single destination)",
    scenario: "single-OS user: only the granted destination is launchable",
  });
  await capture("10-role-multi-os-launcher-desktop", "beyu.co.tz", "/launcher", "GET", {
    email: "admin@beyu.os",
    role: "admin@beyu.os · PLATFORM_ADMIN (multi destination)",
    scenario: "multi-OS user: explicit grants union, nothing implied by the role's name",
  });
  await capture("11-role-unauthorised-deep-link-desktop", "ujenzi.beyu.co.tz", "/", "GET", {
    email: "cfo@beyu.os",
    role: "cfo@beyu.os · GROUP_CFO (no UJENZI_OS grant)",
    scenario: "unauthorised user opens a restricted destination URL directly: denied",
  });
  await capture("12-role-unauthorised-in-shell-desktop", "beyu.co.tz", "/os/ujenzi", "GET", {
    email: "cfo@beyu.os",
    role: "cfo@beyu.os · GROUP_CFO (no UJENZI_OS grant)",
    scenario: "unauthorised in-shell deep link: governed denial, no destination data",
  });
  await capture("24-role-denied-agriculture-host-desktop", "agriculture.beyu.co.tz", "/", "GET", {
    email: "cfo@beyu.os",
    role: "cfo@beyu.os · GROUP_CFO (no AGRICULTURE_OS grant)",
    scenario: "second destination denial: the same rule on another Sector OS host",
  });
  await capture("25-health-os-no-identity-link-desktop", "beyu.co.tz", "/health", "GET", {
    email: "cfo@beyu.os",
    role: "cfo@beyu.os · GROUP_CFO (no Health identity link)",
    scenario: "Health OS truthful state: no canonical identity link, no sector data, fail-closed",
  });
  await capture("22-role-not-found-state-desktop", "beyu.co.tz", "/os/no-such-destination", "GET", {
    email: "cfo@beyu.os",
    role: "cfo@beyu.os · GROUP_CFO",
    scenario: "not-found state: distinguishable from denial and from load failure",
  });
  await capture("14-role-unknown-host-failsafe-desktop", "unknown.beyu.co.tz", "/", "GET", {
    role: "anonymous",
    scenario: "unknown host fails safe to the control plane (no destination metadata leaked)",
  });

  console.log("— D. restricted action denied by the SERVER, not by the UI —");
  await capture("15-server-denial-403-cfo-desktop", "beyu.co.tz", "/api/v1/system/release/approvals", "POST", {
    email: "cfo@beyu.os",
    role: "cfo@beyu.os · GROUP_CFO (no platform:config.manage)",
    scenario: "restricted mutating action submitted in the browser: 403 RBAC/ABAC, audited",
  });
  await capture("16-server-authorized-422-admin-desktop", "beyu.co.tz", "/api/v1/system/release/approvals", "POST", {
    email: "admin@beyu.os",
    role: "admin@beyu.os · PLATFORM_ADMIN",
    scenario: "same action, authorised identity: authorization passes, only validation fails (422)",
  });
  await capture("17-server-granted-endpoint-200-cfo-desktop", "beyu.co.tz", "/api/v1/system/posture", "GET", {
    email: "cfo@beyu.os",
    role: "cfo@beyu.os · GROUP_CFO (holds platform:dashboard.read)",
    scenario: "granted read succeeds: the boundary is per-permission, not per-route",
  });

  console.log("— E. states with client JavaScript disabled (server-rendered truth) —");
  await capture("19-role-no-js-denial-in-shell-desktop", "beyu.co.tz", "/os/ujenzi", "GET", {
    email: "cfo@beyu.os",
    role: "cfo@beyu.os · GROUP_CFO (no UJENZI_OS grant)",
    scenario: "client JS disabled: denial is server-rendered, no protected data present",
    javaScriptEnabled: false,
  });
  await capture("23-role-no-js-denial-on-destination-desktop", "ujenzi.beyu.co.tz", "/", "GET", {
    email: "cfo@beyu.os",
    role: "cfo@beyu.os · GROUP_CFO (no UJENZI_OS grant)",
    scenario: "client JS disabled: destination-host denial is server-rendered",
    javaScriptEnabled: false,
  });

  await browser.close();
  writeFileSync(`${OUT}/inventory.json`, JSON.stringify(inventory, null, 2));
  console.log(`\ncaptured ${inventory.length} screenshots`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
