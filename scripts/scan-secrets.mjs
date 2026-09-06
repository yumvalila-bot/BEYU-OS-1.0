#!/usr/bin/env node
/**
 * BEYU OS secret scan (Phase 3, prompt section 60).
 *
 * Scans every git-tracked text file for likely real credentials. It is a
 * *first-pass detection*, not a substitute for independent security review.
 *
 * Credentials that are environment-variable REFERENCES (e.g. `MY_API_KEY_REF`,
 * `process.env.MY_API_KEY`) are allowed: the scan is for literal credential
 * values. Ephemeral literal strings explicitly marked `_not_secret`,
 * `CHANGE_ME`, `placeholder`, `example`, `your-` or `${...}` are ignored.
 *
 * Exit code 1 if a likely credential is found; 0 if clean (or only whitelisted
 * placeholders are found).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files"], { cwd: process.cwd(), encoding: "utf8" }).split("\n").filter(Boolean);

const SKIP_FILES = /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|pdf|lock|json)$/i;
const SKIP_LINE = /(CHANGE_ME|_not_secret|_not_a_secret|placeholder|example\.com|your[-_][a-z]|BROKEN|pending_\w+|TODO)|(\$\{[^}]+\})|(\b(test|fake|dummy|mock|example|postgres|admin|ci|local|demo)\b)|(<[^>]+>)|(\.\.\.)/i;
const FIXTURE_FILE = /(\/tests?\b|\/test\b|\bspec\.[jt]s$)|\.spec\.(ts|js)$|\.test\.(ts|js)$/i;

const PATTERNS = [
  { name: "openai-key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/, always: true },
  { name: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/, always: true },
  { name: "private-key-block", re: /-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/, always: true },
  { name: "bearer-token", re: /\bBearer [A-Za-z0-9._-]{20,}\b/ },
  { name: "password-assignment", re: /\b(password|passwd)\s*[:=]\s*['"][^'"]{8,}['"]/i },
  { name: "api-key-assignment", re: /\b(api[_-]?key|access[_-]?key|secret|client[_-]?secret)\s*[:=]\s*['"][^'"]{8,}['"]/i },
  { name: "auth-token-assignment", re: /\b(auth[_-]?token|access[_-]?token|refresh[_-]?token)\s*[:=]\s*['"][^'"]{8,}['"]/i },
];

const findings = [];
for (const file of tracked) {
  if (SKIP_FILES.test(file)) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (SKIP_LINE.test(line)) continue;
    const isFixture = FIXTURE_FILE.test(file);
    for (const p of PATTERNS) {
      if (p.re.test(line) && (p.always || !isFixture)) findings.push(`${file}:${i + 1}:${p.name}`);
    }
  }
}

if (findings.length) {
  console.error(`Secret scan found ${findings.length} likely credential(s):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`Secret scan clean: scanned ${tracked.length} tracked files. No literal credentials found.`);
