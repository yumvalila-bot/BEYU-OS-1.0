import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Panel } from "@/components/brand";
import { db } from "@/db";
import { communicationContacts, communicationContactMethods } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const principal = await requirePrincipal();
  return withTenantDatabaseContext(principal, async () => {
    const contacts = await db
      .select()
      .from(communicationContacts)
      .where(eq(communicationContacts.tenantId, principal.tenantId))
      .orderBy(desc(communicationContacts.updatedAt))
      .limit(50);

    const methods = await db
      .select()
      .from(communicationContactMethods)
      .where(eq(communicationContactMethods.tenantId, principal.tenantId))
      .limit(100);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Communications · Contacts 360°</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Contact / Recipient 360°</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Authorized communication 360° view. A contact may have GlobalUserID, phone, WhatsApp, email, in-app, internal, organization, customer/supplier/employee/family relationship, tenant/entity relationships, language, preferences, consent, verified status. Do NOT create another identity system — use canonical identity. Identity resolution is explicit, auditable, tenant-aware, entity-aware, country-aware, authorization-aware. Phone/email are endpoints, not identities.
          </p>
        </header>

        <Panel kicker="Contacts" title="Recipient 360° — Tenant Isolated">
          <div className="space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className="rounded border border-[color:var(--beyu-line)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={c.verified ? "gold" : "slate"}>{c.verified ? "VERIFIED" : "UNVERIFIED"}</Badge>
                    <span className="font-semibold text-[13px]">{c.displayName}</span>
                    <Badge tone="slate">{c.status}</Badge>
                    {c.globalUserId && <Badge tone="navy">GlobalUserID:{c.globalUserId.slice(0, 8)}</Badge>}
                  </div>
                  <span className="text-[10.5px] beyu-muted">{c.preferredLanguage} · {c.timezone} · {c.preferredChannel ?? "no pref"} · {c.classification}</span>
                </div>
                <div className="mt-1 text-[11px] beyu-muted">
                  {c.primaryPhone && <span className="mr-3">📞 {c.primaryPhone}</span>}
                  {c.primaryEmail && <span className="mr-3">✉️ {c.primaryEmail}</span>}
                  {c.organizationName && <span className="mr-3">🏢 {c.organizationName}</span>}
                  {c.relationshipType && <span>🔗 {c.relationshipType}</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {methods
                    .filter((m) => m.contactId === c.id)
                    .map((m) => (
                      <Badge key={m.id} tone={m.verified ? "gold" : "slate"}>
                        {m.methodType}:{m.value} {m.isPrimary ? "(primary)" : ""}
                      </Badge>
                    ))}
                </div>
              </div>
            ))}
            {contacts.length === 0 && <p className="text-[12px] beyu-muted">No contacts in tenant scope. Create via POST /api/v1/communications/contacts</p>}
          </div>
        </Panel>
      </div>
    );
  });
}
