import { desc, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  modelRegistry,
  noeliaAiIdentity,
  noeliaAiRequirements,
  noeliaEvaluations,
  noeliaIncidents,
  noeliaKillSwitch,
  noeliaProviders,
  noeliaRiskRegister,
} from "@/db/schema";
import { can } from "@/lib/authz";
import { requirePrincipal } from "@/lib/guard";
import { tenantScopeIds, withTenantDatabaseContext } from "@/lib/tenant-scope";
import type { PermissionCode } from "@/lib/constants";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

const GOVERNANCE_READ_PERMISSIONS: PermissionCode[] = [
  "ai:model.registry.read",
  "ai:provider.registry.read",
  "ai:identity.read",
  "ai:evaluation.read",
  "ai:risk.register.read",
  "ai:compliance.read",
  "ai:compliance.metrics",
  "ai:incident.manage",
  "ai:killswitch.manage",
];

export default async function NoeliaGovernancePage() {
  const principal = await requirePrincipal();
  const permitted = (permission: PermissionCode) => can(principal, permission).allowed;
  if (!GOVERNANCE_READ_PERMISSIONS.some(permitted)) {
    return <Denied reason="No Noelia governance read capability is authorized" capability="ai:model.registry.read" />;
  }

  return withTenantDatabaseContext(principal, async () => {
    const tenantIds = await tenantScopeIds(principal);
    const capabilities = {
      identity: permitted("ai:identity.read"),
      models: permitted("ai:model.registry.read"),
      providers: permitted("ai:provider.registry.read"),
      evaluations: permitted("ai:evaluation.read"),
      risk: permitted("ai:risk.register.read"),
      compliance: permitted("ai:compliance.read") || permitted("ai:compliance.metrics"),
      incidents: permitted("ai:incident.manage") && principal.entityScope.length === 0,
      killSwitch: permitted("ai:killswitch.manage") && principal.entityScope.length === 0,
    };

    const [identities, models, providers, evaluations, risks, requirements, incidents, killSwitches] =
      await Promise.all([
        capabilities.identity ? db.select().from(noeliaAiIdentity).orderBy(noeliaAiIdentity.canonicalName) : Promise.resolve([]),
        capabilities.models ? db.select().from(modelRegistry).orderBy(modelRegistry.provider, modelRegistry.model).limit(100) : Promise.resolve([]),
        capabilities.providers ? db.select().from(noeliaProviders).orderBy(noeliaProviders.providerName).limit(100) : Promise.resolve([]),
        capabilities.evaluations ? db.select().from(noeliaEvaluations).orderBy(desc(noeliaEvaluations.createdAt)).limit(100) : Promise.resolve([]),
        capabilities.risk ? db.select().from(noeliaRiskRegister).orderBy(noeliaRiskRegister.riskCode).limit(100) : Promise.resolve([]),
        capabilities.compliance ? db.select().from(noeliaAiRequirements).orderBy(noeliaAiRequirements.requirementCode).limit(100) : Promise.resolve([]),
        capabilities.incidents
          ? db.select().from(noeliaIncidents).where(or(isNull(noeliaIncidents.tenantId), inArray(noeliaIncidents.tenantId, tenantIds))).orderBy(desc(noeliaIncidents.detectedAt)).limit(100)
          : Promise.resolve([]),
        capabilities.killSwitch
          ? db.select().from(noeliaKillSwitch).where(or(isNull(noeliaKillSwitch.tenantId), inArray(noeliaKillSwitch.tenantId, tenantIds))).orderBy(desc(noeliaKillSwitch.activatedAt)).limit(100)
          : Promise.resolve([]),
      ]);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Noelia / HIVE · Governance</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">AI Governance & Assurance</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Permission-partitioned identity, model, provider, evaluation, risk, compliance, incident and kill-switch
            evidence. A registry row never authorizes a model or provider by itself, and certification is never self-declared.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {capabilities.identity && <Metric label="AI identities" value={String(identities.length)} sub="canonical identities" tone="gold" />}
          {capabilities.models && <Metric label="Models" value={String(models.length)} sub="governed registry records" />}
          {capabilities.providers && <Metric label="Providers" value={String(providers.length)} sub={`${providers.filter((row) => row.active).length} marked active`} />}
          {capabilities.evaluations && <Metric label="Evaluations" value={String(evaluations.length)} sub={`${evaluations.filter((row) => row.status === "FAILED").length} failed`} />}
          {capabilities.risk && <Metric label="Open AI risks" value={String(risks.filter((row) => row.status === "OPEN").length)} sub="acceptance remains human-controlled" />}
          {capabilities.compliance && <Metric label="Requirements" value={String(requirements.length)} sub="framework obligations" />}
          {capabilities.incidents && <Metric label="Open incidents" value={String(incidents.filter((row) => row.status === "OPEN").length)} sub="append-only containment trail" />}
          {capabilities.killSwitch && <Metric label="Active kill switches" value={String(killSwitches.filter((row) => row.enabled && !row.deactivatedAt).length)} sub="stops capability; deletes no evidence" />}
        </div>

        {(capabilities.identity || capabilities.models || capabilities.providers) && (
          <div className="grid gap-5 xl:grid-cols-2">
            {capabilities.models && <Panel kicker="Model registry" title="Governed models">
              <div className="overflow-x-auto"><table className="beyu-table">
                <thead><tr><th>Model</th><th>Provider</th><th>Lifecycle</th><th>Approval</th><th>Evaluation</th><th>Maximum class</th></tr></thead>
                <tbody>
                  {models.map((row) => <tr key={row.id}>
                    <td><div className="font-medium">{row.model}</div><div className="font-mono text-[10px] beyu-muted">{row.version}</div></td>
                    <td className="text-[11.5px]">{row.provider}</td>
                    <td><Badge tone={stateTone(row.lifecycleStatus)}>{row.lifecycleStatus}</Badge></td>
                    <td><Badge tone={stateTone(row.approvalStatus)}>{row.approvalStatus}</Badge></td>
                    <td><Badge tone={stateTone(row.evaluationStatus)}>{row.evaluationStatus}</Badge></td>
                    <td><Badge tone="slate">{row.maxClassification}</Badge></td>
                  </tr>)}
                  {models.length === 0 && <tr><td colSpan={6}><EmptyState message="No model registry records are available." /></td></tr>}
                </tbody>
              </table></div>
            </Panel>}

            {capabilities.providers && <Panel kicker="Provider registry" title="Governed providers">
              <div className="overflow-x-auto"><table className="beyu-table">
                <thead><tr><th>Provider</th><th>Type</th><th>Lifecycle</th><th>Security</th><th>Compliance</th><th>Active</th></tr></thead>
                <tbody>
                  {providers.map((row) => <tr key={row.id}>
                    <td className="font-medium">{row.providerName}</td>
                    <td className="text-[11.5px]">{row.providerType}</td>
                    <td><Badge tone={stateTone(row.lifecycleStatus)}>{row.lifecycleStatus}</Badge></td>
                    <td><Badge tone={stateTone(row.securityStatus)}>{row.securityStatus}</Badge></td>
                    <td><Badge tone={stateTone(row.complianceStatus)}>{row.complianceStatus}</Badge></td>
                    <td><Badge tone={row.active ? "green" : "slate"}>{row.active ? "YES" : "NO"}</Badge></td>
                  </tr>)}
                  {providers.length === 0 && <tr><td colSpan={6}><EmptyState message="No provider registry records are available." /></td></tr>}
                </tbody>
              </table></div>
            </Panel>}

            {capabilities.identity && <Panel kicker="Canonical identity" title="Noelia identities">
              <div className="space-y-2">
                {identities.map((row) => <article key={row.id} className="rounded-lg border border-[color:var(--beyu-line)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-[13px]">{row.canonicalName}</strong><Badge tone={stateTone(row.status)}>{row.status}</Badge></div>
                  <div className="mt-1 text-[11px] beyu-muted">{row.identityType} · version {row.version} · risk {row.riskLevel}</div>
                </article>)}
                {identities.length === 0 && <EmptyState message="No canonical AI identity is registered." />}
              </div>
            </Panel>}
          </div>
        )}

        {(capabilities.risk || capabilities.compliance) && <div className="grid gap-5 xl:grid-cols-2">
          {capabilities.risk && <Panel kicker="AI risk" title="Risk register">
            <div className="space-y-2">{risks.slice(0, 20).map((row) => <article key={row.id} className="rounded-lg border border-[color:var(--beyu-line)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-[12.5px]">{row.riskCode} · {row.title}</strong><Badge tone={stateTone(row.status)}>{row.status}</Badge></div>
              <div className="mt-1 text-[11px] beyu-muted">{row.category} · residual {row.residualLikelihood}/{row.residualImpact}</div>
            </article>)}{risks.length === 0 && <EmptyState message="No AI risks are registered." />}</div>
          </Panel>}
          {capabilities.compliance && <Panel kicker="AI compliance" title="Requirements">
            <div className="space-y-2">{requirements.slice(0, 20).map((row) => <article key={row.id} className="rounded-lg border border-[color:var(--beyu-line)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-[12.5px]">{row.requirementCode} · {row.title}</strong><Badge tone={stateTone(row.status)}>{row.status}</Badge></div>
              <div className="mt-1 text-[11px] beyu-muted">{row.frameworkId} · {row.category} · priority {row.priority}</div>
            </article>)}{requirements.length === 0 && <EmptyState message="No AI compliance requirements are registered." />}</div>
          </Panel>}
        </div>}
      </div>
    );
  });
}
