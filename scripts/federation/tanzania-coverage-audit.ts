/**
 * BEYU Federation & Trust — Tanzania coverage & public-access audit
 * (program §95–97 deliverables).
 *
 * Repeatable, deterministic and evidence-first:
 *   1. SEED CONSISTENCY — name-level reconciliation of the seeded registry
 *      against the seed inventory using the shared reconciliation engine
 *      (proves the seed landed intact; every row must be MATCH).
 *   2. BASELINE RECONCILIATION — the documented go.tz directory baseline
 *      (325 MDA / 26 regions / 126 LGAs, COUNTS ONLY — live fetch was not
 *      possible in the build environment) is compared to the registered
 *      inventory. Deltas land as MANUAL_REVIEW — never as MATCH — because
 *      a name-level official extract is not available.
 *   3. COVERAGE AUDIT — buildCoverageAudit over the registered inventory.
 *   4. PUBLIC-ACCESS REPORT — what is publicly accessible vs protected,
 *      and the explicit zero-claims (LIVE / FREE_CONFIRMED / GOVESB_LIVE).
 *
 * Outputs:
 *   docs/federation/tanzania-coverage-report.md
 *   docs/federation/tanzania-public-access-report.md
 *
 * PREREQUISITES
 *   BEYU_ADMIN_DATABASE_URL (or DATABASE_URL) — admin DSN.
 *
 * USAGE
 *   npx tsx scripts/federation/tanzania-coverage-audit.ts
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { adminDb, adminPool } from "../../src/db/admin";
import {
  federationAccessRequests,
  federationAuthorities,
  federationCapabilities,
  federationConsents,
  federationConnectors,
  federationDomains,
  federationEvidence,
  federationLegalBases,
  federationServices,
  federationVerifications,
} from "../../src/db/schema";
import {
  TZ_AUTHORITIES,
  TZ_DIRECTORY_BASELINE,
  TZ_DIRECTORY_SOURCE,
  TZ_LGAS,
  TZ_REGIONS,
  toLgaRow,
  toNationalAuthorityRow,
  toRegionRow,
} from "../../src/db/federation-data";
import {
  buildCoverageAudit,
  renderCoverageMarkdown,
  reconcile,
  summarizeReconciliation,
  type CandidateRecord,
  type CoverageRow,
  type RegistryRecord,
} from "../../src/lib/federation";

interface CountRow {
  n: string;
}

async function count(q: Promise<CountRow[]>): Promise<number> {
  const [row] = await q;
  return Number(row?.n ?? 0);
}

async function main(): Promise<void> {
  const now = new Date().toISOString();

  /* ------------------------------------------------------------------ */
  /* 1. Registry load                                                     */
  /* ------------------------------------------------------------------ */
  const [authorities, services, capabilities, domains, legalBases, connectors, evidenceRows, verifications, consents, accessRequests] =
    await Promise.all([
      adminDb.select().from(federationAuthorities).where(eq(federationAuthorities.jurisdictionCode, "TZ")),
      adminDb.select().from(federationServices),
      adminDb.select().from(federationCapabilities).where(eq(federationCapabilities.jurisdictionCode, "TZ")),
      adminDb.select().from(federationDomains).where(eq(federationDomains.jurisdictionCode, "TZ")),
      adminDb.select().from(federationLegalBases).where(eq(federationLegalBases.jurisdictionCode, "TZ")),
      adminDb.select().from(federationConnectors),
      adminDb.select().from(federationEvidence),
      adminDb.select().from(federationVerifications),
      adminDb.select().from(federationConsents),
      adminDb.select().from(federationAccessRequests),
    ]);

  const byScope = (scope: string) => authorities.filter((a) => a.jurisdictionScope === scope);
  const national = byScope("NATIONAL");
  const regional = byScope("REGIONAL");
  const local = byScope("LOCAL");
  const international = byScope("INTERNATIONAL");

  /* ------------------------------------------------------------------ */
  /* 2. Seed consistency reconciliation (name-level, shared engine)       */
  /* ------------------------------------------------------------------ */
  const seedCandidates: CandidateRecord[] = [
    ...TZ_AUTHORITIES.map((s) => {
      const row = toNationalAuthorityRow(s);
      return { code: row.code, name: row.officialName, source: "TZ seed inventory (program §15–46)", sourceVersion: "seed-2026-09-28" };
    }),
    ...TZ_REGIONS.map((s) => {
      const row = toRegionRow(s);
      return { code: row.code, name: row.officialName, source: "TZ seed inventory (program §15–46)", sourceVersion: "seed-2026-09-28" };
    }),
    ...TZ_LGAS.map((s) => {
      const row = toLgaRow(s);
      return { code: row.code, name: row.officialName, source: "TZ seed inventory (program §15–46)", sourceVersion: "seed-2026-09-28" };
    }),
  ];
  const registryRecords: RegistryRecord[] = authorities.map((a) => ({
    id: a.id,
    code: a.code,
    officialName: a.officialName,
    shortName: a.shortName,
    recordStatus: a.recordStatus,
    reconciliationState: a.reconciliationState,
  }));
  const seedResults = reconcile(seedCandidates, registryRecords);
  const seedSummary = summarizeReconciliation(seedResults);

  /* ------------------------------------------------------------------ */
  /* 3. Documented baseline reconciliation (count-level only)             */
  /* ------------------------------------------------------------------ */
  const baselineRows: { label: string; documented: number; registered: number; detail: string }[] = [
    {
      label: "Ministries / Departments / Agencies (national)",
      documented: TZ_DIRECTORY_BASELINE.mdas,
      registered: national.length,
      detail:
        national.length > TZ_DIRECTORY_BASELINE.mdas
          ? "Registry includes parent ministries with statutory agencies listed individually and international bodies (EAC/SADC); name-level official extract required to resolve."
          : "Registry is below the documented baseline — name-level official extract required to identify the gap.",
    },
    {
      label: "Mainland regions",
      documented: TZ_DIRECTORY_BASELINE.regions,
      registered: TZ_REGIONS.filter((r) => !r.zanzibar).length,
      detail: "Mainland regions only; the 5 Zanzibar regions are registered separately as federal-interface authorities (total regional rows in registry: 31).",
    },
    {
      label: "Local government authorities (districts / municipal / city)",
      documented: TZ_DIRECTORY_BASELINE.lgas,
      registered: local.length,
      detail:
        "Documented 126 figure is UNVERIFIED — public sources conflict (158–184 depending on year and Zanzibar treatment). Registered inventory is best-effort with placeholder rows for regions whose district composition could not be confirmed; all flagged PENDING_RECONCILIATION.",
    },
  ];
  const baselineStates = baselineRows.map((r) => ({
    ...r,
    delta: r.registered - r.documented,
    state: r.registered === r.documented ? "MANUAL_REVIEW" : "MANUAL_REVIEW",
    stateNote: "Count-level only. Name-level reconciliation against the official go.tz directory extract is PENDING — this run has no live snapshot (no outbound connectivity in the build environment) and does NOT claim MATCH.",
  }));

  /* ------------------------------------------------------------------ */
  /* 4. Coverage audit                                                     */
  /* ------------------------------------------------------------------ */
  const coverageRows: CoverageRow[] = authorities.map((a) => ({
    code: a.code,
    officialName: a.officialName,
    domainCode: a.domainCode,
    authorityType: a.authorityType,
    jurisdictionScope: a.jurisdictionScope,
    recordStatus: a.recordStatus,
    lifecycleStatus: a.lifecycleStatus,
    verificationStatus: a.verificationStatus,
    apiStatus: a.apiStatus,
    govesbStatus: a.govesbStatus,
    accessCostStatus: a.accessCostStatus,
    reconciliationState: a.reconciliationState,
    legacyAgencyCode: a.legacyAgencyCode,
    agreementRequired: a.agreementRequired === "TRUE" || a.agreementRequired === "FALSE" ? a.agreementRequired : "UNKNOWN",
  }));
  const audit = buildCoverageAudit(
    "TZ",
    coverageRows,
    {
      mdasExpected: TZ_DIRECTORY_BASELINE.mdas,
      regionsExpected: TZ_DIRECTORY_BASELINE.regions,
      lgasExpected: TZ_DIRECTORY_BASELINE.lgas,
      sourceName: TZ_DIRECTORY_SOURCE,
      sourceVersion: "baseline-2026-09-28",
      capturedAt: "2026-09-28T00:00:00.000Z",
      liveVerified: false,
    },
    domains.map((d) => d.code),
  );
  const coverageMarkdown = renderCoverageMarkdown(audit);

  /* ------------------------------------------------------------------ */
  /* 5. Public-access report                                              */
  /* ------------------------------------------------------------------ */
  const countOf = (rows: { accessCostStatus: string }[]) => {
    const out: Record<string, number> = {};
    for (const r of rows) out[r.accessCostStatus] = (out[r.accessCostStatus] ?? 0) + 1;
    return out;
  };
  const serviceClassification: Record<string, number> = {};
  const serviceAccessLevel: Record<string, number> = {};
  for (const s of services) {
    serviceClassification[s.dataClassification] = (serviceClassification[s.dataClassification] ?? 0) + 1;
    serviceAccessLevel[s.accessLevel] = (serviceAccessLevel[s.accessLevel] ?? 0) + 1;
  }
  const authorityCost = countOf(authorities);
  const serviceCost = countOf(services);
  const verifiedLive = authorities.filter((a) => ["LIVE", "LIVE_VERIFIED", "MONITORED"].includes(a.lifecycleStatus)).length;
  const freeConfirmed = authorityCost.FREE_CONFIRMED ?? 0;
  const govesbLive = authorities.filter((a) => a.govesbStatus === "GOVESB_LIVE" || a.govesbStatus === "GOVESB_LIVE_VERIFIED").length;

  const fmt = (m: Record<string, number>) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");

  const publicAccessMarkdown = `# BEYU OS — Tanzania Public-Access Report

- Generated: ${now}
- Source: seeded federation registry (0071) + documented go.tz directory baseline
- Basis: registration/verification state only. **No live connectivity, no verified access, no fabricated cost or GovESB compliance.**

## Zero-claims (evidence-gated — currently true)

| Claim | Count | Gate |
|---|---|---|
| Authorities LIVE / LIVE_VERIFIED / MONITORED | ${verifiedLive} | live-operation evidence required (assertLifecycleMove) |
| FREE_CONFIRMED cost records | ${freeConfirmed} | explicit authoritative evidence only (federation_authorities_free_gate CHECK) |
| GOVESB_LIVE / GOVESB_LIVE_VERIFIED | ${govesbLive} | real GovESB interface evidence required |
| Registered connectors | ${connectors.length} | connectors only with real credentials + evidence (none seeded) |
| Verifications at LIVE or above | ${verifications.filter((v) => ["LIVE", "LIVE_VERIFIED"].includes(v.level)).length} | federation_verifications_evidence_gate CHECK |

## Service data classification (${services.length} services)

${fmt(serviceClassification) || "—"}

## Service access level

${fmt(serviceAccessLevel) || "—"}

## Authority access-cost state

${fmt(authorityCost) || "—"}

## Service access-cost state

${fmt(serviceCost) || "—"}

## Interpretation

- PUBLIC rows are **public-information** registrations (classification PUBLIC / access
  level NOT_CONNECTED) — they describe what the authority publishes, not what BEYU can
  read. Nothing is connected.
- PROTECTED / UNVERIFIED classification and PROTECTED_DATA access levels mean the data
  is subject to consent, legal-basis and purpose-limitation gates before any future
  access request can be approved.
- UNKNOWN_COST is the honest default: cost is never inferred from "free website" or
  similar, and FREE_CONFIRMED requires recorded authoritative evidence.
`;

  const coverageReport = `# BEYU OS — Tanzania Federation Coverage Report

- Generated: ${now}
- Jurisdiction: TZ (Tanzania) — first profile of the shared BEYU Federation & Trust capability
- ${TZ_DIRECTORY_SOURCE}
- ${TZ_DIRECTORY_BASELINE.note}

## Registry totals

| Item | Count |
|---|---|
| Authorities registered (all scopes) | ${authorities.length} |
| — national (NATIONAL scope) | ${national.length} |
| — regional (REGIONAL scope, incl. 5 Zanzibar federal-interface) | ${regional.length} |
| — local government (LOCAL scope) | ${local.length} |
| — international (INTERNATIONAL scope: EAC/SADC) | ${international.length} |
| Services registered | ${services.length} |
| Capability domains | ${domains.length} |
| Legal bases registered | ${legalBases.length} |
| Capabilities (TZ profile) | ${capabilities.length} |
| Evidence records | ${evidenceRows.length} |
| Verifications | ${verifications.length} |
| Consents (all tenants) | ${consents.length} |
| Access requests (all tenants) | ${accessRequests.length} |
| Connectors | ${connectors.length} |

## Seed consistency (name-level reconciliation, shared engine)

${Object.entries(seedSummary)
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join("\n") || "—"}

${seedSummary.MISSING === 0 && seedSummary.NEW === 0 ? "Seed inventory and registry are consistent (all MATCH)." : "**Inconsistency detected — inspect above.**"}

## Documented baseline reconciliation (count-level only)

| Item | Documented baseline | Registered | Delta | State |
|---|---|---|---|---|
${baselineStates.map((r) => `| ${r.label} | ${r.documented} | ${r.registered} | ${r.delta >= 0 ? "+" : ""}${r.delta} | ${r.state} |`).join("\n")}

> ${baselineStates[0].stateNote}
>
> LGAs detail: ${baselineRows[2].detail}

## Coverage audit

${coverageMarkdown}

## Standing limitations

1. **No live directory fetch** — the 325/26/126 baseline is documented, not fetched; name-level reconciliation is PENDING until an official extract is available with authorization.
2. **No connectors** — zero live government connectors exist; every authority remains at registration/verification stage (CLASSIFIED).
3. **No cost or GovESB claims** — UNKNOWN_COST / GOVESB_* fail-closed states until authoritative evidence is recorded.
4. **Zanzibar** — 5 Zanzibar regions are registered as federal-interface authorities; jurisdiction over Zanzibar administration is not claimed by the mainland registry.
`;

  const outDir = path.resolve(process.cwd(), "docs/federation");
  mkdirSync(outDir, { recursive: true });
  const coveragePath = path.join(outDir, "tanzania-coverage-report.md");
  const accessPath = path.join(outDir, "tanzania-public-access-report.md");
  writeFileSync(coveragePath, coverageReport);
  writeFileSync(accessPath, publicAccessMarkdown);

  console.log("Tanzania federation coverage audit");
  console.log(`  authorities=${authorities.length} (national=${national.length} regional=${regional.length} local=${local.length} intl=${international.length})`);
  console.log(`  services=${services.length} domains=${domains.length} legalBases=${legalBases.length} capabilities=${capabilities.length}`);
  console.log(`  seed reconciliation: ${JSON.stringify(seedSummary)}`);
  console.log(`  baseline: MDA ${TZ_DIRECTORY_BASELINE.mdas}→${national.length} | regions ${TZ_DIRECTORY_BASELINE.regions}→${baselineRows[1].registered} | LGAs ${TZ_DIRECTORY_BASELINE.lgas}→${local.length} (all MANUAL_REVIEW, count-level only)`);
  console.log(`  LIVE/VERIFIED=${verifiedLive} FREE_CONFIRMED=${freeConfirmed} GOVESB_LIVE=${govesbLive} connectors=${connectors.length}`);
  console.log(`  wrote ${path.relative(process.cwd(), coveragePath)}`);
  console.log(`  wrote ${path.relative(process.cwd(), accessPath)}`);
}

main()
  .catch((err) => {
    console.error("tanzania-coverage-audit failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void adminPool.end();
  });
