/**
 * BEYU OS — local disaster-recovery drill (Phase 18 engineering).
 *
 * Exercises the procedures that CAN be exercised locally against a real
 * PostgreSQL engine, using the repository's own DR doctrine:
 *
 *   SCHEMA AUTHORITY = the migration ledger in Git (never a database copy)
 *   DATA              = restored from a live logical snapshot
 *
 * Drill phases:
 *   1. SNAPSHOT the source database (admin URL): migration count, schema
 *      drift fingerprint (same query family as scripts/migrate.ts), RLS
 *      inventory, governed-chain integrity, row counts.
 *   2. RECONSTRUCT a scratch database from NOTHING but the repository
 *      migrations (spawns the real `npm run migrate` runner — no duplicated
 *      migration logic).
 *   3. VERIFY schema parity: scratch fingerprint === source fingerprint.
 *   4. RESTORE data table-by-table in FK-dependency rounds (all public
 *      tables except the migration ledger itself, which the runner owns), in one
 *      transaction, with a second pass for tables a cross-table domain guard
 *      objected to only because of load order — then re-check the domain
 *      invariants as queries in both databases and require them to agree.
 *   5. VALIDATE post-restore state: row-count parity for every table, same
 *      RLS-enabled table set, enterprise-event hash chain (single genesis,
 *      no forks, no dangling), audit-chain heads present, service-principal
 *      registry present.
 *   6. DESTROY the scratch database (always, even on failure).
 *
 * OPT-IN PAYMENT PHASE (`--payments`, payments programme §49-§52)
 * A generic restore test proves tables came back. For a financial system the
 * question is narrower and harder: does a LIVE PAYMENT LIFECYCLE come back intact,
 * and does the restored database still refuse to book the same money twice? With
 * `--payments` the drill additionally
 *   1b. builds a real lifecycle in the SOURCE database through the production paths
 *       (governed configuration CLI, signed webhook ingest, settlement batch,
 *       governed exception review, Finance OS posting), so the snapshot contains
 *       money, not just rows;
 *   2b. provisions the runtime role in the scratch database (`setup-db-role.ts`),
 *       because migrations alone do not reproduce grants, and compares the
 *       `beyu_runtime` grant set between source and restore;
 *   5b. verifies lifecycle parity table by table between source and restore, confirms
 *       the 0029 unposting guard is still armed after the restore, then REPLAYS the
 *       provider's original delivery against the restored database as the runtime
 *       role in a separate process — and requires the outcome to be DUPLICATE with
 *       no second transaction and no second journal entry.
 * The fixture is then removed from the source through the same audited teardown the
 * demonstration uses, so the drill leaves no trace. `--payments-keep` skips that.
 *
 * Passing `--payments` is LOCAL evidence about this repository's restore procedure.
 * It is not a backup-facility test, not a production restore, and not evidence about
 * any real provider: a restore that re-opened the accounting path is what it checks
 * for, and nothing more.
 *
 * Exit contract (repo convention): 0 = drill PASSED, 1 = drill FAILED
 * (restored state did not validate), 2 = drill could not run (environment).
 *
 * HONEST CLASSIFICATION: passing this drill verifies the LOCAL procedure and
 * the repository's reconstructability. It is NOT production restore
 * certification: real production backup/PITR on Supabase, RTO/RPO measurement
 * against production infrastructure, and a restore drill on production
 * credentials remain EXTERNAL_BLOCKED until the owner provides access
 * (blockers X-1/X-6).
 */
import { Client } from "pg";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
/** TZS 250,000 in minor units — the amount the payment fixture and its tests share. */
const PAYMENTS_AMOUNT_MINOR = 250000;
const argValue = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const ADMIN_URL: string = process.env.BEYU_ADMIN_DATABASE_URL ?? argValue("--admin-url") ?? "";
if (!ADMIN_URL) {
  console.error("usage: BEYU_ADMIN_DATABASE_URL=<source admin url> tsx scripts/dr-drill.ts");
  process.exit(2);
}

