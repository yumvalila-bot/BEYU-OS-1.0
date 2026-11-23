#!/usr/bin/env node
// Supplemental scan for uppercase credential assignment names in tracked code.
// Existing grep and high-confidence checks still run independently.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const result = spawnSync('git', ['ls-files', '-z', '--', 'src/', 'scripts/', 'tests/'], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
if (result.error || result.status !== 0) {
  console.error('::error::Unable to enumerate tracked credential-scan files.');
  process.exit(2);
}
const files = result.stdout.toString('utf8').split('\0').filter(Boolean);
if (!files.length) {
  console.error('::error::No tracked source files for credential scan.');
  process.exit(2);
}
// Each approved synthetic fixture is pinned to both its exact path and the
// sha256 of its entire source line. A changed value or additional line fails.
// This never exempts the independent high-confidence or existing literal scans.
const reviewed = new Map([
  ['src/lib/noelia/ollama-config.ts', new Set(['32354768c73d607312d8226516f5aa7209403f7bb67cd4ac2e4ba4befc597dc3'])],
  ['tests/bootstrap/enrollment-http.test.ts', new Set(['fd38a8dae42012a3ea77d83eadbbcf5d5f8bab0c94cdf2a3682cd96d06f83422'])],
  ['tests/bootstrap/enrollment.test.ts', new Set(['fd38a8dae42012a3ea77d83eadbbcf5d5f8bab0c94cdf2a3682cd96d06f83422'])],
  ['tests/security/ci-annotation.test.ts', new Set(['d205da8cdc536640b8b0f4513c3dad999c25bcba2b37b7fe0b68234cdfb53e00'])],
  ['tests/security/db-tooling-error-redaction.test.ts', new Set(['45ada692d8cae86e5c8a43361830493cf5f3fcf3507be2efe37d2161d0c74435'])],
  ['tests/security/runtime-role-supabase-boundary.test.ts', new Set(['5816bafc06a38a16500a269b3989b62032759917a84f759fe4a00052287cc4bf', 'a4682f0bf525c3f34398074915cfa05da73b1f98dcde44b7e5da4a1c0d9e069b'])],
]);
const assignment = /(?<![\w'\"])([A-Z][A-Z0-9_]*(?:PASSWORD|API_KEY|ACCESS_TOKEN|CLIENT_SECRET)|PASSWORD|API_KEY|ACCESS_TOKEN|CLIENT_SECRET)\s*=\s*(["'])([^"']{8,})/g;
const shellReference = /^(?:\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\$\(\s*openssl\s+rand\s+-(?:hex|base64)\s+[1-9][0-9]*\s*\))$/;
const findings = [];
for (const file of files) {
  let bytes;
  try { bytes = readFileSync(file); } catch {
    console.error('::error::Unable to read a tracked credential-scan file.');
    process.exit(2);
  }
  if (bytes.includes(0)) continue; // Same binary-file convention as git grep -I.
  for (const [index, line] of bytes.toString('utf8').split('\n').entries()) {
    const hash = createHash('sha256').update(line).digest('hex');
    if (reviewed.get(file)?.has(hash)) continue;
    for (const match of line.matchAll(assignment)) {
      if (file.endsWith('.sh') && match[2] === '"' && shellReference.test(match[3])) continue;
      findings.push(`${file}:${index + 1}`);
      break;
    }
  }
}
if (findings.length) {
  console.error('::error::Possible credential literals detected in tracked files.');
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exit(1);
}
console.log(`No uppercase credential literals detected in ${files.length} tracked source files.`);
