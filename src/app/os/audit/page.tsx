import { desc, inArray, or, isNull, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiDecisions, auditLog, enterpriseEvents } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds, hasGlobalGovernanceScope } from "@/lib/tenant-scope";
import { verifyAuditChain } from "@/lib/audit";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { SelfTestPanel } from "./self-test";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const access = await requireAccess("audit:log.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="audit:log.read" />;
  return withTenantDatabaseContext(access.principal, async () => {

  const scope = await tenantScopeIds(access.principal);
  const global = hasGlobalGovernanceScope(access.principal);
  const [entries, events, ai, chain] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(global ? or(inArray(auditLog.tenantId, scope), isNull(auditLog.tenantId)) : inArray(auditLog.tenantId, scope))
      .orderBy(desc(auditLog.sequence))
      .limit(60),
    db
      .select()
      .from(enterpriseEvents)
      .where(global ? or(inArray(enterpriseEvents.tenantId, scope), isNull(enterpriseEvents.tenantId)) : inArray(enterpriseEvents.tenantId, scope))
      .orderBy(desc(enterpriseEvents.sequence))
      .limit(40),
    db.select().from(aiDecisions).where(inArray(aiDecisions.tenantId, scope)).orderBy(desc(aiDecisions.occurredAt)).limit(20),
    verifyAuditChain(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Audit · events · AI accountability · assurance</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Immutable enterprise record</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          Append-only, hash-chained ledgers. Any retro-active mutation breaks the chain and is detected by
          the verification routine below. No component may alter audit history.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Chain integrity" value={chain.verified ? "VERIFIED" : "BROKEN"} sub={`${chain.records} records re-hashed`} tone={chain.verified ? "navy" : "gold"} />
        <Metric label="Audit entries (recent)" value={String(entries.length)} sub="who · what · when · authority" />
        <Metric label="Enterprise events" value={String(events.length)} sub="CloudEvents-aligned, versioned" />
        <Metric label="AI decisions recorded" value={String(ai.length)} sub={`${ai.filter((a) => a.humanReviewRequired && !a.reviewedBy).length} awaiting human review`} />
      </div>

      <SelfTestPanel />

      <Panel kicker="Audit ledger" title="Append-only record of material actions">
        <div className="overflow-x-auto">
          <table className="beyu-table">
            <thead>
              <tr><th>#</th><th>When</th><th>Actor</th><th>Action</th><th>Object</th><th>Outcome</th><th>Authority / policy</th><th>Hash</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="tabular-nums text-[11px] beyu-muted">{e.sequence}</td>
                  <td className="text-[11px] beyu-muted">{new Date(e.occurredAt).toISOString().replace("T", " ").slice(0, 19)}</td>
                  <td className="text-[11.5px]">{e.actorUserId ?? "system"}<div><Badge tone={e.actorType === "AI" ? "amber" : "slate"}>{e.actorType}</Badge></div></td>
                  <td className="font-mono text-[11px]">{e.action}</td>
                  <td className="text-[11px]">{e.objectType}<div className="beyu-muted">{e.objectId.slice(0, 26)}</div></td>
                  <td><Badge tone={e.outcome === "SUCCESS" ? "green" : "red"}>{e.outcome}</Badge>{e.reason && <div className="mt-0.5 max-w-xs text-[10.5px] beyu-muted">{e.reason}</div>}</td>
                  <td className="text-[10.5px] beyu-muted">{e.authority ?? "—"}<div>{e.policyVersion ?? ""}</div><div>{e.systemVersion}{e.aiVersion ? ` · ${e.aiVersion}` : ""}</div></td>
                  <td className="font-mono text-[10px] beyu-muted">{e.hash.slice(0, 12)}…</td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={8}><EmptyState message="No audit entries yet." /></td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel kicker="Enterprise event stream" title="Immutable, versioned, authorised">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>#</th><th>Type</th><th>Subject</th><th>Class</th><th>When</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="tabular-nums text-[11px] beyu-muted">{e.sequence}</td>
                    <td className="font-mono text-[11px]">{e.type}<div className="beyu-muted">v{e.schemaVersion} · {e.source}</div></td>
                    <td className="text-[11px]">{e.subjectType}<div className="beyu-muted">{e.subjectId.slice(0, 24)}</div></td>
                    <td><Badge tone={stateTone(e.classification)}>{e.classification}</Badge></td>
                    <td className="text-[11px] beyu-muted">{new Date(e.occurredAt).toISOString().replace("T", " ").slice(0, 19)}</td>
                  </tr>
                ))}
                {events.length === 0 && <tr><td colSpan={5}><EmptyState message="No events published yet." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Auditable AI" title="Noelia decision register (HIVE runtime)">
          <div className="space-y-2">
            {ai.map((a) => (
              <div key={a.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] font-medium">{a.question.slice(0, 90)}</span>
                  <div className="flex gap-1">
                    <Badge tone="navy">{a.engine}</Badge>
                    <Badge tone={stateTone(a.outputClass)}>{a.outputClass}</Badge>
                    {a.humanReviewRequired && <Badge tone={a.reviewedBy ? "green" : "amber"}>{a.reviewedBy ? "REVIEWED" : "REVIEW PENDING"}</Badge>}
                  </div>
                </div>
                <div className="mt-1 text-[10.5px] beyu-muted">
                  {a.model}@{a.modelVersion} · {a.promptVersion} · confidence {(Number(a.confidence) * 100).toFixed(0)}% ·
                  policy {a.policyDecision} · {a.latencyMs}ms · tools {(a.toolsUsed ?? []).join(", ") || "none"}
                </div>
                {(a.retrievedSources ?? []).length > 0 && (
                  <div className="mt-1 text-[10.5px] beyu-muted">
                    sources: {(a.retrievedSources ?? []).map((s) => `${s.kind}:${s.ref}`).join(" · ")}
                  </div>
                )}
                {(a.deniedScopes ?? []).length > 0 && (
                  <div className="mt-1 text-[10.5px] text-rose-600 dark:text-rose-300">denied scopes: {(a.deniedScopes ?? []).join(", ")}</div>
                )}
              </div>
            ))}
            {ai.length === 0 && <EmptyState message="No AI decisions recorded for this tenant." />}
          </div>
        </Panel>
      </div>
    </div>
  );  });
}
