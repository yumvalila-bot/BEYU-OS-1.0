import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
function stepScript(name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `missing step ${name}`);
  const end = workflow.indexOf('\n      - name:', start + marker.length);
  const step = workflow.slice(start, end < 0 ? undefined : end);
  const run = step.indexOf('        run: |\n');
  assert.notEqual(run, -1, `missing script in ${name}`);
  const lines = step.slice(run + '        run: |\n'.length).split('\n');
  const script = [];
  for (const line of lines) {
    if (line.trim() && !line.startsWith('          ')) break;
    script.push(line.slice(10));
  }
  return script.join('\n');
}

function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'beyu-secret-test-'));
  try {
    for (const p of ['src', 'scripts', 'tests', 'sectors/health/backend']) mkdirSync(join(dir, p), { recursive: true });
    for (const p of ['.env.example', 'sectors/health/.env.example', 'sectors/health/backend/.env.example']) {
      writeFileSync(join(dir, p), 'SAFE=value\n');
    }
    execFileSync('git', ['init', '-q', dir]);
    fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function run(name, cwd) {
  return spawnSync('bash', ['-c', stepScript(name)], { cwd, encoding: 'utf8' });
}

for (const [step, file, prefix] of [
  ['Credential literal scan', 'src/fixture.ts', 'password' + '="'],
  ['Committed-secret filename scan', '.env.example', 'PASSWORD' + '='],
]) {
  test(`${step} fails without revealing the matching value`, () => fixture(dir => {
    const synthetic = 'synthetic_' + 'VALUE_12345678901234567890';
    writeFileSync(join(dir, file), `${prefix}${synthetic}"\n`);
    const result = run(step, dir);
    assert.equal(result.status, 1, result.stderr);
    assert.ok((result.stdout + result.stderr).includes(file));
    assert.ok(!(result.stdout + result.stderr).includes(synthetic));
  }));
  test(`${step} accepts clean input`, () => fixture(dir => {
    const result = run(step, dir);
    assert.equal(result.status, 0, result.stderr);
  }));
}

test('credential scanner fails closed when a scan root is missing', () => fixture(dir => {
  rmSync(join(dir, 'scripts'), { recursive: true });
  const result = run('Credential literal scan', dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /scan failed/);
}));

test('template scan fails closed when an expected template is missing', () => fixture(dir => {
  rmSync(join(dir, 'sectors/health/backend/.env.example'));
  const result = run('Committed-secret filename scan', dir);
  assert.notEqual(result.status, 0);
}));

for (const filename of ['.env', '.env.preview']) {
  test(`tracked ${filename} is blocked`, () => fixture(dir => {
    writeFileSync(join(dir, filename), 'fixture\n');
    execFileSync('git', ['add', '-f', filename], { cwd: dir });
    const result = run('Committed-secret filename scan', dir);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes(filename));
  }));
}

for (const [label, value] of [
  ['private key', '-----BEGIN ' + 'PRIVATE KEY-----'],
  ['GitHub token', 'gh' + 'p_' + 'A'.repeat(36)],
]) {
  test(`committed-tree scan detects synthetic ${label} without printing it`, () => fixture(dir => {
    writeFileSync(join(dir, 'src/fixture'), value + '\n');
    execFileSync('git', ['add', 'src/fixture'], { cwd: dir });
    const result = run('Scan committed tree for high-confidence credential patterns', dir);
    assert.equal(result.status, 1);
    assert.ok(!(result.stdout + result.stderr).includes(value));
  }));
}

