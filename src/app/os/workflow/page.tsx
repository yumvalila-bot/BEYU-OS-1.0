import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { noeliaWorkflows, tasks, workflowInstances, workflows } from "@/db/schema";
import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { can } from "@/lib/authz";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * Workflow — governed execution as a first-class shared capability.
 *
 * The kernel already owns TWO governed workflow planes:
 *   1. enterprise workflows (governance.workflows / workflow_instances /
 *      tasks) — approvals and tasks already summarised on the control centre
 *      under platform:dashboard.read, so that same capability gates them here;
 *   2. HIVE agentic workflows (platform.noelia_workflows + steps) — Noelia
 *      plans that execute tools ONLY through policy gates with a recorded
 *      human authorization, gated by ai:workflow.run / ai:workflow.approve.
 *
 * Page access mirrors that model exactly: the union of those capabilities.
 * A principal with none of them receives the governed denial; a principal
 * with some sees only the sections their grants cover. This page is
 * read-only: running, authorizing or cancelling a workflow remains a governed
 * API mutation with its own re-verification (`ai:workflow.run` /
 * `ai:workflow.approve` at the route boundary — the UI never decides).
 */
export default async function WorkflowPage() {
  const principal = await requirePrincipal();
  const canRunHive = can(principal, "ai:workflow.run").allowed;
  const canApproveHive = can(principal, "ai:workflow.approve").allowed;
  const caps = {
    enterprise: can(principal, "platform:dashboard.read").allowed,
    hive: canRunHive || canApproveHive,
  };
  if (!caps.enterprise && !caps.hive) {
    return (
      <Denied
        reason="Workflow requires a dashboard, workflow-run or workflow-approval capability; none is granted to your roles."
        capability="platform:dashboard.read · ai:workflow.run · ai:workflow.approve"
      />
    );
  }
  return withTenantDatabaseContext(principal, async () => {

    const scope = await tenantScopeIds(principal);
    const entityScoped = principal.entityScope.length > 0;
    const hivePredicate = canApproveHive
      ? inArray(noeliaWorkflows.tenantId, scope)
      : and(
          inArray(noeliaWorkflows.tenantId, scope),
          eq(noeliaWorkflows.requestedBy, principal.userId),
        );

    const [definitions, instances, openTasks, hiveRows] = await Promise.all([
      caps.enterprise
        ? db.select().from(workflows).orderBy(workflows.code)
        : Promise.resolve([] as (typeof workflows.$inferSelect)[]),
      caps.enterprise && !entityScoped
        ? db
            .select({
              id: workflowInstances.id,
              state: workflowInstances.state,
              currentStep: workflowInstances.currentStep,
              objectType: workflowInstances.objectType,
              startedBy: workflowInstances.startedBy,
              startedAt: workflowInstances.startedAt,
              slaDueAt: workflowInstances.slaDueAt,
              completedAt: workflowInstances.completedAt,
              workflowName: workflows.name,
              workflowCode: workflows.code,
            })
            .from(workflowInstances)
            .leftJoin(workflows, eq(workflows.id, workflowInstances.workflowId))
            .where(inArray(workflowInstances.tenantId, scope))
            .orderBy(desc(workflowInstances.startedAt))
            .limit(30)
        : Promise.resolve([]),
      caps.enterprise && !entityScoped
        ? db
            .select()
            .from(tasks)
            .where(and(inArray(tasks.tenantId, scope), sql`${tasks.status} <> 'DONE'`))
            .orderBy(tasks.dueAt)
            .limit(30)
        : Promise.resolve([] as (typeof tasks.$inferSelect)[]),
      caps.hive && !entityScoped
        ? db
            .select()
            .from(noeliaWorkflows)
            .where(hivePredicate)
            .orderBy(desc(noeliaWorkflows.createdAt))
            .limit(20)
        : Promise.resolve([] as (typeof noeliaWorkflows.$inferSelect)[]),
    ]);

    const running = instances.filter((i) => i.state === "RUNNING" || i.state === "WAITING");
    const hiveActive = hiveRows.filter((w) => !["COMPLETED", "FAILED", "CANCELLED", "STOPPED", "TIMED_OUT"].includes(w.status));
    const awaitingApproval = hiveRows.filter((w) => ["PLANNED", "VALIDATED", "ESCALATED"].includes(w.status));

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Workflow · governed execution</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Approvals, tasks &amp; agentic workflows</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            One workflow capability inside BEYU OS — never a Workflow OS. Enterprise approval chains run
            to SLA with escalation; Noelia&rsquo;s HIVE workflows execute tools only through policy gates
            and stop for recorded human authorization before consequential steps.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Workflow definitions" value={caps.enterprise ? String(definitions.length) : "Restricted"} sub={caps.enterprise ? "active governed processes" : "platform:dashboard.read not granted"} />
          <Metric label="Live instances" value={caps.enterprise && !entityScoped ? String(running.length) : "Restricted"} sub={!caps.enterprise ? "platform:dashboard.read not granted" : entityScoped ? "rows have no legal-entity key; tenant-wide read refused" : `${instances.length} recent in scope`} />
          <Metric label="Open tasks" value={caps.enterprise && !entityScoped ? String(openTasks.length) : "Restricted"} sub={!caps.enterprise ? "platform:dashboard.read not granted" : entityScoped ? "rows have no legal-entity key; tenant-wide read refused" : `${openTasks.filter((t) => t.priority === "HIGH").length} high priority`} tone={caps.enterprise && !entityScoped && openTasks.some((t) => t.priority === "HIGH") ? "gold" : "navy"} />
          <Metric label="HIVE workflows" value={caps.hive && !entityScoped ? String(hiveRows.length) : "Restricted"} sub={!caps.hive ? "ai:workflow.run / ai:workflow.approve not granted" : entityScoped ? "rows have no legal-entity key; tenant-wide read refused" : `${awaitingApproval.length} awaiting human authorization`} tone={caps.hive && !entityScoped && awaitingApproval.length > 0 ? "gold" : "navy"} />
        </div>

        {caps.enterprise && (
          <>
            <div className="grid gap-5 xl:grid-cols-2">
              <Panel kicker="Process catalogue" title="Workflow definitions">
                <div className="space-y-2">
                  {definitions.map((w) => (
                    <div key={w.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[12.5px] font-semibold">{w.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge tone="navy">{w.domain}</Badge>
                          <Badge tone={stateTone(w.status)}>{w.status}</Badge>
                        </div>
                      </div>
                      <div className="mt-1 text-[10.5px] beyu-muted">
                        {w.code} · v{w.version} · {w.definition.length} steps
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {w.definition.map((s) => (
                          <span key={s.step} className="rounded border border-[color:var(--beyu-line)] px-1.5 py-[2px] text-[9.5px] tracking-wide">
                            {s.step}. {s.name} · {s.type} · {s.role} · {s.slaHours}h
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {definitions.length === 0 && <EmptyState message="No workflow definitions registered." />}
                </div>
              </Panel>

              <Panel kicker="In flight" title="Live instances — SLA-tracked">
                <div className="space-y-2">
                  {running.map((i) => (
                    <div key={i.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[12px] font-medium">{i.workflowName ?? i.workflowCode ?? "workflow"}</span>
                        <Badge tone={stateTone(i.state)}>{i.state}</Badge>
                      </div>
                      <div className="mt-1 text-[11px] beyu-muted">
                        step {i.currentStep} · on {i.objectType} · started by {i.startedBy} · {i.startedAt.toISOString().slice(0, 10)}
                        {i.slaDueAt ? ` · SLA ${i.slaDueAt.toISOString().slice(0, 10)}` : ""}
                      </div>
                    </div>
                  ))}
                  {running.length === 0 && <EmptyState message={entityScoped ? "Workflow-instance rows have no legal-entity key, so tenant-wide execution history was refused." : "No instances are currently running or waiting in scope."} />}
                </div>
                {instances.some((i) => i.completedAt) && (
                  <p className="mt-3 text-[11px] beyu-muted">
                    {instances.filter((i) => i.completedAt).length} completed recently — full history in the audit ledger.
                  </p>
                )}
              </Panel>
            </div>

            <Panel kicker="Human accountability" title="Approvals & tasks — only a human with authority can close these">
              <div className="overflow-x-auto">
                <table className="beyu-table">
                  <thead><tr><th>Task</th><th>Assignee</th><th>Priority</th><th>Due</th><th>Escalation</th><th>Status</th></tr></thead>
                  <tbody>
                    {openTasks.map((t) => (
                      <tr key={t.id}>
                        <td><div className="font-medium">{t.title}</div>{t.description && <div className="max-w-md text-[11px] beyu-muted">{t.description}</div>}</td>
                        <td className="text-[11.5px]">{t.assigneeRole ?? "—"}</td>
                        <td><Badge tone={t.priority === "HIGH" ? "red" : "slate"}>{t.priority}</Badge></td>
                        <td className="text-[11.5px] beyu-muted">{t.dueAt ? t.dueAt.toISOString().slice(0, 10) : "—"}</td>
                        <td className="tabular-nums text-[11.5px]">{t.escalationLevel > 0 ? `level ${t.escalationLevel}` : "—"}</td>
                        <td><Badge tone={t.status === "ESCALATED" ? "red" : "slate"}>{t.status}</Badge></td>
                      </tr>
                    ))}
                    {openTasks.length === 0 && <tr><td colSpan={6}><EmptyState message={entityScoped ? "Task rows have no legal-entity key, so the tenant-wide queue was refused." : "No open approvals or tasks are visible in scope."} /></td></tr>}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}

        {!caps.enterprise && (
          <Panel kicker="Enterprise workflows" title="Restricted">
            <EmptyState message="platform:dashboard.read is not granted to your roles — enterprise workflow definitions, instances and tasks are withheld." />
          </Panel>
        )}

        {caps.hive ? (
          <Panel kicker="Noelia · HIVE runtime" title="Governed agentic workflows — human authorization is constitutional, not optional">
            <div className="space-y-2">
              {hiveRows.map((w) => (
                <div key={w.id} className="rounded-lg border border-[color:var(--beyu-line)] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="max-w-2xl text-[12.5px] font-medium">{w.goal}</span>
                    <div className="flex items-center gap-2">
                      <Badge tone="navy">{w.executingAi}</Badge>
                      <Badge tone={stateTone(w.status)}>{w.status}</Badge>
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] beyu-muted">
                    step {w.currentStep}/{w.plan.length || w.maxSteps} · requested by {w.requestedBy} · trace {w.traceId.slice(0, 16)}…
                    {w.approvingHumanId ? ` · authorized by a recorded human (${w.approvingHumanId.slice(0, 12)}…)` : " · no human authorization recorded yet"}
                  </div>
                  <div className="mt-0.5 text-[10.5px] beyu-muted">
                    created {w.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    {w.startedAt ? ` · started ${w.startedAt.toISOString().slice(0, 16).replace("T", " ")}` : ""}
                    {w.completedAt ? ` · completed ${w.completedAt.toISOString().slice(0, 16).replace("T", " ")}` : ""}
                    {w.cancellationRequested ? " · cancellation requested" : ""}
                  </div>
                  {w.plan.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {w.plan.slice(0, 6).map((s) => (
                        <span key={s.step} className="rounded border border-[color:var(--beyu-line)] px-1.5 py-[2px] text-[9.5px] tracking-wide">
                          {s.step}. {s.toolName}
                        </span>
                      ))}
                      {w.plan.length > 6 && <span className="text-[10px] beyu-muted">+{w.plan.length - 6} more</span>}
                    </div>
                  )}
                </div>
              ))}
              {hiveRows.length === 0 && (
                <EmptyState message={entityScoped ? "HIVE workflow rows have no legal-entity key, so tenant-wide plans and goals were refused." : "No HIVE workflows are visible in scope. Run-only principals see their own requests; approvers see the governed tenant queue."} />
              )}
            </div>
            <p className="mt-3 text-[11px] beyu-muted">
              Execution, authorization, validation and cancellation stay server-side under ai:workflow.run
              and ai:workflow.approve — Noelia never approves her own consequential actions.
            </p>
          </Panel>
        ) : (
          <Panel kicker="Noelia · HIVE runtime" title="Restricted">
            <EmptyState message="ai:workflow.run or ai:workflow.approve is not granted to your roles — governed agentic workflows are withheld." />
          </Panel>
        )}
      </div>
    );
  });
}
