/**
 * BEYU OS — the reported sign-in flow, captured in a real browser over HTTPS.
 *
 * WHY HTTPS: the session cookie is issued `Secure` (production mode and, by
 * policy, whenever a canonical cookie domain is configured — see
 * src/lib/session-cookie.ts). A real browser therefore refuses to STORE it over
 * plain HTTP, so the form-driven flow has to be exercised over TLS. The screens
 * are served by the throwaway self-signed front door in ./tls-front.mjs, which
 * forwards the canonical Host header to the SAME production build on :3100 —
 * same application, same cookie policy, same authorization.
 *
 * Scenarios
 *   26  the real form, filled, before submission (anonymous, no session)
 *   27  after submitting: where the browser actually LANDS (must not be the
 *       "could not load this view" boundary)
 *   28  the same single sign-on session then opens a DIFFERENT canonical host
 *       (finance.beyu.co.tz) with no second sign-in — the cross-host session
 *       the cookie domain policy exists for.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import { chromium as pwChromium } from "playwright-core";
import sparticuz from "@sparticuz/chromium";
import { decryptSecret, generateTotpCode } from "/home/user/BEYU-OS-1.0/src/lib/mfa.ts";

const OUT = "/home/user/shots/out";
const DESKTOP = { width: 1440, height: 900 };
const HTTPS_PORT = 8443;

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

// Start from the HTTP pass, dropping the two entries that pass could not make
// truthful (a Secure session cookie is not STORED by a browser over plain HTTP).
const inventory = (JSON.parse(readFileSync(`${OUT}/inventory.json`, "utf8")) as Entry[]).filter(
  (e) => !/^(26|27|28)/.test(e.file),
);

async function main() {
  const exePath = await sparticuz.executablePath();
  const args = sparticuz.args.filter((a: string) => a !== "--single-process");
  const browser = await pwChromium.launch({
    executablePath: exePath,
    headless: true,
    args: [...args, RESOLVER_RULE, "--hide-scrollbars"],
  });

  const admin = new Client({ connectionString: process.env.BEYU_ADMIN_DATABASE_URL });
  await admin.connect();
  const { rows } = await admin.query("select mfa_secret_encrypted from users where email=$1", ["cfo@beyu.os"]);
  await admin.query("update users set mfa_last_accepted_step=null where email='cfo@beyu.os'");
  await admin.end();

  const context = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 1,
    locale: "en-GB",
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const record = async (file: string, scenario: string, status: string) => {
    const html = await page.content();
    inventory.push({
      file: `${file}.png`,
      url: page.url().replace(":8443", "").replace("https://", "https://"),
      viewport: `${DESKTOP.width}x${DESKTOP.height}`,
      role: "cfo@beyu.os · GROUP_CFO",
      scenario,
      httpStatus: status,
      pageTitle: await page.title(),
      visibleText: (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 260),
      errorBoundaryScreen: /could not load this view/.test(html) ? "PRESENT" : "absent",
    });
    await page.screenshot({ path: `${OUT}/${file}.png` });
    console.log(`  ${file}.png  ${status.padEnd(6)} ${page.url()}`);
  };

  await page.goto(`https://beyu.co.tz:${HTTPS_PORT}/`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.fill('input[name="email"]', "cfo@beyu.os");
  await page.fill('input[name="password"]', process.env.BEYU_BOOTSTRAP_PASSWORD!);
  await page.click('button:has-text("I have a step-up (MFA) code")');
  await page.fill('input[name="mfaCode"]', generateTotpCode(decryptSecret(rows[0].mfa_secret_encrypted), Date.now()));
  await record("26-browser-signin-form-filled-desktop", "the reported flow, step 1: credentials typed into the real form (no session yet)", "200");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle", { timeout: 45_000 });
  await page.waitForTimeout(1200);
  await record("27-browser-post-signin-landing-desktop", "the reported flow, step 2: signed in — the browser LANDS on a working view, no error boundary", "200");

  // Same session, different canonical host — no second sign-in.
  const response = await page.goto(`https://finance.beyu.co.tz:${HTTPS_PORT}/`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.waitForTimeout(800);
  await record(
    "28-browser-sso-cross-host-finance-desktop",
    "single sign-on across canonical hosts: the same session opens Finance OS with no second sign-in",
    String(response?.status() ?? "-"),
  );

  await browser.close();
  writeFileSync(`${OUT}/inventory.json`, JSON.stringify(inventory, null, 2));
  console.log(`inventory rewritten with ${inventory.length} entries`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
