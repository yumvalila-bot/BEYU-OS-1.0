#!/usr/bin/env node
/** Derive platform icons without ever writing to either canonical PNG source.
 * Uses the image processor already shipped with the pinned Next.js toolchain.
 * Mobile receives a byte-exact build copy, not a separately authored identity.
 * --check compares committed web derivatives; it does not mutate files.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "public/brand/beyu-os-logo.png"));
const check = process.argv.includes("--check");
for (const [name, size] of [["favicon.png", 32], ["beyu-app-icon-192.png", 192], ["beyu-app-icon-512.png", 512]]) {
  const output = await sharp(source).resize(size, size, { fit: "contain" }).png().toBuffer();
  const target = resolve(root, "public/brand", name);
  if (check) {
    if (!readFileSync(target).equals(output)) throw new Error(`Stale derived asset: ${name}`);
  } else writeFileSync(target, output);
}
if (!check) {
  const mobile = resolve(root, "mobile/flutter/assets/images");
  mkdirSync(mobile, { recursive: true });
  writeFileSync(resolve(mobile, "beyu-os-logo.png"), source);
}
console.log(check ? "Canonical web icon provenance verified." : "Canonical icons and byte-exact Flutter build asset synchronized.");
