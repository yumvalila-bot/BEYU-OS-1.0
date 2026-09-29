import Link from "next/link";
import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  federationAccessRequests,
  federationAuthorities,
  federationCapabilities,
  federationConnectors,
  federationConsents,
  federationServices,
} from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { tenantScopeIds, withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

const STATE_FIELDS = [
  "lifecycleStatus",
  "verificationStatus",
  "apiStatus",
  "govesbStatus",
  "accessCostStatus",
  "reconciliationState",
] as const;

type StateField = (typeof STATE_FIELDS)[number];

function Distribution({ field, rows }: { field: StateField; rows: Record<string, number> }) {
  return (
    <div>
      <div className="beyu-kicker beyu-muted">{field}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(rows)
          .sort((a, b) => b[1] - a[1])
          .map(([value, n]) => (
            <Badge key={value} tone={stateTone(value)}>
              {value} · {n}
            </Badge>
          ))}
        {Object.keys(rows).length === 0 && <span className="beyu-muted text-[12px]">—</span>}
      </div>
    </div>
  );
}

export default async function FederationPage(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requireAccess("federation:read");
  if (!access.allowed) {
    return <Denied reason={access.reason} capability="federation:read" />;
  }

  const sp = (await props.searchParams) ?? {};
  const asString = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const q = (asString(sp.q) ?? "").trim().toUpperCase();
  const domain = asString(sp.domain)?.toUpperCase();
  const scope = asString(sp.scope)?.toUpperCase();
  const verification = asString(sp.verification)?.toUpperCase();
  const apiStatus = asString(sp.api)?.toUpperCase();
  const govesb = asString(sp.govesb)?.toUpperCase();
  const cost = asString(sp.cost)?.toUpperCase();
  const recon = asString(sp.recon)?.toUpperCase();

  return withTenantDatabaseContext(access.principal, async () => {
    // The capability registry (authorities/services/capabilities/connectors)
    // is the shared global plane — one source of truth for every tenant.
    // Tenant scope applies to the governed per-tenant planes (consents,
    // access requests), which are RLS-scoped below.
    const tenantIds = await tenantScopeIds(access.principal);
    const [allStates, authorities, capabilities, serviceCount, connectorRows, consentCount, accessRequestCount] =
      await Promise.all([
        db
          .select({
            lifecycleStatus: federationAuthorities.lifecycleStatus,
            verificationStatus: federationAuthorities.verificationStatus,
            apiStatus: federationAuthorities.apiStatus,
            govesbStatus: federationAuthorities.govesbStatus,
            accessCostStatus: federationAuthorities.accessCostStatus,
            reconciliationState: federationAuthorities.reconciliationState,
            domainCode: federationAuthorities.domainCode,
            jurisdictionScope: federationAuthorities.jurisdictionScope,
          })
          .from(federationAuthorities),
        db
          .select()
          .from(federationAuthorities)
          .where(
            and(
              ...(q ? [like(sql`upper(${federationAuthorities.code} || ' ' || ${federationAuthorities.officialName})`, `%${q}%`)] : []),
              ...(domain ? [eq(federationAuthorities.domainCode, domain)] : []),
              ...(scope ? [eq(federationAuthorities.jurisdictionScope, scope)] : []),
              ...(verification ? [eq(federationAuthorities.verificationStatus, verification)] : []),
              ...(apiStatus ? [eq(federationAuthorities.apiStatus, apiStatus)] : []),
              ...(govesb ? [eq(federationAuthorities.govesbStatus, govesb)] : []),
              ...(cost ? [eq(federationAuthorities.accessCostStatus, cost)] : []),
              ...(recon ? [eq(federationAuthorities.reconciliationState, recon)] : []),
            ),
          )
          .orderBy(asc(federationAuthorities.jurisdictionCode), asc(federationAuthorities.code))
          .limit(80),
        db
          .select()
          .from(federationCapabilities)
          .where(eq(federationCapabilities.jurisdictionCode, "TZ"))
          .orderBy(asc(federationCapabilities.capabilityCode)),
        db.select({ n: sql<number>`count(*)` }).from(federationServices).limit(1),
        db.select().from(federationConnectors),
        db.select({ n: sql<number>`count(*)` }).from(federationConsents).where(inArray(federationConsents.tenantId, tenantIds)).limit(1),
        db
          .select({ n: sql<number>`count(*)` })
          .from(federationAccessRequests)
          .where(inArray(federationAccessRequests.tenantId, tenantIds))
          .limit(1),
      ]);

    const countBy = <K extends string>(pick: (row: (typeof allStates)[number]) => K | null): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const row of allStates) {
        const key = pick(row);
        if (key) out[key] = (out[key] ?? 0) + 1;
      }
      return out;
    };

    const total = allStates.length;
    const liveCount = allStates.filter((r) => ["LIVE", "LIVE_VERIFIED", "MONITORED"].includes(r.lifecycleStatus)).length;
    const freeConfirmed = allStates.filter((r) => r.accessCostStatus === "FREE_CONFIRMED").length;
    const sandboxOrLater = allStates.filter((r) =>
      ["SANDBOX", "SECURITY_TEST", "INTEROPERABILITY_TEST", "DATA_VALIDATION", "AUTHORITY_ACCEPTANCE", "PRODUCTION_APPROVAL", "LIVE", "LIVE_VERIFIED", "MONITORED"].includes(
        r.lifecycleStatus,
      ),
    ).length;
    const domainCodes = new Set(allStates.map((r) => r.domainCode).filter(Boolean) as string[]);
    const connectorByStatus = connectorRows.reduce<Record<string, number>>((acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1;
      return acc;
    }, {});

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Shared BEYU OS capability · Federation &amp; Trust</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Federation &amp; Trust</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Canonical cross-jurisdiction capability registry. Authority <em>status</em> is a registration and
            verification fact — it is never a connection claim. Every cost, agreement and GovESB label is stored
            separately and only moves when authoritative evidence exists; otherwise the system fails closed to
            UNKNOWN.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Registered authorities"
            value={String(total)}
            sub="registration/verification records — not connections"
            tone="gold"
          />
          <Metric label="Services registered" value={String(Number(serviceCount[0]?.n ?? 0))} sub="capability records per authority" />
          <Metric label="Capability domains" value={String(domainCodes.size)} sub="shared domain taxonomy" />
          <Metric
            label="Live / verified / monitored"
            value={String(liveCount)}
            sub="zero claims without live-operation evidence"
          />
          <Metric
            label="Sandbox-stage or later"
            value={String(sandboxOrLater)}
            sub="each stage requires its own recorded evidence"
          />
          <Metric
            label="FREE_CONFIRMED cost records"
            value={String(freeConfirmed)}
            sub="cost is never inferred — explicit evidence only"
          />
          <Metric
            label="Registered connectors"
            value={String(connectorRows.length)}
            sub={
              connectorRows.length === 0
                ? "none — connector wiring needs real credentials and evidence"
                : Object.entries(connectorByStatus)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(", ")
            }
          />
          <Metric
            label="Consents / access requests"
            value={`${Number(consentCount[0]?.n ?? 0)} / ${Number(accessRequestCount[0]?.n ?? 0)}`}
            sub="governed request-and-approve flow (SoD enforced)"
          />
        </div>

        <Panel
          kicker="Posture"
          title="Independent state dimensions"
          className="xl:col-span-2"
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Distribution field="lifecycleStatus" rows={countBy((r) => r.lifecycleStatus)} />
            <Distribution field="verificationStatus" rows={countBy((r) => r.verificationStatus)} />
            <Distribution field="apiStatus" rows={countBy((r) => r.apiStatus)} />
            <Distribution field="govesbStatus" rows={countBy((r) => r.govesbStatus)} />
            <Distribution field="accessCostStatus" rows={countBy((r) => r.accessCostStatus)} />
            <Distribution field="reconciliationState" rows={countBy((r) => r.reconciliationState)} />
          </div>
          <p className="mt-4 text-[11.5px] beyu-muted">
            Each dimension is stored and changed independently: an authority can be VERIFIED while its API status is
            UNTESTED and its GovESB requirement UNCONFIRMED. No single field is derived from another, and nothing
            here is self-certified.
          </p>
        </Panel>

        <Panel
          kicker="Canonical registry"
          title={`Authority inventory${q || domain || scope || verification || apiStatus || govesb || cost || recon ? " (filtered)" : ""}`}
          action={
            <span className="font-mono text-[10.5px] beyu-muted" title="Governed federation API (capability plane)">
              /api/v1/federation
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Authority</th>
                  <th>Domain</th>
                  <th>Scope</th>
                  <th>Verification</th>
                  <th>API</th>
                  <th>GovESB</th>
                  <th>Cost</th>
                  <th>Reconciliation</th>
                </tr>
              </thead>
              <tbody>
                {authorities.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="font-medium">{row.officialName}</div>
                      <div className="font-mono text-[10.5px] beyu-muted">
                        {row.jurisdictionCode}/{row.code}
                      </div>
                    </td>
                    <td className="text-[11.5px]">{row.domainCode}</td>
                    <td className="text-[11.5px]">{row.jurisdictionScope}</td>
                    <td>
                      <Badge tone={stateTone(row.verificationStatus)}>{row.verificationStatus}</Badge>
                    </td>
                    <td>
                      <Badge tone={stateTone(row.apiStatus)}>{row.apiStatus}</Badge>
                    </td>
                    <td>
                      <Badge tone={stateTone(row.govesbStatus)}>{row.govesbStatus}</Badge>
                    </td>
                    <td>
                      <Badge tone={stateTone(row.accessCostStatus)}>{row.accessCostStatus}</Badge>
                    </td>
                    <td>
                      <Badge tone={stateTone(row.reconciliationState)}>{row.reconciliationState}</Badge>
                    </td>
                  </tr>
                ))}
                {authorities.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState message="No authorities match the current filters within this tenant scope." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11.5px] beyu-muted">
            First 80 of {total} in scope. Filter via query params: q, domain, scope (COUNTRY|REGION|LGA),
            verification, api, govesb, cost, recon.
          </p>
        </Panel>

        <Panel kicker="Capability negotiation" title="Tanzania jurisdiction profile — capability availability">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>Availability</th>
                  <th>Cost status</th>
                  <th>Legal basis</th>
                  <th>Human approval</th>
                </tr>
              </thead>
              <tbody>
                {capabilities.map((row) => (
                  <tr key={row.capabilityCode}>
                    <td className="font-mono text-[11px]">{row.capabilityCode}</td>
                    <td>
                      <Badge tone={stateTone(row.availability)}>{row.availability}</Badge>
                    </td>
                    <td>
                      <Badge tone={stateTone(row.costStatus)}>{row.costStatus}</Badge>
                    </td>
                    <td className="text-[11.5px]">{row.legalBasisRef ?? "—"}</td>
                    <td>
                      <Badge tone={stateTone(row.requiresHumanApproval)}>{row.requiresHumanApproval}</Badge>
                    </td>
                  </tr>
                ))}
                {capabilities.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No capability rows registered for TZ." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11.5px] beyu-muted">
            Availability UNAVAILABLE/NOT_CONFIRMED means the transition engine will mark a cross-jurisdiction plan
            BLOCKED — it never fabricates availability for an unknown jurisdiction.
          </p>
        </Panel>

        <Panel kicker="Planes" title="Related governed surfaces">
          <div className="flex flex-wrap gap-4 text-[12px]">
            <Link href="/os/government-integrations" className="font-medium underline underline-offset-2 hover:text-[#a8830f] dark:hover:text-[#efd98f]">
              Government Integrations — submission plane (filing/ledger)
            </Link>
            <span className="font-mono text-[11px] beyu-muted">/api/v1/federation — governed federation API (capability plane)</span>
          </div>
          <p className="mt-3 text-[11.5px] beyu-muted">
            One identity surface, two planes: this page is the capability registry (what exists, what is verified,
            what it may cost); Government Integrations is the governed submission gateway. They share no state —
            each row and each status is independently evidenced.
          </p>
        </Panel>
      </div>
    );
  });
}