const PAYMENTS = process.argv.includes("--payments");
const PAYMENTS_TAG = (argValue("--payments-tag") ?? `DR${Date.now().toString(36)}`).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
const KEEP_FIXTURE = process.argv.includes("--payments-keep");
/**
 * `--keep-scratch` leaves the reconstructed database in place (and skips the fixture
 * teardown) so an operator can inspect a failed restore instead of guessing from the
 * log. It must never be used in CI: the scratch is a full copy of the data.
 */
const KEEP_SCRATCH = process.argv.includes("--keep-scratch");
const RUNTIME_ROLE = process.env.BEYU_RUNTIME_DB_ROLE ?? "beyu_runtime";

const scratchUrl = (db: string) => ADMIN_URL.replace(/\/[^/]+$/, `/${db}`);

const FINGERPRINT_SQL = `
  select md5(string_agg(item, '\\n' order by item)) as fingerprint
  from (
    select 'table:'||table_name as item from information_schema.tables where table_schema='public'
    union all
    select 'column:'||table_name||'.'||column_name||':'||data_type||':'||is_nullable from information_schema.columns where table_schema='public'
    union all
    select 'constraint:'||conname||':'||contype::text from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public'
    union all
    select 'index:'||indexname||':'||indexdef from pg_indexes where schemaname='public'

      union all
      select 'rls:'||c.relname||':'||c.relrowsecurity::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
        ) s`;

interface Snapshot {
  fingerprint: string;
  migrations: number;
  tables: string[];
  rlsTables: string[];
  counts: Record<string, number>;
  chainOk: boolean;
  chainDetail: { genesis: number; forks: number; dangling: number };
  auditHeads: number;
  principals: number;
}

async function snapshot(c: Client): Promise<Snapshot> {
  const fingerprint = (await c.query(FINGERPRINT_SQL)).rows[0].fingerprint as string;
  const migrations = (await c.query("select count(*)::int n from beyu_migrations")).rows[0].n as number;
  const tables = (
    await c.query(
      "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name",
    )
  ).rows.map((r) => r.table_name as string);
  const rlsTables = (
    await c.query(
      "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity order by c.relname",
    )
  ).rows.map((r) => r.relname as string);
  const counts: Record<string, number> = {};
  for (const t of tables) {
    counts[t] = (await c.query(`select count(*)::int n from "${t}"`)).rows[0].n as number;
  }
  const chain = (
    await c.query(`
      with t as (select id, prev_hash, hash from enterprise_events)
      select
        (select count(*)::int from t where prev_hash is null) as genesis,
        (select count(*)::int from (select prev_hash from t where prev_hash is not null group by prev_hash having count(*)>1) f) as forks,
        (select count(*)::int from t child where prev_hash is not null
           and not exists (select 1 from t parent where parent.hash = child.prev_hash)) as dangling
    `)
  ).rows[0] as { genesis: number; forks: number; dangling: number };
  const auditHeads = (
    await c.query("select count(*)::int n from audit_chain_heads")
  ).rows[0].n as number;
  const principals = (
    await c.query("select count(*)::int n from service_principals")
  ).rows[0].n as number;
  const chainOk = chain.genesis === 1 && chain.forks === 0 && chain.dangling === 0;
  return { fingerprint, migrations, tables, rlsTables, counts, chainOk, chainDetail: chain, auditHeads, principals };
}

/**
 * The reconstructed scratch is built from the migrations' own seed rows, so it
 * already contains the same governed default data as the source. Restore
 * therefore happens in two phases: first CLEAR the scratch tables (so restored
 * rows are exact copies), then INSERT them in FK-safe rounds. Clearing is done
 * with `session_replication_role = replica` so the schema's append-only TRUNCATE
 * guards are not consulted while erasing the scratch — they protect production
 * append-only data, not a reconstruction that is about to be repopulated with
 * the source rows. The subsequent insert path leaves triggers/replication role
 * at origin, so the restored rows still have to satisfy the schema's real
 * INSERT/immutability rules; post-restore validation re-checks the fingerprint,
 * row counts, RLS set and governed chains.
 */
