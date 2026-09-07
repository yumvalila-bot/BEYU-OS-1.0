/**
 * Removal of **demonstration and test fixtures** from the payment tables.
 *
 * Why this module exists at all: the payment history is append-only by design
 * (drizzle/0028 hardening), and `removeSandboxDemoFixture()` in
 * `payments/config-write` correctly refuses to delete configuration while
 * transactions still reference it. That is the right answer for any real tenant.
 * It leaves a sandbox demonstration unable to clean up after itself in a shared
 * development database — and a leftover chart-of-accounts row there contradicts a
 * canonical Finance OS finding (`tests/finance/accounting-substrate-boundary.test.ts`
 * reports that the platform has no chart of accounts). A demonstration must not
 * rewrite reality; it has to leave no trace.
 *
 * So this is the sanctioned escape hatch, modelled exactly on
 * `tests/helpers/ledger-reset.ts`: explicit, narrow, and self-restoring.
 *   - the caller must supply an exact confirm token;
 *   - only prefixes that look like run tags are accepted (no wildcards, no
 *     caller-controlled SQL fragments);
 *   - only rows recorded against the in-process mock provider are in scope, and
 *     any row that does not match is a refusal, not a silent exclusion;
 *   - the immutability triggers are disabled for the duration and re-enabled in a
 *     `finally`, then verified enabled;
 *   - the removal itself is written to the audit log, because an operator action
 *     that erases rows had better leave a row saying so.
 *
 * Application code paths (routes, ingest, accounting) never call this. It is for
 * the demonstration script and the test suites, which are the only things that
 * create the rows it removes.
 */
import { adminPool } from "@/db/admin";
import { appendPaymentAudit } from "./audit-scope";
import { assertPrivilegedWriter, ConfigWriteError } from "./config-write";

export const FIXTURE_RESET_CONFIRM_TOKEN = "RESET-SANDBOX-PAYMENT-FIXTURE";
export const FIXTURE_RESET_VERSION = "payment-fixture-reset-1.0.0";

/** The provider whose sandbox rows are the only ones this module can ever touch. */
const DEMO_PROVIDER = "MOCK_SANDBOX";
const TAG_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;

/**
 * Tables whose *user* triggers refuse deletion. These are the guards that must be
 * bypassed for a fixture to be removable at all.
 */
const GUARDED_TABLES = [
  "payment_transactions",
  "payment_transaction_states",
  "payment_webhook_events",
  "payment_matches",
  "journal_lines",
  "journal_entries",
] as const;

/**
 * Every child table that can reference a row this reset deletes, and the parent it
 * references. The list is not documentation: `assertCoveredForeignKeys` compares it
 * against pg_constraint on every run and refuses if a new referencing table has been
 * added, because an unreferenced child is how a fixture reset ends up leaving orphans.
 * (This happened: `payment_risk_signals` was not covered, `ALTER TABLE … DISABLE
 * TRIGGER ALL` switched foreign-key enforcement off along with the immutability
 * triggers, and 21 orphan signals were left in the development database.)
 */
const FK_CHILDREN: Record<"payment_transactions" | "journal_entries", readonly string[]> = {
  payment_transactions: [
    "payment_transaction_states",
    "payment_matches",
    "payment_exceptions",
    "payment_settlement_items",
    "payment_risk_signals",
    "payment_corrections",
  ],
  journal_entries: ["journal_lines", "payment_settlements", "payment_corrections", "payment_transactions"],
};

export type FixtureResetReport = {
  ok: boolean;
  refused?: string;
  prefixes: string[];
  removed?: Partial<
    Record<
      | "webhookEvents"
      | "transactions"
      | "states"
      | "exceptions"
      | "matches"
      | "settlements"
      | "settlementItems"
      | "journalLines"
      | "journalEntries"
      | "riskSignals"
      | "corrections",
      number
    >
  >;
  guardsEnabledAfter?: boolean;
};

/**
 * Delete every row created under the given run-tag prefixes by the sandbox mock
 * provider. Returns a per-table count so a caller can prove the database is back
 * to the state it found, rather than asking the reader to trust the word "done".
 */
