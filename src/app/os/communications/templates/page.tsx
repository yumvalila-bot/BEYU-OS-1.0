import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Panel } from "@/components/brand";
import { db } from "@/db";
import { communicationTemplates } from "@/db/schema";
import { or, isNull, eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const principal = await requirePrincipal();
  return withTenantDatabaseContext(principal, async () => {
    const templates = await db
      .select()
      .from(communicationTemplates)
      .where(or(eq(communicationTemplates.tenantId, principal.tenantId), isNull(communicationTemplates.tenantId)))
      .orderBy(desc(communicationTemplates.updatedAt))
      .limit(50);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Communications · Templates</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Template Engine</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Versioned, approved, localized, country-aware, channel-specific, message-type-aware, variable-driven, previewable, test-renderable, classified. Provider-specific requirements respected (WhatsApp template approval). Tanzania (sw, TZ, TZS, +255) is configuration/data, not hard-coded engine logic.
          </p>
        </header>

        <Panel kicker="Templates" title="Versioned, Localized, Approved">
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="rounded border border-[color:var(--beyu-line)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={t.status === "APPROVED" ? "gold" : t.status === "DRAFT" ? "slate" : "red"}>{t.status}</Badge>
                    <Badge tone="slate">{t.channel}</Badge>
                    <Badge tone="slate">{t.category}</Badge>
                    <span className="font-semibold text-[13px]">{t.code} v{t.version}</span>
                    <span className="text-[11.5px] beyu-muted">{t.name} · {t.language}{t.countryCode ? ` · ${t.countryCode}` : ""}</span>
                  </div>
                  <span className="text-[10.5px] beyu-muted">{t.classification} · {t.createdAt.toISOString().slice(0, 10)}</span>
                </div>
                {t.subjectTemplate && <p className="mt-1 text-[11.5px] font-semibold">Subject: {t.subjectTemplate}</p>}
                <p className="mt-1 text-[11.5px] beyu-muted line-clamp-3">{t.bodyTemplate.slice(0, 300)}</p>
                <div className="mt-1 text-[10px] beyu-muted">Vars: {t.variables.join(", ") || "none"} · Required: {t.requiredVariables.join(", ") || "none"} · Provider: {t.providerTemplateId ?? "none"}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    );
  });
}
