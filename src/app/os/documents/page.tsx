import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, knowledgeSources, regulatoryChanges, retentionPolicies } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { classificationRank } from "@/lib/constants";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const access = await requireAccess("documents:registry.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="documents:registry.read" />;

  const [docs, knowledge, retention, changes] = await Promise.all([
    db.select().from(documents).where(eq(documents.tenantId, access.principal.tenantId)),
    db.select().from(knowledgeSources),
    db.select().from(retentionPolicies),
    db.select().from(regulatoryChanges),
  ]);

  const visible = docs.filter(
    (d) => classificationRank(d.classification) <= classificationRank(access.principal.clearance),
  );
  const suppressed = docs.length - visible.length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Document & attachment registry · knowledge governance</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Evidence, provenance & retention</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          Every uploaded artefact is registered with version, checksum, provenance, authority status,
          effective dating, supersession, retention, legal hold and access policy.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Registered documents" value={String(visible.length)} sub={suppressed ? `${suppressed} suppressed by clearance` : "all visible at your clearance"} />
        <Metric label="Authoritative" value={String(visible.filter((d) => d.authorityStatus === "AUTHORITATIVE").length)} sub="approved & in force" />
        <Metric label="Legal holds" value={String(visible.filter((d) => d.legalHold).length)} sub="disposal suspended" tone="gold" />
        <Metric label="Knowledge sources" value={String(knowledge.length)} sub={`${knowledge.filter((k) => k.reviewDate < today).length} past review date`} />
      </div>

      <Panel kicker="Attachment registry" title="Documents with full metadata">
        <div className="overflow-x-auto">
          <table className="beyu-table">
            <thead>
              <tr>
                <th>File</th><th>Category</th><th>Version</th><th>Scope / jurisdiction</th><th>Authority</th>
                <th>Class</th><th>Checksum</th><th>Retention</th><th>Approved</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => (
                <tr key={d.id}>
                  <td><div className="font-medium">{d.fileName}</div><div className="max-w-md text-[11px] beyu-muted">{d.description}</div></td>
                  <td><Badge tone="navy">{d.category}</Badge></td>
                  <td className="text-[11.5px]">v{d.version}<div className="beyu-muted">{d.source}</div></td>
                  <td className="text-[11.5px]">{d.entityScope ?? "group"}{d.jurisdictionCode ? ` · ${d.jurisdictionCode}` : ""}<div className="beyu-muted">eff. {d.effectiveDate ?? "—"}</div></td>
                  <td><Badge tone={stateTone(d.authorityStatus)}>{d.authorityStatus}</Badge>{d.legalHold && <div className="mt-1"><Badge tone="red">LEGAL HOLD</Badge></div>}</td>
                  <td><Badge tone={stateTone(d.classification)}>{d.classification}</Badge></td>
                  <td className="font-mono text-[10px] beyu-muted">{d.checksum.slice(0, 14)}…</td>
                  <td className="text-[11.5px]">{d.retentionCode}</td>
                  <td className="text-[11px] beyu-muted">{d.approvedBy ?? "unapproved"}<div>{d.approvedAt ? new Date(d.approvedAt).toISOString().slice(0, 10) : ""}</div></td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={9}><EmptyState message="No documents visible at your clearance." /></td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel kicker="Knowledge governance" title="Authoritative knowledge with review windows">
          <div className="space-y-3">
            {knowledge.map((k) => (
              <div key={k.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold">{k.title}</span>
                  <div className="flex gap-1">
                    <Badge tone={stateTone(k.authorityStatus)}>{k.authorityStatus}</Badge>
                    <Badge tone={k.reviewDate < today ? "red" : "slate"}>review {k.reviewDate}</Badge>
                  </div>
                </div>
                <div className="mt-1 text-[11.5px]">{k.content}</div>
                <div className="mt-1 text-[10.5px] beyu-muted">
                  {k.code} · v{k.version} · owner {k.ownerRole}{k.jurisdictionCode ? ` · ${k.jurisdictionCode}` : ""} · {k.provenance}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] beyu-muted">Outdated knowledge does not silently remain authoritative — Noelia only retrieves in-force sources.</p>
        </Panel>

        <div className="space-y-5">
          <Panel kicker="Record retention" title="Retention schedule by record type & jurisdiction">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Code</th><th>Record type</th><th>Jurisdiction</th><th>Years</th><th>Legal basis</th></tr></thead>
                <tbody>
                  {retention.map((r) => (
                    <tr key={r.code}>
                      <td className="font-mono text-[11px]">{r.code}</td>
                      <td className="text-[11.5px]">{r.recordType}</td>
                      <td className="text-[11.5px]">{r.jurisdictionCode}</td>
                      <td className="tabular-nums">{r.retentionYears}</td>
                      <td className="text-[11px] beyu-muted">{r.legalBasis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel kicker="Regulatory change management" title="Detected changes awaiting governed adoption">
            <div className="space-y-2">
              {changes.map((c) => (
                <div key={c.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold">{c.title}</span>
                    <Badge tone={c.assessmentStatus === "DETECTED" ? "amber" : "navy"}>{c.assessmentStatus}</Badge>
                  </div>
                  <div className="mt-1 text-[11.5px]">{c.summary}</div>
                  <div className="mt-1 text-[10.5px] beyu-muted">
                    {c.jurisdictionCode} · {c.reference} · published {c.publishedOn}
                    {c.effectiveFrom ? ` · effective ${c.effectiveFrom}` : ""} · owner {c.ownerRole}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] beyu-muted">
              An external legal source never becomes binding BEYU policy without governance approval.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
