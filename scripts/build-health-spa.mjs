#!/usr/bin/env node
/**
 * Build the EXISTING Health OS single-file SPA into the BEYU frontend.
 *
 * What this does (and nothing else):
 *   1. `npm ci` + `vite build` inside `sectors/health` — the sector's OWN
 *      package, lockfile and toolchain (the root toolchain does not compile
 *      it; see root `tsconfig.json` exclude and `sectors/health/INTEGRATION.md`).
 *   2. Sets the SPA's existing, documented `VITE_API_BASE_URL` build-time knob
 *      (see `sectors/health/.env.example` and `sectors/health/src/services/auth.ts`)
 *      to `/health-os`, so the SPA's ONLY network surface — same-origin
 *      `/health-os/auth/*` — can be proxied to the sector NestJS backend by
 *      `next.config.ts` rewrites when `HEALTH_API_URL` is configured, and
 *      fails closed (404) when it is not. No second deployment architecture.
 *   3. Emits the single-file `dist/index.html` as
 *      `src/app/health/os/spa-content.ts` (a JSON-escaped `export const
 *      healthSpaHtml = "..."`) so the `/health/os` route handler imports it
 *      statically — bundled by whatever bundler Next.js uses, no `?raw`,
 *      no runtime `fs` reads, no build-time secret requirement.
 *
 * No secrets are read or written. The generated file overwrites a small
 * tracked placeholder so typecheck/lint stay green before any build has run.
 * DO NOT COMMIT the generated content of that file.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sector = resolve(root, "sectors", "health");
const outDir = resolve(root, "src", "app", "health", "os");
const outFile = resolve(outDir, "spa-content.ts");
const distHtml = resolve(sector, "dist", "index.html");

function run(cmd, args, env = {}) {
  execFileSync(cmd, args, {
    cwd: sector,
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, ...env },
  });
}

console.log("[build-health-spa] sectors/health: npm ci (sector lockfile, deterministic)…");
// --include=dev is REQUIRED: this install happens INSIDE the root build command,
// where Vercel's build environment sets NODE_ENV=production. npm then omits
// devDependencies from `npm ci` (exit 0, silent), which would leave the sector's
// own vite toolchain — including @tailwindcss/vite, imported directly by
// vite.config.ts — uninstalled. The build would then pick up the root's vite
// binary (vitest's auto-installed peer) and fail with
// ERR_MODULE_NOT_FOUND: Cannot find package '@tailwindcss/vite' when loading
// sectors/health/vite.config.ts. Forcing dev inclusion keeps this install
// deterministic on every platform (Vercel production build, GitHub Actions,
// local) while preserving sector isolation: the sector's own lockfile is the
// sole source of its tree; nothing is borrowed from the root node_modules.
run("npm", ["ci", "--no-audit", "--no-fund", "--include=dev"]);

console.log("[build-health-spa] sectors/health: vite build (single-file, VITE_API_BASE_URL=/health-os)…");
run("npm", ["run", "build"], { VITE_API_BASE_URL: "/health-os" });

const html = readFileSync(distHtml, "utf8");

const header = `/**
 * GENERATED FILE — do not edit; the generated content must NOT be committed.
 *
 * This module is overwritten by \`scripts/build-health-spa.mjs\` on every root
 * build: it compiles the EXISTING Health OS single-file SPA (\`sectors/health\`,
 * Vite + vite-plugin-singlefile, built with the documented
 * \`VITE_API_BASE_URL=/health-os\` knob) and inlines the resulting document
 * here so the governed \`/health/os\` route can serve it.
 *
 * The checked-in state of this file is a small truthful placeholder so that
 * typecheck/lint resolve the module before any build has run. It contains no
 * patient data and no credentials.
 */
`;

writeFileSync(outFile, header + `export const healthSpaHtml = ${JSON.stringify(html)};\n`);

console.log(
  `[build-health-spa] wrote ${relative(root, outFile)} (${(html.length / 1024).toFixed(1)} kB of compiled SPA document)`,
);
console.log("[build-health-spa] reminder: do not commit the generated content of spa-content.ts");