async function clearTables(dst: Client, tables: string[]): Promise<void> {
  if (tables.length === 0) return;
  await dst.query("set session_replication_role = replica");
  try {
    await dst.query(`truncate table ${tables.map((t) => `"${t}"`).join(", ")} cascade`);
  } finally {
    await dst.query("set session_replication_role = origin");
  }
}

/**
 * Insert one source table into the (already cleared) scratch. The copy is
 * ALL-OR-NOTHING per table, using a savepoint so a deferred table leaves no
 * partial row set behind and the caller's transaction stays usable.
 *
 * `optimistic` (the first pass) defers a table to a later round for ANY refusal:
 * a foreign key that a not-yet-copied table will satisfy, or a domain guard that
 * becomes satisfiable once the rest of the data is present. `committed` (the
 * second pass) treats a refusal as a real failure, because by then every row of
 * every table is loaded and there is nothing left to wait for.
 */
async function copyTable(src: Client, dst: Client, table: string, pass: "optimistic" | "committed" = "optimistic"): Promise<number> {
  const res = await src.query(`select * from "${table}"`);
  if (res.rows.length === 0) return 0;
  // node-pg serializes JS arrays as PG array literals — WRONG for json/jsonb
  // columns — and Date objects need YYYY-MM-DD for date columns. Respect the
  // column types explicitly.
  const types = new Map<string, string>(
    (
      await src.query(
        `select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1`,
        [table],
      )
    ).rows.map((r) => [r.column_name as string, r.data_type as string]),
  );
  const coerce = (name: string, v: unknown): unknown => {
    if (v === null || v === undefined) return v;
    const t = types.get(name) ?? "";
    if ((t === "json" || t === "jsonb") && (typeof v === "object")) return JSON.stringify(v);
    if (t === "date" && v instanceof Date) return v.toISOString().slice(0, 10);
    return v;
  };
  const cols = res.fields.map((f) => `"${f.name}"`).join(", ");
  const placeholders = res.fields.map((_, i) => `$${i + 1}`).join(", ");
  let inserted = 0;
  const savepoint = `sp_copy_${table.replace(/[^A-Za-z0-9_]/g, "_")}`;
  await dst.query(`savepoint ${savepoint}`);
  try {
    for (const row of res.rows) {
      const values = res.fields.map((f) => coerce(f.name, row[f.name]));
      await dst.query(`insert into "${table}" (${cols}) values (${placeholders})`, values);
      inserted++;
    }
    await dst.query(`release savepoint ${savepoint}`);
  } catch (e) {
    // Undo the WHOLE per-table attempt: either the table copies completely or
    // nothing changes, so a later round never sees a half-copied table.
    await dst.query(`rollback to savepoint ${savepoint}`);
    if (pass === "optimistic") return -1;
    throw new Error(`table ${table}: ${(e as Error).message}`);
  }
  return inserted;
}

