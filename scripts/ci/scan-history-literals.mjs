#!/usr/bin/env node
// Supplemental bounded history scan. The high-confidence tree/history scanner
// remains separate and is not subject to these historical fixture exceptions.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

function git(args, maxBuffer = 64 * 1024 * 1024) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer });
  // Git stderr and patches are never printed: either can contain sensitive data.
  if (result.error || result.status !== 0) {
    console.error('::error::Unable to inspect bounded Git history.');
    process.exit(2);
  }
  return result.stdout;
}

const commits = git(['rev-list', '--all', '--max-count=200']).trim().split('\n').filter(Boolean);
if (!commits.length || commits.some(id => !/^[a-f0-9]{40,64}$/.test(id))) {
  console.error('::error::No valid commits available for history scan.');
  process.exit(2);
}

// Historical development bootstrap values and one Node crypto substitution,
// observed in precisely these commits and path. Exact line hashes prevent a
// changed value or an added secret from inheriting the exception. These are not
// exclusions for current source, other commits, files, or high-confidence keys.
const historicalCommits = new Set([
  '662b9095cf487bee529036f22e818ac4e4acbea9',
  '2fd3d6d1b1f74cfcb6dddb3cb777366be8814c2d',
  '5aca82a23adbc48a79d93053bc10be3489f009a8',
]);
const historicalLines = new Set([
  '5e5e82c68b2f2c0060a9885cda91fdd82e2d768e258ce60a290e356ce6e6e15b',
  'da7f1de093270f776a508a3b3e39ddad0be93c5da84fa0fa567901b6d3884809',
  '04e26cf40ff54ad63f6f2768f54bcdc0953e20fc943858249b341e8390096eb4',
]);
const historicPath = 'scripts/infra/codespaces-bootstrap.sh';
const literal = /(?:password|(?<![\w'\"])(?:api_key|apiKey|[A-Z][A-Z0-9_]*(?:PASSWORD|API_KEY|ACCESS_TOKEN|CLIENT_SECRET)|PASSWORD|API_KEY|ACCESS_TOKEN|CLIENT_SECRET))\s*=\s*(["'])([^"']{8,})/g;
const shellReference = /^(?:\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\$\(\s*openssl\s+rand\s+-(?:hex|base64)\s+[1-9][0-9]*\s*\))$/;
const diff = git(['log', '--no-walk=unsorted', '-m', '--root', '--format=BEYU_COMMIT:%H',
  '--no-color', '--no-ext-diff', '--no-renames', '--unified=0', '-p', ...commits,
  '--', 'src/', 'scripts/', 'tests/']);
let commit = '';
let path = '';
const findings = new Set();
for (const line of diff.split('\n')) {
  if (line.startsWith('BEYU_COMMIT:')) {
    commit = line.slice('BEYU_COMMIT:'.length);
  } else if (line.startsWith('+++ b/')) {
    path = line.slice(6);
  } else if (line.startsWith('+') && !line.startsWith('+++')) {
    const added = line.slice(1);
    const hash = createHash('sha256').update(added).digest('hex');
    if (path === historicPath && historicalCommits.has(commit) && historicalLines.has(hash)) continue;
    for (const match of added.matchAll(literal)) {
      if (path.endsWith('.sh') && match[1] === '"' && shellReference.test(match[2])) continue;
      findings.add(`${commit} ${path}`);
    }
  }
}
if (findings.size) {
  console.error('::error::Possible credential literals detected in recent Git history.');
  for (const finding of [...findings].sort()) console.error(`  - ${finding}`);
  process.exit(1);
}
console.log(`No added credential literals detected in ${commits.length} recent commits (src, scripts, tests).`);