test('recent history scan detects a removed synthetic token', () => fixture(dir => {
  const value = 'gh' + 'p_' + 'B'.repeat(36);
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('config', 'user.name', 'Synthetic Test');
  git('config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(dir, 'src/fixture'), value + '\n');
  git('add', 'src/fixture');
  git('commit', '-qm', 'synthetic fixture');
  writeFileSync(join(dir, 'src/fixture'), 'clean\n');
  git('add', 'src/fixture');
  git('commit', '-qm', 'remove fixture');
  const result = run('Scan recent history for the same patterns (bounded)', dir);
  assert.equal(result.status, 1);
  assert.ok(!(result.stdout + result.stderr).includes(value));
}));

test('credential names referencing environment variables do not match', () => fixture(dir => {
  writeFileSync(join(dir, 'scripts/fixture'), 'runtime_password=$DB_RUNTIME_VALUE\ngovernance_password=$DB_GOVERNANCE_VALUE\n');
  const result = run('Credential literal scan', dir);
  assert.equal(result.status, 0, result.stderr);
}));

test('shell hardcoded password fails without displaying its value', () => fixture(dir => {
  const value = 'synthetic-' + 'db-credential-12345';
  writeFileSync(join(dir, 'scripts/fixture.sh'), 'pass' + `word="${value}"\n`);
  const result = run('Credential literal scan', dir);
  assert.equal(result.status, 1);
  assert.ok(!(result.stdout + result.stderr).includes(value));
}));

test('short explicit template placeholder is accepted', () => fixture(dir => {
  writeFileSync(join(dir, '.env.example'), 'PASSWORD=' + 'CHANGE_ME\n');
  const result = run('Committed-secret filename scan', dir);
  assert.equal(result.status, 0, result.stderr);
}));

test('high-confidence API token embedded in source is detected', () => fixture(dir => {
  const token = 'gh' + 'p_' + 'C'.repeat(36);
  writeFileSync(join(dir, 'src/fixture'), 'api' + '_key="' + token + '"\n');
  execFileSync('git', ['add', 'src/fixture'], { cwd: dir });
  const result = run('Scan committed tree for high-confidence credential patterns', dir);
  assert.equal(result.status, 1);
  assert.ok(!(result.stdout + result.stderr).includes(token));
}));

test('generic hardcoded API key is detected without exposing its value', () => fixture(dir => {
  const value = 'synthetic-' + 'api-credential-98765';
  writeFileSync(join(dir, 'scripts/fixture.sh'), 'api' + `_key="${value}"\n`);
  const result = run('Credential literal scan', dir);
  assert.equal(result.status, 1);
  assert.ok(!(result.stdout + result.stderr).includes(value));
}));

test('entire shell-generated random credential is accepted', () => fixture(dir => {
  writeFileSync(join(dir, 'scripts/fixture.sh'), 'runtime_pass' + 'word="$(openssl rand -hex 32)"\n');
  const result = run('Credential literal scan', dir);
  assert.equal(result.status, 0, result.stderr);
}));

test('generated credential with an appended literal is not exempt', () => fixture(dir => {
  writeFileSync(join(dir, 'scripts/fixture.sh'), 'runtime_pass' + 'word="$(openssl rand -hex 32)literal"\n');
  const result = run('Credential literal scan', dir);
  assert.equal(result.status, 1, result.stderr);
}));

test('short template credential is blocked without printing it', () => fixture(dir => {
  const value = 'syn' + 'th-12';
  writeFileSync(join(dir, '.env.example'), 'PASSWORD=' + value + '\n');
  const result = run('Committed-secret filename scan', dir);
  assert.equal(result.status, 1);
  assert.ok(!(result.stdout + result.stderr).includes(value));
}));

test('template environment reference is accepted', () => fixture(dir => {
  writeFileSync(join(dir, '.env.example'), 'PASSWORD=' + '${DB_PASSWORD}' + '\n');
  const result = run('Committed-secret filename scan', dir);
  assert.equal(result.status, 0, result.stderr);
}));

test('shell-looking string in non-shell source is not exempt', () => fixture(dir => {
  writeFileSync(join(dir, 'src/fixture.js'), 'const pass' + 'word="$(openssl rand -hex 32)";\n');
  const result = run('Credential literal scan', dir);
  assert.equal(result.status, 1, result.stderr);
}));

test('single-quoted shell substitution is literal and is not exempt', () => fixture(dir => {
  writeFileSync(join(dir, 'scripts/fixture.sh'), 'runtime_pass' + "word='$(openssl rand -hex 32)'\n");
  const result = run('Credential literal scan', dir);
  assert.equal(result.status, 1, result.stderr);
}));

test('quoted shell credential references are accepted', () => fixture(dir => {
  writeFileSync(join(dir, 'scripts/fixture.sh'), 'runtime_pass' + 'word="${RUNTIME_CREDENTIAL}"\ngovernance_pass' + 'word="$GOVERNANCE_CREDENTIAL"\n');
  const result = run('Credential literal scan', dir);
  assert.equal(result.status, 0, result.stderr);
}));

test('mixed shell reference and literal is not exempt', () => fixture(dir => {
  writeFileSync(join(dir, 'scripts/fixture.sh'), 'runtime_pass' + 'word="${RUNTIME_CREDENTIAL}literal"\n');
  const result = run('Credential literal scan', dir);
  assert.equal(result.status, 1, result.stderr);
}));
