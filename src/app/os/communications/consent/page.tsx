import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Panel } from "@/components/brand";
import { db } from "@/db";
import { communicationConsents, communicationPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ConsentPage() {
  const principal = await requirePrincipal();
  return withTenantDatabaseContext(principal, async () => {
    const consents = await db.select().from(communicationConsents).where(eq(communicationConsents.tenantId, principal.tenantId)).limit(50);
    const prefs = await db.select().from(communicationPreferences).where(eq(communicationPreferences.tenantId, principal.tenantId)).limit(50);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Communications · Consent & Preferences</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Consent & Preferences</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            TRANSACTIONAL, OPERATIONAL, SECURITY, MARKETING, RESEARCH, FEEDBACK — purpose-gated. Channels: WHATSAPP, SMS, EMAIL, IN_APP, INTERNAL, REPORTS, INVOICES, ALERTS, MARKETING. Marketing must never be sent without appropriate consent. Preserve opt-in, opt-out, revocation, timestamp, source, purpose, evidence. Reuses existing consent architecture where applicable.
          </p>
        </header>

        <Panel kicker="Consent" title="Purpose & Channel Consent — Marketing Requires OPT_IN">
          <div className="space-y-2">
            {consents.map((c) => (
              <div key={c.id} className="rounded border border-[color:var(--beyu-line)] px-4 py-2 text-[12px]">
                <div className="flex items-center gap-2">
                  <Badge tone={c.status === "OPT_IN" ? "gold" : "red"}>{c.status}</Badge>
                  <Badge tone="slate">{c.purpose}</Badge>
                  <Badge tone="slate">{c.channel}</Badge>
                  <span className="beyu-muted">contact {c.contactId.slice(0, 8)} · source {c.source} · {c.consentedAt.toISOString().slice(0, 10)}</span>
                </div>
              </div>
            ))}
            {consents.length === 0 && <p className="text-[12px] beyu-muted">No consent records in tenant scope.</p>}
          </div>
        </Panel>

        <Panel kicker="Preferences" title="Channel Preferences">
          <div className="space-y-2">
            {prefs.map((p) => (
              <div key={p.id} className="rounded border border-[color:var(--beyu-line)] px-4 py-2 text-[12px]">
                <div className="flex items-center gap-2">
                  <Badge tone={p.enabled ? "gold" : "slate"}>{p.enabled ? "ENABLED" : "DISABLED"}</Badge>
                  <Badge tone="slate">{p.channel}</Badge>
                  <span className="beyu-muted">contact {p.contactId.slice(0, 8)} · prio {p.priority} · {p.language} · {p.frequency}</span>
                </div>
              </div>
            ))}
            {prefs.length === 0 && <p className="text-[12px] beyu-muted">No preferences in tenant scope.</p>}
          </div>
        </Panel>
      </div>
    );
  });
}
