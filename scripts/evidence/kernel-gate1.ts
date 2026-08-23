import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { users } from "../../src/db/schema";
import { recordAudit, verifyAuditChain } from "../../src/lib/audit";
import { decryptSecret, generateTotpCode } from "../../src/lib/mfa";

const baseUrl = process.env.BEYU_EVIDENCE_BASE_URL ?? "http://localhost:3000";
const password = process.env.BEYU_BOOTSTRAP_PASSWORD;
if (!password) throw new Error("BEYU_BOOTSTRAP_PASSWORD is required for evidence login tests");

type Evidence = { id: string; passed: boolean; detail: Record<string, unknown> };
const evidence: Evidence[] = [];

async function duplicateParents() {
  const r = await db.execute<{ count: string }>(sql`
    select count(*)::text as count from (
      select prev_hash from audit_log where prev_hash is not null group by prev_hash having count(*) > 1
    ) forks
  `);
  return Number(r.rows[0]?.count ?? 0);
}

async function auditConcurrency(n: number) {
  // Never truncate or disable the constitutional audit ledger. The evidence
  // procedure appends to the isolated evidence database and compares the
  // post-run length with the pre-run length instead of destroying history.
  const before = await verifyAuditChain();
  await Promise.all(Array.from({ length: n }, (_, i) => recordAudit({ tenantId: "TEN_BEYU_GROUP", actorUserId: "USR_EVIDENCE", action: "evidence.audit.concurrent", objectType: "EVIDENCE", objectId: `${n}-${i}` })));
  const chain = await verifyAuditChain();
  const dup = await duplicateParents();
  evidence.push({ id: `C-01-${n}-concurrent-audit-writes`, passed: before.verified && chain.verified && chain.records === before.records + n && dup === 0, detail: { requestedWrites: n, recordsBefore: before.records, chain, duplicateParents: dup } });
}

async function totp(email: string, at = Date.now()) {
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u?.mfaSecretEncrypted) throw new Error(`No MFA secret for ${email}`);
  return generateTotpCode(decryptSecret(u.mfaSecretEncrypted), at);
}

async function login(email: string, mfaCode: string) {
  const res = await fetch(`${baseUrl}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, mfaCode }) });
  return { status: res.status, cookie: res.headers.get("set-cookie") ?? "", body: await res.text() };
}

async function mfaEvidence() {
  const email = "ceo@beyu.os";
  await db.update(users).set({ mfaLastAcceptedStep: null, mfaFailedAttempts: 0, mfaLockedUntil: null }).where(eq(users.email, email));
  const badZero = await login(email, "000000");
  const badRandom = await login(email, "123456");
  const expired = await login(email, await totp(email, Date.now() - 10 * 60_000));
  const code = await totp(email);
  const ok = await login(email, code);
  const replay = await login(email, code);
  evidence.push({
    id: "C-04-live-mfa-verification",
    passed: badZero.status === 401 && badRandom.status === 401 && expired.status === 401 && ok.status === 200 && replay.status === 401,
    detail: { zero: badZero.status, random: badRandom.status, expired: expired.status, valid: ok.status, replay: replay.status },
  });
}

async function tenantEvidence() {
  const email = "health.ops@beyu.os";
  const code = await totp(email);
  const auth = await login(email, code);
  const html = await fetch(`${baseUrl}/os/organization`, { headers: { cookie: auth.cookie } }).then((r) => r.text());
  const leaked = ["BEYU Family Trust", "BEYU Holdings Ltd", "BEYU FinTech Ltd", "BEYU Agriculture Ltd", "BEYU Foundation", "BEYU-GROUP"].filter((s) => html.includes(s));
  evidence.push({ id: "C-02-sector-operator-cannot-enumerate-group-topology", passed: auth.status === 200 && leaked.length === 0, detail: { login: auth.status, leaked } });
}

async function main() {
  await auditConcurrency(10);
  await auditConcurrency(50);
  await auditConcurrency(100);
  await mfaEvidence();
  await tenantEvidence();
  const passed = evidence.filter((e) => e.passed).length;
  console.log(JSON.stringify({ ok: passed === evidence.length, total: evidence.length, passed, failed: evidence.length - passed, evidence }, null, 2));
  await pool.end();
  if (passed !== evidence.length) process.exit(1);
}

main().catch(async (e) => {
  console.error(JSON.stringify({ ok: false, error: String(e) }, null, 2));
  await pool.end();
  process.exit(1);
});