async function main(): Promise<number> {
  const scratchDb = `beyu_dr_drill_${Date.now().toString(36)}`;
  const src = new Client({ connectionString: ADMIN_URL });
  await src.connect();

  // Phase 1b: a payment lifecycle must exist BEFORE the snapshot, so that the
  // restore is tested against money rather than against empty tables.
  let payments: Record<string, unknown> | null = null;
  let fixture: import("./payments-dr-fixture").PaymentFixture | null = null;
  if (PAYMENTS) {
    const mod = await import("./payments-dr-fixture");
    console.log(`[dr-drill] phase 1b — build payment lifecycle ${PAYMENTS_TAG} in the source database`);
    fixture = await mod.createPaymentFixture({ tag: PAYMENTS_TAG });
    console.log(`[dr-drill] phase 1b — posted: ${JSON.stringify(fixture.posting)}`);
  }

  console.log("[dr-drill] phase 1 — snapshot source");
  const source = await snapshot(src);
  console.log(
    `[dr-drill] source: ${source.migrations} migrations, fingerprint ${source.fingerprint}, ` +
      `${source.tables.length} tables, ${source.rlsTables.length} RLS tables, chain ok=${source.chainOk}`,
  );

  console.log(`[dr-drill] phase 2 — reconstruct scratch database ${scratchDb} from migrations only`);
  await src.query(`create database ${scratchDb}`);
  let dst: Client | null = null;
  try {
    // Run the REAL migration runner (no duplicated logic) against the scratch DB.
    const scratchAdmin = scratchUrl(scratchDb);
    const out = execFileSync("npx", ["tsx", "scripts/migrate.ts"], {
      cwd: REPO,
      env: { ...process.env, BEYU_ADMIN_DATABASE_URL: scratchAdmin },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!out.includes("fingerprintAfter")) throw new Error(`migration runner output unexpected: ${out.slice(0, 300)}`);

    // Phase 2b: grants are not part of the migration ledger, so a restore that stops
    // at `migrate` comes back with the wrong access posture. Provision the runtime
    // role the same way a real rebuild would, then compare it against the source.
    let roleSetup: { ran: true; scratch: number; source: number } | null = null;
    if (PAYMENTS) {
      console.log("[dr-drill] phase 2b — provision the runtime role in the scratch database");
      execFileSync("npx", ["tsx", "scripts/setup-db-role.ts"], {
        cwd: REPO,
        env: { ...process.env, BEYU_ADMIN_DATABASE_URL: scratchAdmin },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const grants = async (url: string) => {
        const c = new Client({ connectionString: url });
        await c.connect();
        try {
          const rows = (
            await c.query(
              `select table_name, privilege_type from information_schema.role_table_grants where grantee = $1 order by 1, 2`,
              [RUNTIME_ROLE],
            )
          ).rows as { table_name: string; privilege_type: string }[];
          return rows.map((r) => `${r.table_name}:${r.privilege_type}`);
        } finally {
          await c.end().catch(() => undefined);
        }
      };
      const [scratchGrants, sourceGrants] = [await grants(scratchAdmin), await grants(ADMIN_URL)];
      roleSetup = { ran: true, scratch: scratchGrants.length, source: sourceGrants.length };
      (roleSetup as Record<string, unknown>).missingOnScratch = sourceGrants.filter((g) => !scratchGrants.includes(g)).slice(0, 20);
      (roleSetup as Record<string, unknown>).extraOnScratch = scratchGrants.filter((g) => !sourceGrants.includes(g)).slice(0, 20);
      console.log(`[dr-drill] phase 2b — runtime grants source=${sourceGrants.length} scratch=${scratchGrants.length}`);
    }

    dst = new Client({ connectionString: scratchAdmin });
    await dst.connect();

    console.log("[dr-drill] phase 3 — schema parity");
    const scratchFp = (await dst.query(FINGERPRINT_SQL)).rows[0].fingerprint as string;
    if (scratchFp !== source.fingerprint) {
      console.error(`[dr-drill] FAILED: fingerprint mismatch source=${source.fingerprint} scratch=${scratchFp}`);
      return 1;
    }
    console.log("[dr-drill] fingerprint parity OK");

    console.log("[dr-drill] phase 4 — restore data (FK-dependency rounds)");
    const restoreTables = source.tables.filter((t) => t !== "beyu_migrations");
    // Clear the reconstructed scratch, then re-insert in FK-safe rounds. The
    // old per-table "delete then insert" approach could not restore densely
    // interlinked migration seed rows (Noelia AI/compliance sets reference one
    // another through the model/provider/identity/requirements/controls graph),
    // because deleting one side of that graph violates the other side's FK.
    await clearTables(dst, restoreTables);
    const pending = new Set(restoreTables);
    const guardDeferred = new Set<string>();
    await dst.query("begin");
    try {
      // First pass, guards ENABLED. A restore that loads data which obeys the schema's
      // own rules should never need to skip them, and any table that a cross-table
      // guard objects to is retried once the rows it depends on are present.
      for (let round = 0; round < restoreTables.length + 1 && pending.size > 0; round++) {
        for (const t of [...pending]) {
          const n = await copyTable(src, dst, t, "optimistic");
          if (n >= 0) pending.delete(t);
        }
      }
      // Second pass, domain triggers skipped for the load only. This exists because
      // the payment schema deliberately encodes a cross-table invariant (`POSTED`
      // requires a journal entry, and the entry's own balance rule needs its lines),
      // which no per-table insertion order can satisfy while the tables also form an
      // FK cycle. The invariant is then verified directly in phase 5 rather than
      // trusted to trigger timing.
      if (pending.size > 0) {
        for (const t of pending) guardDeferred.add(t);
        console.log(`[dr-drill] phase 4 — ${pending.size} table(s) deferred by guards, loading them with domain triggers skipped: ${[...pending].join(", ")}`);
        await dst.query("set local session_replication_role = replica");
        for (let round = 0; round < pending.size + 1 && pending.size > 0; round++) {
          for (const t of [...pending]) {
            const n = await copyTable(src, dst, t, "committed");
            if (n >= 0) pending.delete(t);
          }
        }
      }
      if (pending.size > 0) {
        throw new Error(`could not restore (FK cycles?): ${[...pending].join(", ")}`);
      }
    } catch (error) {
      await dst.query("rollback").catch(() => undefined);
      throw error;
    }
    // The restored rows must satisfy the schema's rules, whether or not a trigger was
    // consulted during the load — so the load itself is only half the proof. The
    // domain invariants are re-checked as queries, in both databases, and must agree.
    await dst.query("commit");
    const invariantSql = `
      select
        (select count(*)::int from public.payment_transactions t
          where t.accounting_status = 'POSTED'
            and (t.journal_entry_id is null
                 or not exists (select 1 from public.journal_entries e
                                 where e.id = t.journal_entry_id
                                   and e.legal_entity_id = t.legal_entity_id
                                   and e.source = 'PAYMENTS'))) as posted_without_entry,
        (select count(*)::int from public.journal_entries e
          where e.source = 'PAYMENTS'
            and (select count(*)::int from public.journal_lines l where l.entry_id = e.id) = 0) as empty_entries,
        (select count(*)::int from public.journal_entries e
          where e.source = 'PAYMENTS'
            and (select coalesce(sum(l.debit::numeric), 0) from public.journal_lines l where l.entry_id = e.id)
              <> (select coalesce(sum(l.credit::numeric), 0) from public.journal_lines l where l.entry_id = e.id)) as unbalanced_entries,
        (select count(*)::int from public.payment_transaction_states st
          where not exists (select 1 from public.payment_transactions t where t.id = st.transaction_id)) as orphan_states`;
    const [srcInvariants, dstInvariants] = [await src.query(invariantSql), await dst.query(invariantSql)];
    if (JSON.stringify(srcInvariants.rows) !== JSON.stringify(dstInvariants.rows)) {
      console.error(`[dr-drill] FAILED: domain invariants differ after restore: source=${JSON.stringify(srcInvariants.rows[0])} restored=${JSON.stringify(dstInvariants.rows[0])}`);
      return 1;
    }
    const [inv] = dstInvariants.rows as Record<string, number>[];
    if (Number(inv.posted_without_entry) > 0 || Number(inv.empty_entries) > 0 || Number(inv.unbalanced_entries) > 0 || Number(inv.orphan_states) > 0) {
      console.error(`[dr-drill] FAILED: the restored database violates its own accounting invariants: ${JSON.stringify(inv)}`);
      return 1;
    }
    console.log(
      `[dr-drill] phase 4 — invariants hold in both databases (${JSON.stringify(inv)}${guardDeferred.size > 0 ? `, guards skipped during load for ${[...guardDeferred].join(", ")}` : ""})`,
    );

    console.log("[dr-drill] phase 5 — post-restore validation");
    const scratch = await snapshot(dst);
    const failures: string[] = [];
    if (scratch.fingerprint !== source.fingerprint) failures.push("fingerprint drifted during restore");
    for (const t of restoreTables) {
      if (scratch.counts[t] !== source.counts[t]) {
        failures.push(`row-count mismatch ${t}: source=${source.counts[t]} restored=${scratch.counts[t]}`);
      }
    }
    const srcRls = source.rlsTables.join(",");
    const dstRls = scratch.rlsTables.join(",");
    if (srcRls !== dstRls) failures.push(`RLS set mismatch: source=[${srcRls}] restored=[${dstRls}]`);
    // Parity, not absolutes: an unseeded source (CI scratch) has an empty
    // chain on both sides; a seeded source must restore an INTACT chain.
    if (scratch.chainOk !== source.chainOk) {
      failures.push(
        `enterprise event chain integrity changed by restore: source ok=${source.chainOk} (${JSON.stringify(source.chainDetail)}) restored ok=${scratch.chainOk} (${JSON.stringify(scratch.chainDetail)})`,
      );
    }
    if (scratch.auditHeads !== source.auditHeads) failures.push("audit chain heads mismatch");
    if (scratch.principals !== source.principals) failures.push("service-principal registry mismatch");

    // Phase 5b — the payment lifecycle, and the replay that must not book twice.
    if (PAYMENTS && fixture && dst) {
      const mod = await import("./payments-dr-fixture");
      console.log("[dr-drill] phase 5b — verify the payment lifecycle in the restored database");
      const checks = await mod.verifyPaymentRestore(dst, fixture, src);
      for (const check of checks.filter((c) => !c.ok)) {
        failures.push(`payment restore check "${check.name}": source=${JSON.stringify(check.source)} restored=${JSON.stringify(check.restored)}`);
      }
      if (roleSetup) {
        const missing = (roleSetup as Record<string, unknown>).missingOnScratch as string[];
        const extra = (roleSetup as Record<string, unknown>).extraOnScratch as string[];
        if (missing.length > 0) failures.push(`restored database is missing ${missing.length} runtime grants, e.g. ${missing.slice(0, 4).join(", ")}`);
        if (extra.length > 0) failures.push(`restored database grants ${extra.length} privileges the source does not (capability left behind), e.g. ${extra.slice(0, 4).join(", ")}`);
      }

      // The replay runs as a SEPARATE process pointed at the restored database, so it
      // cannot be helped by anything the parent holds in memory, and it connects as
      // the runtime role — the role the platform actually runs as. Two cases are
      // checked, because they are different controls: an identical delivery must be
      // acknowledged as a duplicate without booking anything, and a same-id
      // different-bytes delivery must be refused and escalated.
      const runtimeUrl = (process.env.BEYU_RUNTIME_DATABASE_URL ?? ADMIN_URL).replace(/\/[^/]+$/, `/${scratchDb}`);
      const runReplay = (extra: string[]) => {
        const raw = execFileSync("npx", ["tsx", "scripts/payments-dr-replay.ts", `--tag=${fixture!.tag}`, `--connection-id=${fixture!.connectionId}`, ...extra], {
          cwd: REPO,
          env: { ...process.env, DATABASE_URL: runtimeUrl, BEYU_ADMIN_DATABASE_URL: scratchAdmin, BEYU_RUNTIME_DATABASE_URL: runtimeUrl },
          encoding: "utf8",
          maxBuffer: 8 * 1024 * 1024,
        });
        return JSON.parse(raw.trim().slice(raw.indexOf("{"))) as Record<string, unknown>;
      };
      const bodyArg = `--body-b64=${Buffer.from(fixture.body, "utf8").toString("base64")}`;
      const replay = runReplay([bodyArg]);
      const tamper = runReplay([bodyArg, "--tamper=amount"]);
      const after = (
        await dst.query(
          `select (select count(*)::int from public.payment_transactions where provider_transaction_id = $1) as transactions,
                  (select count(*)::int from public.journal_entries) as entries,
                  (select count(*)::int from public.journal_lines) as lines,
                  (select count(*)::int from public.payment_webhook_events where provider_event_id = $2) as inbox,
                  (select gross_minor::text from public.payment_transactions where provider_transaction_id = $1) as gross,
                  (select accounting_status from public.payment_transactions where provider_transaction_id = $1) as accounting_status`,
          [fixture.providerTransactionId, fixture.providerEventId],
        )
      ).rows[0] as Record<string, string | number>;
      const verdict = {
        duplicateRecognised: replay.outcome === "DUPLICATE",
        duplicateAcknowledged: Number(replay.transactionsForProviderId) === 1 && Number(replay.journalEntriesForThisPayment) === 1,
        tamperedDeliveryRefused: tamper.outcome === "REJECTED" && tamper.code === "DUPLICATE_CONFLICT",
        tamperedDeliveryEscalated: Array.isArray(tamper.exceptionsFromThisReplay) && (tamper.exceptionsFromThisReplay as unknown[]).length > 0,
        noSecondBooking: Number(after.transactions) === 1 && Number(after.entries) === 1 && Number(after.lines) === 2,
        amountUnchanged: String(after.gross) === String(PAYMENTS_AMOUNT_MINOR),
        postedStateIntact: after.accounting_status === "POSTED",
        inboxNotDuplicated: Number(after.inbox) === 1,
      };
      for (const [name, ok] of Object.entries(verdict)) {
        if (!ok) failures.push(`restored payment path check "${name}" failed: replay=${JSON.stringify(replay)} tamper=${JSON.stringify(tamper)} after=${JSON.stringify(after)}`);
      }
      payments = {
        tag: fixture.tag,
        postedKind: fixture.posting,
        restoreChecks: checks.map((c) => ({ name: c.name, ok: c.ok })),
        grants: roleSetup,
        replay,
        tamperedReplay: { outcome: tamper.outcome, code: tamper.code, exceptions: tamper.exceptionsFromThisReplay },
        afterReplay: after,
        verdict,
      };
      console.log(`[dr-drill] phase 5b — ${JSON.stringify(verdict)}`);
    }

    if (failures.length > 0) {
      console.error("[dr-drill] FAILED:\n  - " + failures.join("\n  - "));
      if (payments) console.error("[dr-drill] payments phase detail: " + JSON.stringify(payments));
      return 1;
    }
    if (payments) console.log(`[dr-drill] payments: ${JSON.stringify(payments)}`);
    console.log(
      `[dr-drill] PASSED: ${restoreTables.length} tables restored with count parity, ` +
        `RLS set preserved (${scratch.rlsTables.length} tables), enterprise-event chain intact, ` +
        `audit heads ${scratch.auditHeads}, service principals ${scratch.principals}`,
    );
    return 0;
  } finally {
    if (dst) await dst.end().catch(() => undefined);
    if (fixture && KEEP_SCRATCH) {
      console.log(`[dr-drill] payment fixture ${fixture.tag} kept for inspection (--keep-scratch)`);
    } else if (fixture && !KEEP_FIXTURE) {
      try {
        const mod = await import("./payments-dr-fixture");
        const cleanup = await mod.removePaymentFixture(fixture);
        console.log(`[dr-drill] payment fixture ${fixture.tag} removed: ${JSON.stringify(cleanup).slice(0, 400)}`);
      } catch (error) {
        console.error(`[dr-drill] PAYMENT FIXTURE NOT REMOVED — clean up ${fixture.tag} with: npx tsx scripts/payments-dr-fixture.ts --purge=${fixture.tag} ; ${(error as Error).message}`);
      }
    } else if (fixture) {
      console.log(`[dr-drill] payment fixture ${fixture.tag} kept (--payments-keep); remove it with: npx tsx scripts/payments-dr-fixture.ts --purge=${fixture.tag}`);
    }
    if (KEEP_SCRATCH) {
      console.log(`[dr-drill] phase 6 — SKIPPED (--keep-scratch): ${scratchDb} is left in place for inspection`);
      console.log(`[dr-drill]   inspect with BEYU_ADMIN_DATABASE_URL=${scratchUrl(scratchDb)}; drop with dropdb ${scratchDb}`);
    } else {
      console.log(`[dr-drill] phase 6 — destroy scratch database ${scratchDb}`);
      await src.query(`drop database if exists ${scratchDb}`).catch(() => undefined);
    }
    await src.end().catch(() => undefined);
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("[dr-drill] ERROR (could not run):", err instanceof Error ? err.message : err);
    process.exit(2);
  },
);

// Keep imports referenced for tooling that reorders (readFileSync not needed at runtime).
void readFileSync;
void readdirSync;
void join;