export async function removeDemoPaymentRows(input: { prefixes: readonly string[]; confirm: string }): Promise<FixtureResetReport> {
  if (input.confirm !== FIXTURE_RESET_CONFIRM_TOKEN) {
    return { ok: false, refused: `confirm must be exactly "${FIXTURE_RESET_CONFIRM_TOKEN}"; nothing was removed`, prefixes: [...input.prefixes] };
  }
  const prefixes = [...new Set(input.prefixes.map((p) => p.trim().toUpperCase()))];
  if (prefixes.length === 0) return { ok: false, refused: "at least one run tag prefix is required", prefixes };
  for (const prefix of prefixes) {
    if (!TAG_PATTERN.test(prefix)) {
      return { ok: false, refused: `run tag "${prefix}" is not an exact tag (letters, digits, dash, underscore; 2-32 characters, no wildcards)`, prefixes };
    }
  }

  // Every predicate below is built from the same two fragments: a parameterised
  // `like $n` list over the accepted tags, and the fixed provider scope. No tag
  // text is ever concatenated into SQL.
  const params = prefixes.map((prefix) => `${prefix}%`);
  const like = (column: string, offset = 0) => prefixes.map((_, i) => `${column} like $${i + 1 + offset}`).join(" or ");
  const txScope = `t.provider_code = '${DEMO_PROVIDER}' and (${like("t.provider_transaction_id")})`;

  // Refuse before touching anything if a non-mock row is in scope, or a journal
  // entry in scope was not posted by the payments bridge. This path is for demo
  // fixtures; if it would reach further, that is a signal to stop, not to filter.
  const outside = await adminPool.query(
    `select
       (select count(*)::int from public.payment_transactions t
         where (${like("t.provider_transaction_id")}) and t.provider_code <> '${DEMO_PROVIDER}') as foreign_provider,
       (select count(*)::int from public.journal_entries e
         where e.source <> 'PAYMENTS'
           and e.reference in (select 'PAY/' || t.id from public.payment_transactions t
                                where (${like("t.provider_transaction_id")}) and t.provider_code = '${DEMO_PROVIDER}')) as foreign_entry,
       (select count(*)::int from public.payment_transactions t
         where (${like("t.provider_transaction_id")}) and t.accounting_status = 'POSTED') as posted_rows`,
    params,
  );
  const [blocker] = outside.rows as { foreign_provider: number; foreign_entry: number; posted_rows: number }[];
  if (Number(blocker.foreign_provider) > 0) {
    return { ok: false, refused: "the tag matches transactions recorded against a provider other than the sandbox mock; refusing", prefixes };
  }
  if (Number(blocker.foreign_entry) > 0) {
    return { ok: false, refused: "a matching journal entry was not posted by the payments bridge; refusing", prefixes };
  }

  // A POSTED payment has a real ledger entry behind it. Removing it is a
  // correction, not a cleanup, and corrections belong to a governed decision
  // (reversal) — never to a fixture utility.
  if (Number(blocker.posted_rows) > 0) {
    return {
      ok: false,
      refused: `${blocker.posted_rows} matching transaction(s) are POSTED to the ledger. Unposting is a reversal decision, not a fixture cleanup; refusing.`,
      prefixes,
    };
  }

  const writer = await assertPrivilegedWriter().catch((e: unknown) => {
    throw e instanceof ConfigWriteError ? e : new Error(`fixture reset requires the privileged writer identity: ${(e as Error).message}`);
  });

  const removed: FixtureResetReport["removed"] = {};
  const debug = process.env.BEYU_FIXTURE_RESET_DEBUG === "1";

  // The user triggers that make these rows undeletable are skipped by running the
  // whole reset with session_replication_role = replica. That has a second effect
  // which is the reason this function is written the way it is: **foreign-key
  // triggers are skipped too**, measured on PostgreSQL rather than assumed. So every
  // child row that points at a row being deleted has to be deleted here, in this
  // order, or the reset quietly corrupts the database. Measured consequence of not
  // doing that: 21 orphan payment_risk_signals rows in the development database.
  const txIds = `select t.id from public.payment_transactions t where ${txScope}`;

  // Refuse before touching anything if the covering list has fallen behind reality: a
  // new child table that references these parents must be handled here, not orphaned.
  const covering = await adminPool.query(
    `select con.conrelid::regclass::text as child, con.confrelid::regclass::text as parent
       from pg_constraint con
      where con.contype = 'f'
        and con.confrelid in ('public.payment_transactions'::regclass, 'public.journal_entries'::regclass)`,
  );
  const unknown = (covering.rows as { child: string; parent: string }[]).filter((row) => {
    const child = row.child.replace(/^public\./, "");
    const parent = row.parent.replace(/^public\./, "");
    return !(FK_CHILDREN[parent as keyof typeof FK_CHILDREN] ?? []).includes(child);
  });
  if (unknown.length > 0) {
    return {
      ok: false,
      refused: `foreign keys from ${unknown.map((u) => `${u.child} -> ${u.parent}`).join(", ")} are not covered by this reset; extending FK_CHILDREN is required before rows can be removed`,
      prefixes,
    };
  }

  const client = await adminPool.connect();
  try {
    const run = async (label: keyof NonNullable<FixtureResetReport["removed"]>, statement: string) => {
      if (debug) console.error(`[fixture-reset] ${label}: ${statement.replace(/\s+/g, " ")}`);
      const result = await client.query(statement, params);
      removed[label] = (result.rowCount ?? 0) + (removed[label] ?? 0);
    };
    await client.query("begin");
    await client.query("set local session_replication_role = replica");

    // Order matters: children before parents. journal_entries is referenced by
    // payment_transactions, so the transaction rows go before the entry rows.
    const entryIds = `select e.id from public.journal_entries e where e.reference in (select 'PAY/' || t.id from public.payment_transactions t where ${txScope})`;
    await run("journalLines", `delete from public.journal_lines l where l.entry_id in (${entryIds})`);
    await run(
      "settlementItems",
      `delete from public.payment_settlement_items i where i.settlement_id in (
         select s.id from public.payment_settlements s
          where s.provider_code = '${DEMO_PROVIDER}' and (${like("s.provider_settlement_id")}))`,
    );
    await run("settlements", `delete from public.payment_settlements s where s.provider_code = '${DEMO_PROVIDER}' and (${like("s.provider_settlement_id")})`);
    await run(
      "corrections",
      `delete from public.payment_corrections c
        where c.original_transaction_id in (${txIds})
           or c.replacement_transaction_id in (${txIds})
           or c.journal_entry_id in (${entryIds})`,
    );
    await run("matches", `delete from public.payment_matches m where m.transaction_id in (${txIds})`);
    await run("states", `delete from public.payment_transaction_states st where st.transaction_id in (${txIds})`);
    await run("riskSignals", `delete from public.payment_risk_signals r where r.transaction_id in (${txIds})`);
    await run(
      "exceptions",
      `delete from public.payment_exceptions x where
         x.transaction_id in (${txIds})
         or (x.transaction_id is null and x.correlation_id in (
               select w.correlation_id from public.payment_webhook_events w
                where w.provider_code = '${DEMO_PROVIDER}' and (${like("w.provider_event_id")})))`,
    );
    await run("transactions", `delete from public.payment_transactions t where ${txScope}`);
    await run("journalEntries", `delete from public.journal_entries e where e.id in (${entryIds})`);
    await run(
      "webhookEvents",
      `delete from public.payment_webhook_events w where w.provider_code = '${DEMO_PROVIDER}' and (
           ${like("w.provider_event_id")}
           or w.correlation_id in (select w2.correlation_id from public.payment_webhook_events w2
                                     where w2.provider_code = '${DEMO_PROVIDER}' and (${like("w2.provider_event_id")}))
           -- A rejected delivery whose body carried no provider event id gets a digest-derived
           -- id and no tag, so tag matching alone can never remove it and the demo configuration
           -- would be unremovable forever. A rejected inbox row with no transaction behind it,
           -- on a sandbox-environment connection, is fixture noise by construction — not money.
           or (w.transaction_id is null
               and w.processing_state = 'REJECTED'
               and w.connection_id in (select c.id from public.payment_provider_connections c
                                        where c.provider_code = '${DEMO_PROVIDER}' and c.environment = 'SANDBOX')))`,
    );

    // Integrity before commitment: if anything still points at a row that no longer
    // exists, the reset is rolled back rather than reported as a success.
    const orphans = await client.query(
      `select
         (select count(*)::int from public.payment_transaction_states x where x.transaction_id is not null and not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)) as states,
         (select count(*)::int from public.payment_matches x where x.transaction_id is not null and not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)) as matches,
         (select count(*)::int from public.payment_exceptions x where x.transaction_id is not null and not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)) as exceptions,
         (select count(*)::int from public.payment_risk_signals x where x.transaction_id is not null and not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)) as signals,
         (select count(*)::int from public.payment_settlement_items x where x.transaction_id is not null and not exists (select 1 from public.payment_transactions t where t.id = x.transaction_id)) as items,
         (select count(*)::int from public.payment_corrections x where x.original_transaction_id is not null and not exists (select 1 from public.payment_transactions t where t.id = x.original_transaction_id)) as corrections,
         (select count(*)::int from public.journal_lines x where not exists (select 1 from public.journal_entries e where e.id = x.entry_id)) as lines,
         (select count(*)::int from public.payment_transactions x where x.journal_entry_id is not null and not exists (select 1 from public.journal_entries e where e.id = x.journal_entry_id)) as links`);
    const [orphanRow] = orphans.rows as Record<string, number>[];
    const dangling = Object.entries(orphanRow ?? {}).filter(([, n]) => Number(n) > 0);
    if (dangling.length > 0) {
      throw new Error(`[fixture-reset] aborting: the reset would leave dangling references (${dangling.map(([k, n]) => `${k}=${n}`).join(" ")}); nothing was removed`);
    }
    await client.query("commit");
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* the connection is dropped by release() below; the transaction is not committed */
    }
    throw error;
  } finally {
    try {
      await client.release();
    } catch {
      /* already released */
    }
  }

  const guards = await adminPool.query(
    `select count(*)::int as total, (count(*) filter (where t.tgenabled = 'O'))::int as enabled
       from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in (${GUARDED_TABLES.map((_, i) => `$${i + 1}`).join(", ")}) and not t.tgisinternal`,
    [...GUARDED_TABLES],
  );
  const [guardRow] = guards.rows as { total: number; enabled: number }[];
  const guardsEnabledAfter = Number(guardRow.total) > 0 && Number(guardRow.total) === Number(guardRow.enabled);

  await appendPaymentAudit({
    actorType: "SERVICE",
    action: "PAYMENT_FIXTURE_ROWS_REMOVED",
    objectType: "payment_fixture_reset",
    objectId: prefixes.join(","),
    outcome: guardsEnabledAfter ? "SUCCESS" : "FAILURE",
    reason: `sandbox fixture rows removed by ${writer.databaseUser} for run tags ${prefixes.join(", ")}; ${Object.entries(removed ?? {}).map(([k, v]) => `${k}=${v}`).join(" ")}; immutability guards verified ${guardsEnabledAfter ? "enabled" : "NOT ENABLED"}`,
    authority: FIXTURE_RESET_VERSION,
    newValue: { prefixes, removed, guardsEnabledAfter },
  });

  if (!guardsEnabledAfter) {
    throw new Error(
      `[fixture-reset] rows were removed but the immutability guards on ${GUARDED_TABLES.join(", ")} are not all enabled (${guardRow.enabled}/${guardRow.total}) — restore them before continuing`,
    );
  }
  return { ok: true, prefixes, removed, guardsEnabledAfter };
}

/** Which run tags are currently present in the database as demo rows (operator aid). */
export async function listDemoFixtureTags(limit = 20): Promise<{ tag: string; transactions: number; events: number }[]> {
  const result = await adminPool.query(
    `with txns as (
       select split_part(provider_transaction_id, '-', 1) as tag, count(*)::int as transactions
         from public.payment_transactions where provider_code = $1 group by 1
     ), events as (
       select split_part(provider_event_id, '-', 1) as tag, count(*)::int as events
         from public.payment_webhook_events where provider_code = $1 group by 1
     )
     select coalesce(t.tag, e.tag) as tag, coalesce(t.transactions, 0)::int as transactions, coalesce(e.events, 0)::int as events
       from txns t full outer join events e on e.tag = t.tag
      order by 1
      limit $2`,
    [DEMO_PROVIDER, limit],
  );
  return (result.rows as { tag: string; transactions: number; events: number }[]).map((r) => ({ tag: r.tag, transactions: Number(r.transactions), events: Number(r.events) }));
}
