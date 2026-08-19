/**
 * BEYU OS constitutional bootstrap.
 * Idempotent: safe to re-run. Creates the canonical enterprise, its
 * constitution, policies, governance bodies and reference/master data.
 *
 * Run:  npx tsx src/db/seed.ts
 */
import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "./index";
import * as s from "./schema";
import { fixedId, ID_PREFIX } from "@/lib/ids";
import { hashPassword, sha256 } from "@/lib/crypto";
import { encryptSecret, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode } from "@/lib/mfa";
import { PERMISSIONS, ROLES, HIGH_RISK_PERMISSIONS } from "@/lib/constants";
import { runWaterfall } from "@/lib/waterfall";

const TODAY = new Date().toISOString().slice(0, 10);
const PRODUCTION_BOOTSTRAP = process.env.NODE_ENV === "production" || process.env.BEYU_ENV === "production";
const BOOTSTRAP_PASSWORD = process.env.BEYU_BOOTSTRAP_PASSWORD;

if (PRODUCTION_BOOTSTRAP && process.env.BEYU_ALLOW_PRODUCTION_SEED !== "I_UNDERSTAND_THIS_IS_A_ONE_TIME_GOVERNED_BOOTSTRAP") {
  throw new Error("Production seed refused: use the governed one-time bootstrap procedure.");
}
if (!BOOTSTRAP_PASSWORD) {
  throw new Error("BEYU_BOOTSTRAP_PASSWORD is required. No default credentials are permitted.");
}
if (BOOTSTRAP_PASSWORD.length < 14) {
  throw new Error("BEYU_BOOTSTRAP_PASSWORD must be at least 14 characters.");
}
const BOOTSTRAP_PASSWORD_VALUE = BOOTSTRAP_PASSWORD;

async function main() {
  /* ---------------- reference data ---------------- */
  await db
    .insert(s.countries)
    .values([
      { code: "TZ", name: "United Republic of Tanzania", region: "East Africa", currencyCode: "TZS", timezone: "Africa/Dar_es_Salaam", locale: "sw-TZ" },
      { code: "KE", name: "Republic of Kenya", region: "East Africa", currencyCode: "KES", timezone: "Africa/Nairobi", locale: "en-KE" },
      { code: "AE", name: "United Arab Emirates", region: "Middle East", currencyCode: "AED", timezone: "Asia/Dubai", locale: "en-AE" },
      { code: "GB", name: "United Kingdom", region: "Europe", currencyCode: "GBP", timezone: "Europe/London", locale: "en-GB" },
      { code: "MU", name: "Republic of Mauritius", region: "Indian Ocean", currencyCode: "MUR", timezone: "Indian/Mauritius", locale: "en-MU" },
    ])
    .onConflictDoNothing();

  const jur = (c: string, code: string, name: string, regulator: string, level = "NATIONAL") => ({
    id: fixedId(ID_PREFIX.jurisdiction, code),
    countryCode: c,
    level,
    code,
    name,
    regulator,
    legalSystem: c === "GB" ? "COMMON_LAW" : "MIXED",
    effectiveFrom: "2000-01-01",
  });
  await db
    .insert(s.jurisdictions)
    .values([
      jur("TZ", "TZ-NAT", "Tanzania (Mainland)", "Tanzania Revenue Authority"),
      jur("KE", "KE-NAT", "Kenya", "Kenya Revenue Authority"),
      jur("AE", "AE-DIFC", "Dubai International Financial Centre", "DFSA", "REGULATOR"),
      jur("GB", "GB-NAT", "United Kingdom", "HMRC"),
      jur("MU", "MU-NAT", "Mauritius", "Financial Services Commission"),
    ])
    .onConflictDoNothing();

  /* ---------------- tenants ---------------- */
  const T = {
    group: fixedId(ID_PREFIX.tenant, "BEYU_GROUP"),
    tz: fixedId(ID_PREFIX.tenant, "BEYU_TZ"),
    health: fixedId(ID_PREFIX.tenant, "BEYU_HEALTH"),
    finance: fixedId(ID_PREFIX.tenant, "BEYU_FINTECH"),
    agri: fixedId(ID_PREFIX.tenant, "BEYU_AGRI"),
    foundation: fixedId(ID_PREFIX.tenant, "BEYU_FOUNDATION"),
  };
  await db
    .insert(s.tenants)
    .values([
      { id: T.group, code: "BEYU-GROUP", name: "BEYU Group (Enterprise)", type: "ENTERPRISE", parentTenantId: null, isolationTier: "DEDICATED", classification: "RESTRICTED" },
      { id: T.tz, code: "BEYU-TZ", name: "BEYU Tanzania Country Tenant", type: "COUNTRY", parentTenantId: T.group, countryCode: "TZ" },
      { id: T.health, code: "BEYU-HEALTH", name: "BEYU Health OS Tenant", type: "SECTOR", parentTenantId: T.tz, countryCode: "TZ" },
      { id: T.finance, code: "BEYU-FINTECH", name: "BEYU FinTech OS Tenant", type: "SECTOR", parentTenantId: T.tz, countryCode: "TZ" },
      { id: T.agri, code: "BEYU-AGRI", name: "BEYU Agriculture OS Tenant", type: "SECTOR", parentTenantId: T.tz, countryCode: "TZ" },
      { id: T.foundation, code: "BEYU-FOUNDATION", name: "BEYU Foundation Tenant", type: "SECTOR", parentTenantId: T.group, countryCode: "TZ", classification: "CONFIDENTIAL" },
    ])
    .onConflictDoNothing();

  /* ---------------- corporate structure ---------------- */
  const E = {
    trust: fixedId(ID_PREFIX.legalEntity, "BEYU_FAMILY_TRUST"),
    holdings: fixedId(ID_PREFIX.legalEntity, "BEYU_HOLDINGS"),
    tzHold: fixedId(ID_PREFIX.legalEntity, "BEYU_TZ_HOLDING"),
    health: fixedId(ID_PREFIX.legalEntity, "BEYU_HEALTH_LTD"),
    fintech: fixedId(ID_PREFIX.legalEntity, "BEYU_FINTECH_LTD"),
    agri: fixedId(ID_PREFIX.legalEntity, "BEYU_AGRI_LTD"),
    mining: fixedId(ID_PREFIX.legalEntity, "BEYU_MINING_LTD"),
    foundation: fixedId(ID_PREFIX.legalEntity, "BEYU_FOUNDATION_ORG"),
  };
  await db
    .insert(s.legalEntities)
    .values([
      { id: E.trust, tenantId: T.group, code: "BEYU-FT", legalName: "BEYU Family Trust", entityType: "TRUST", countryCode: "MU", jurisdictionId: fixedId(ID_PREFIX.jurisdiction, "MU-NAT"), registrationNumber: "MU-TR-100241", incorporationDate: "2014-03-11", functionalCurrency: "USD", effectiveFrom: "2014-03-11", classification: "HIGHLY_RESTRICTED" },
      { id: E.holdings, tenantId: T.group, code: "BEYU-HLD", legalName: "BEYU Holdings Ltd", entityType: "HOLDING", parentEntityId: E.trust, countryCode: "AE", jurisdictionId: fixedId(ID_PREFIX.jurisdiction, "AE-DIFC"), registrationNumber: "DIFC-4471", incorporationDate: "2015-06-02", functionalCurrency: "USD", effectiveFrom: "2015-06-02", classification: "RESTRICTED" },
      { id: E.tzHold, tenantId: T.tz, code: "BEYU-TZH", legalName: "BEYU Tanzania Holding Company Ltd", entityType: "COUNTRY_HOLDING", parentEntityId: E.holdings, countryCode: "TZ", jurisdictionId: fixedId(ID_PREFIX.jurisdiction, "TZ-NAT"), registrationNumber: "TZ-138002211", taxIdentifier: "TIN-114-882-991", incorporationDate: "2016-01-20", functionalCurrency: "TZS", effectiveFrom: "2016-01-20" },
      { id: E.health, tenantId: T.health, code: "BEYU-HEA", legalName: "BEYU Health Ltd", entityType: "OPERATING_COMPANY", parentEntityId: E.tzHold, countryCode: "TZ", jurisdictionId: fixedId(ID_PREFIX.jurisdiction, "TZ-NAT"), registrationNumber: "TZ-142117744", taxIdentifier: "TIN-121-441-002", incorporationDate: "2017-04-05", functionalCurrency: "TZS", sectorCode: "HEALTH", effectiveFrom: "2017-04-05" },
      { id: E.fintech, tenantId: T.finance, code: "BEYU-FIN", legalName: "BEYU FinTech Ltd", entityType: "OPERATING_COMPANY", parentEntityId: E.tzHold, countryCode: "TZ", jurisdictionId: fixedId(ID_PREFIX.jurisdiction, "TZ-NAT"), registrationNumber: "TZ-155390021", incorporationDate: "2019-09-16", functionalCurrency: "TZS", sectorCode: "FINANCE", effectiveFrom: "2019-09-16" },
      { id: E.agri, tenantId: T.agri, code: "BEYU-AGR", legalName: "BEYU Agriculture Ltd", entityType: "OPERATING_COMPANY", parentEntityId: E.tzHold, countryCode: "TZ", jurisdictionId: fixedId(ID_PREFIX.jurisdiction, "TZ-NAT"), registrationNumber: "TZ-161220884", incorporationDate: "2020-02-11", functionalCurrency: "TZS", sectorCode: "AGRICULTURE", effectiveFrom: "2020-02-11" },
      { id: E.mining, tenantId: T.tz, code: "BEYU-MIN", legalName: "BEYU Mining Ltd", entityType: "SUBSIDIARY", parentEntityId: E.tzHold, countryCode: "TZ", jurisdictionId: fixedId(ID_PREFIX.jurisdiction, "TZ-NAT"), registrationNumber: "TZ-170998112", incorporationDate: "2021-07-30", functionalCurrency: "TZS", sectorCode: "MINING", effectiveFrom: "2021-07-30" },
      { id: E.foundation, tenantId: T.foundation, code: "BEYU-FDN", legalName: "BEYU Foundation", entityType: "FOUNDATION", countryCode: "TZ", jurisdictionId: fixedId(ID_PREFIX.jurisdiction, "TZ-NAT"), registrationNumber: "TZ-NGO-00891", incorporationDate: "2018-05-22", functionalCurrency: "TZS", effectiveFrom: "2018-05-22" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.ownershipRecords)
    .values([
      { id: fixedId(ID_PREFIX.ownership, "TRUST_HOLDINGS"), tenantId: T.group, ownedEntityId: E.holdings, ownerEntityId: E.trust, ownershipType: "DIRECT", economicPct: "100", votingPct: "100", effectiveFrom: "2015-06-02", provenance: "Share register + trust deed schedule 2", recordedBy: "SEED/CONSTITUTIONAL_BOOTSTRAP" },
      { id: fixedId(ID_PREFIX.ownership, "HOLDINGS_TZH"), tenantId: T.group, ownedEntityId: E.tzHold, ownerEntityId: E.holdings, ownershipType: "DIRECT", economicPct: "96", votingPct: "100", effectiveFrom: "2016-01-20", provenance: "BRELA filing 2016/0221", recordedBy: "SEED/CONSTITUTIONAL_BOOTSTRAP" },
      { id: fixedId(ID_PREFIX.ownership, "TZH_HEALTH"), tenantId: T.tz, ownedEntityId: E.health, ownerEntityId: E.tzHold, ownershipType: "DIRECT", economicPct: "85", votingPct: "85", effectiveFrom: "2017-04-05", provenance: "Share certificate H-001", recordedBy: "SEED/CONSTITUTIONAL_BOOTSTRAP" },
      { id: fixedId(ID_PREFIX.ownership, "TZH_FIN"), tenantId: T.tz, ownedEntityId: E.fintech, ownerEntityId: E.tzHold, ownershipType: "DIRECT", economicPct: "100", votingPct: "100", effectiveFrom: "2019-09-16", provenance: "Share certificate F-001", recordedBy: "SEED/CONSTITUTIONAL_BOOTSTRAP" },
      { id: fixedId(ID_PREFIX.ownership, "TZH_AGRI"), tenantId: T.tz, ownedEntityId: E.agri, ownerEntityId: E.tzHold, ownershipType: "DIRECT", economicPct: "70", votingPct: "70", effectiveFrom: "2020-02-11", provenance: "JV agreement clause 4.2", recordedBy: "SEED/CONSTITUTIONAL_BOOTSTRAP" },
      { id: fixedId(ID_PREFIX.ownership, "TZH_MIN"), tenantId: T.tz, ownedEntityId: E.mining, ownerEntityId: E.tzHold, ownershipType: "DIRECT", economicPct: "60", votingPct: "60", effectiveFrom: "2021-07-30", provenance: "Mining JV deed", recordedBy: "SEED/CONSTITUTIONAL_BOOTSTRAP" },
      { id: fixedId(ID_PREFIX.ownership, "TRUST_HEALTH_BEN"), tenantId: T.group, ownedEntityId: E.health, ownerEntityId: E.trust, ownershipType: "BENEFICIAL", economicPct: "81.6", votingPct: "0", effectiveFrom: "2017-04-05", provenance: "Look-through calculation 100% × 96% × 85%", recordedBy: "SEED/CONSTITUTIONAL_BOOTSTRAP" },
    ])
    .onConflictDoNothing();

  /* ---------------- identity: permissions, roles ---------------- */
  await db
    .insert(s.permissions)
    .values(
      Object.entries(PERMISSIONS).map(([code, description]) => ({
        code,
        domain: code.split(":")[0],
        action: code.split(":")[1],
        description,
        highRisk: HIGH_RISK_PERMISSIONS.includes(code as never),
        requiresMfa: HIGH_RISK_PERMISSIONS.includes(code as never),
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(s.roles)
    .values(
      Object.entries(ROLES).map(([code, r]) => ({
        id: fixedId(ID_PREFIX.role, code),
        code,
        name: r.name,
        description: r.description,
        scopeLevel: r.scope,
        privileged: r.privileged,
        separationGroup: code === "AUDITOR" ? "ASSURANCE" : "OPERATIONS",
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(s.rolePermissions)
    .values(
      Object.entries(ROLES).flatMap(([code, r]) =>
        r.permissions.map((p) => ({
          id: fixedId(ID_PREFIX.rolePermission, `${code}_${p}`),
          roleId: fixedId(ID_PREFIX.role, code),
          permissionCode: p,
        })),
      ),
    )
    .onConflictDoNothing();

  /* ---------------- parties & users ---------------- */
  type Person = { key: string; name: string; given: string; family: string; email: string; role: string; tenant: string };
  const people: Person[] = [
    { key: "AMANI_BEYU", name: "Amani Beyu", given: "Amani", family: "Beyu", email: "ceo@beyu.os", role: "GROUP_CEO", tenant: T.group },
    { key: "NEEMA_BEYU", name: "Neema Beyu", given: "Neema", family: "Beyu", email: "family@beyu.os", role: "FAMILY_OFFICE_PRINCIPAL", tenant: T.group },
    { key: "DAUDI_MOSHI", name: "Daudi Moshi", given: "Daudi", family: "Moshi", email: "cfo@beyu.os", role: "GROUP_CFO", tenant: T.group },
    { key: "GRACE_KILELE", name: "Grace Kilele", given: "Grace", family: "Kilele", email: "governance@beyu.os", role: "CHIEF_GOVERNANCE_OFFICER", tenant: T.group },
    { key: "JOHN_MREMA", name: "John Mrema", given: "John", family: "Mrema", email: "risk@beyu.os", role: "CHIEF_RISK_COMPLIANCE", tenant: T.group },
    { key: "ASHA_NDULU", name: "Asha Ndulu", given: "Asha", family: "Ndulu", email: "hcm@beyu.os", role: "HCM_DIRECTOR", tenant: T.group },
    { key: "PETER_OKELLO", name: "Peter Okello", given: "Peter", family: "Okello", email: "auditor@beyu.os", role: "AUDITOR", tenant: T.group },
    { key: "SARA_LEMA", name: "Sara Lema", given: "Sara", family: "Lema", email: "health.ops@beyu.os", role: "SECTOR_OPERATOR", tenant: T.health },
    { key: "PLATFORM_ADMIN", name: "Platform Administrator", given: "Platform", family: "Admin", email: "admin@beyu.os", role: "PLATFORM_ADMIN", tenant: T.group },
  ];

  const pwHash = hashPassword(BOOTSTRAP_PASSWORD_VALUE);
  await db
    .insert(s.parties)
    .values(
      people.map((p) => ({
        id: fixedId(ID_PREFIX.party, p.key),
        type: "PERSON" as const,
        displayName: p.name,
        givenName: p.given,
        familyName: p.family,
        email: p.email,
        countryCode: "TZ",
        nationality: "TZ",
        kycStatus: "VERIFIED" as const,
        kycMethod: "NIDA_DOCUMENT_VERIFICATION",
        classification: "CONFIDENTIAL" as const,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(s.parties)
    .values([
      { id: fixedId(ID_PREFIX.party, "NOELIA_AI"), type: "AI_AGENT", displayName: "Noelia AI", classification: "INTERNAL", kycStatus: "DOCUMENTED" },
      { id: fixedId(ID_PREFIX.party, "HIVE_RUNTIME"), type: "SERVICE_ACCOUNT", displayName: "HIVE AI Runtime", classification: "INTERNAL" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.users)
    .values(
      people.map((p) => {
        const totpSecret = generateTotpSecret();
        const recoveryCodes = generateRecoveryCodes();
        return {
          id: fixedId(ID_PREFIX.user, p.key),
          partyId: fixedId(ID_PREFIX.party, p.key),
          email: p.email,
          passwordHash: pwHash,
          passwordMustChange: true,
          mfaEnrolled: true,
          mfaMethod: "TOTP",
          mfaSecretEncrypted: encryptSecret(totpSecret),
          mfaRecoveryCodesHash: recoveryCodes.map(hashRecoveryCode),
          primaryTenantId: p.tenant,
        };
      }),
    )
    .onConflictDoNothing();

  await db
    .insert(s.roleAssignments)
    .values(
      people.map((p) => ({
        id: fixedId(ID_PREFIX.roleAssignment, `${p.key}_${p.role}`),
        userId: fixedId(ID_PREFIX.user, p.key),
        roleId: fixedId(ID_PREFIX.role, p.role),
        tenantId: p.tenant,
        effectiveFrom: "2024-01-01",
        grantedBy: "BOARD_RESOLUTION/BEYU-BRD-2024-001",
        justification: "Constitutional appointment recorded at bootstrap.",
      })),
    )
    .onConflictDoNothing();

  // Idempotent remediation for users created before Kernel Gate 1 MFA hardening.
  for (const p of people) {
    const totpSecret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes();
    await db
      .update(s.users)
      .set({
        passwordMustChange: true,
        mfaEnrolled: true,
        mfaMethod: "TOTP",
        mfaSecretEncrypted: encryptSecret(totpSecret),
        mfaRecoveryCodesHash: recoveryCodes.map(hashRecoveryCode),
        mfaLastAcceptedStep: null,
        mfaFailedAttempts: 0,
        mfaLockedUntil: null,
      })
      .where(and(eq(s.users.id, fixedId(ID_PREFIX.user, p.key)), isNull(s.users.mfaSecretEncrypted)));
  }

  /* ---------------- constitution ---------------- */
  const articles = [
    { no: 1, title: "Supremacy of the Constitution", domain: "GOVERNANCE", body: "This Constitution is the highest authority in the BEYU ecosystem. BEYU OS is the enterprise control plane. No module, Sector OS, integration or AI agent may exceed the authority granted to it here.", authority: "BEYU Family Trust as settlor authority, exercised through the Group Board." },
    { no: 2, title: "Single Source of Truth", domain: "DATA", body: "Each enterprise capability has exactly one authoritative source of truth recorded in the Source-of-Truth Registry. A Sector OS may extend but may never create a competing master for identity, workforce, organisation, ownership, governance, policy, audit or financial consequence.", authority: "Chief Systems Architect under Group Board delegation." },
    { no: 3, title: "Identity and Least Privilege", domain: "SECURITY", body: "Every human, legal entity, service, AI agent and device holds an immutable BEYU identity. Access is zero-trust, least-privilege and evaluated per request through RBAC, ABAC and policy. Emergency access is time-limited, logged and post-reviewed.", authority: "Security Architect; Chief Governance Officer for exceptions." },
    { no: 4, title: "Governance of Material Decisions", domain: "GOVERNANCE", body: "Every material decision must be traceable to who, what, when, why, under which authority, on which data, under which policy, with which approvals and with which consequences. Reserved matters require the competent governance body.", authority: "Group Board and Family Council within their charters." },
    { no: 5, title: "Financial Authority and Integrity", domain: "FINANCE", body: "Finance OS is authoritative for financial consequences. Financial history is immutable; corrections are made by controlled reversal or adjustment. Waterfall distributions execute only under an approved configuration.", authority: "Group CFO under board delegated authority." },
    { no: 6, title: "AI Authority and Human Accountability", domain: "AI", body: "Noelia is the single AI identity, executing on the HIVE runtime. AI may analyse, summarise, detect, predict and automate authorised low-risk workflows. AI may never bypass authorisation, fabricate authority, or take material decisions affecting legal rights, ownership, beneficiary entitlement, employment, healthcare, regulatory declarations or major capital.", authority: "AI Architect; Chief Governance Officer for AI risk acceptance." },
    { no: 7, title: "Jurisdictional Compliance", domain: "COMPLIANCE", body: "Rules are jurisdiction-aware. No national rule is generalised globally. Tanzanian tax, labour and health rules apply only to Tanzanian jurisdiction scope unless separately enacted.", authority: "Compliance Architect and country counsel." },
    { no: 8, title: "Auditability and Non-Repudiation", domain: "AUDIT", body: "All material actions are recorded in an append-only, hash-chained audit ledger. No component may alter or delete audit history. Enterprise events are immutable, versioned and authorised.", authority: "Internal Audit reporting to the Risk & Audit Committee." },
    { no: 9, title: "Tenant Isolation", domain: "SECURITY", body: "Every request resolves identity, tenant, entity, role, permission and data scope. Cross-tenant access requires explicit, recorded authorisation.", authority: "Security Architect." },
    { no: 10, title: "Emergency Powers and Continuity", domain: "CONTINUITY", body: "Emergency powers are time-bound, role-restricted, logged, notified and subject to post-event review. They may never permanently suspend constitutional controls. Continuity and disaster recovery objectives are mandatory and tested.", authority: "Group Board; Crisis Management Committee during activation." },
    { no: 11, title: "Change Control", domain: "ARCHITECTURE", body: "Canonical architecture changes require a proposal, impact, security and compliance analysis, migration and rollback plan, test plan, approval and an Architecture Decision Record.", authority: "Architecture Review Board." },
    { no: 12, title: "Lawful and Ethical Operation", domain: "ETHICS", body: "BEYU OS must not be used to conceal fraud, unlawfully hide beneficial ownership, manipulate records, circumvent sanctions, launder money, evade taxes illegally, fabricate compliance or abuse personal data.", authority: "Group Board; mandatory escalation to Chief Governance Officer." },
  ];
  await db
    .insert(s.constitutionArticles)
    .values(
      articles.map((a) => ({
        id: fixedId(ID_PREFIX.article, `ART_${a.no}`),
        articleNo: a.no,
        title: a.title,
        domain: a.domain,
        body: a.body,
        authorityStatement: a.authority,
        effectiveFrom: "2024-01-01",
        amendmentProcedure: "Two-thirds majority of the Group Board plus Family Council consent; recorded as a resolution and an ADR.",
      })),
    )
    .onConflictDoNothing();

  /* ---------------- policies ---------------- */
  await db
    .insert(s.policies)
    .values([
      {
        id: fixedId(ID_PREFIX.policy, "POL_CONST_AI"),
        code: "CONST-AI-001",
        title: "AI Authority Boundary",
        level: "CONSTITUTION",
        constitutionArticleId: fixedId(ID_PREFIX.article, "ART_6"),
        domain: "AI",
        effectiveFrom: "2024-01-01",
        ownerRole: "CHIEF_GOVERNANCE_OFFICER",
        body: "Noelia may never execute material decisions. AI-initiated changes to ownership, beneficiary entitlement, financial postings or policy are denied.",
        rules: [
          { id: "r1", effect: "DENY", action: "organization:ownership.manage", when: { aiInitiated: true }, message: "AI may not alter ownership records (Constitution Art. 6)." },
          { id: "r2", effect: "DENY", action: "family:beneficiary.manage", when: { aiInitiated: true }, message: "AI may not alter beneficiary entitlements (Constitution Art. 6)." },
          { id: "r3", effect: "DENY", action: "finance:ledger.post", when: { aiInitiated: true }, message: "AI may not post financial entries (Constitution Art. 5 & 6)." },
          { id: "r4", effect: "REQUIRE_HUMAN_REVIEW", action: "ai:noelia.query", when: { aiInitiated: true, classificationAtOrAbove: "HIGHLY_RESTRICTED" }, approverRole: "CHIEF_GOVERNANCE_OFFICER", message: "AI output over highly restricted data requires human review." },
        ],
        classification: "INTERNAL",
      },
      {
        id: fixedId(ID_PREFIX.policy, "POL_ENT_CAPITAL"),
        code: "ENT-FIN-002",
        title: "Capital Approval Authority",
        level: "ENTERPRISE",
        constitutionArticleId: fixedId(ID_PREFIX.article, "ART_5"),
        domain: "FINANCE",
        effectiveFrom: "2024-01-01",
        ownerRole: "GROUP_CFO",
        body: "Capital commitments above USD 250,000 require Investment Committee approval; above USD 1,000,000 require Group Board approval as a reserved matter.",
        rules: [
          { id: "r1", effect: "REQUIRE_APPROVAL", action: "finance:capital.manage", when: { amountAtOrAbove: 250000 }, approverRole: "INVESTMENT_COMMITTEE", message: "Investment Committee approval required above USD 250,000." },
          { id: "r2", effect: "REQUIRE_APPROVAL", action: "finance:capital.manage", when: { amountAtOrAbove: 1000000 }, approverRole: "GROUP_BOARD", message: "Group Board reserved matter above USD 1,000,000." },
        ],
      },
      {
        id: fixedId(ID_PREFIX.policy, "POL_ENT_WATERFALL"),
        code: "ENT-FIN-003",
        title: "Waterfall Commitment Control",
        level: "DOMAIN",
        domain: "FINANCE",
        effectiveFrom: "2024-01-01",
        ownerRole: "GROUP_CFO",
        body: "A waterfall run may only be committed against an ACTIVE configuration approved by resolution. Simulations are unrestricted for authorised finance roles.",
        rules: [
          { id: "r1", effect: "REQUIRE_APPROVAL", action: "finance:waterfall.commit", approverRole: "GROUP_BOARD", message: "Committing a distribution requires an approved board resolution." },
        ],
      },
      {
        id: fixedId(ID_PREFIX.policy, "POL_TAX_GOV"),
        code: "DOM-TAX-001",
        title: "Tax Governance Policy (Tanzania)",
        level: "SECTOR",
        domain: "TAX",
        jurisdictionCode: "TZ",
        effectiveFrom: "2024-01-01",
        ownerRole: "GROUP_CFO",
        body: "All Tanzanian tax positions must have a statutory basis, contemporaneous documentation and a filed position paper. Aggressive or uncertain positions require Tax Governance Committee approval and disclosure.",
        rules: [
          { id: "r1", effect: "REQUIRE_HUMAN_REVIEW", action: "finance:tax.assess", approverRole: "TAX_GOVERNANCE_COMMITTEE", message: "Every tax eligibility assessment requires qualified human review before reliance." },
        ],
      },
      {
        id: fixedId(ID_PREFIX.policy, "POL_PRIVACY"),
        code: "ENT-SEC-004",
        title: "Data Protection & Family Privacy",
        level: "ENTERPRISE",
        domain: "PRIVACY",
        effectiveFrom: "2024-01-01",
        ownerRole: "CHIEF_GOVERNANCE_OFFICER",
        body: "Family and beneficiary data is HIGHLY_RESTRICTED. Access requires explicit grant, purpose limitation and is fully audited. Personal data processing requires a recorded lawful basis.",
        rules: [
          { id: "r1", effect: "REQUIRE_APPROVAL", action: "family:member.manage", approverRole: "FAMILY_COUNCIL", message: "Lineage changes require Family Council authorisation." },
        ],
      },
    ])
    .onConflictDoNothing();

  /* ---------------- governance bodies ---------------- */
  const B = {
    board: fixedId(ID_PREFIX.body, "GROUP_BOARD"),
    audit: fixedId(ID_PREFIX.body, "RISK_AUDIT_COMMITTEE"),
    invest: fixedId(ID_PREFIX.body, "INVESTMENT_COMMITTEE"),
    family: fixedId(ID_PREFIX.body, "FAMILY_COUNCIL"),
    trustees: fixedId(ID_PREFIX.body, "TRUSTEE_BOARD"),
    tax: fixedId(ID_PREFIX.body, "TAX_GOVERNANCE_COMMITTEE"),
  };
  await db
    .insert(s.governanceBodies)
    .values([
      { id: B.board, tenantId: T.group, code: "GROUP_BOARD", name: "BEYU Group Board", bodyType: "BOARD", legalEntityId: E.holdings, quorumMinimum: 4, majorityRule: "SIMPLE", reservedMatters: ["CAPITAL>1M", "OWNERSHIP_CHANGE", "NEW_SECTOR_OS", "POLICY_CONSTITUTION", "DISTRIBUTIONS"] },
      { id: B.audit, tenantId: T.group, code: "RISK_AUDIT_COMMITTEE", name: "Risk & Audit Committee", bodyType: "COMMITTEE", legalEntityId: E.holdings, quorumMinimum: 3, majorityRule: "SIMPLE", reservedMatters: ["RISK_ACCEPTANCE", "AUDIT_FINDING_CLOSURE"] },
      { id: B.invest, tenantId: T.group, code: "INVESTMENT_COMMITTEE", name: "Investment Committee", bodyType: "COMMITTEE", legalEntityId: E.holdings, quorumMinimum: 3, majorityRule: "SIMPLE", reservedMatters: ["CAPITAL>250K"] },
      { id: B.family, tenantId: T.group, code: "FAMILY_COUNCIL", name: "BEYU Family Council", bodyType: "FAMILY_COUNCIL", legalEntityId: E.trust, quorumMinimum: 3, majorityRule: "TWO_THIRDS", reservedMatters: ["BENEFICIARY_ELIGIBILITY", "SUCCESSION", "FAMILY_CONSTITUTION"] },
      { id: B.trustees, tenantId: T.group, code: "TRUSTEE_BOARD", name: "BEYU Family Trust — Trustees", bodyType: "TRUSTEES", legalEntityId: E.trust, quorumMinimum: 2, majorityRule: "UNANIMOUS", reservedMatters: ["TRUST_DISTRIBUTION", "TRUST_AMENDMENT"] },
      { id: B.tax, tenantId: T.group, code: "TAX_GOVERNANCE_COMMITTEE", name: "Tax Governance Committee", bodyType: "COMMITTEE", legalEntityId: E.tzHold, quorumMinimum: 3, majorityRule: "SIMPLE", reservedMatters: ["AGGRESSIVE_TAX_POSITION"] },
    ])
    .onConflictDoNothing();

  const members: { key: string; body: string; party: string; seat: string }[] = [
    { key: "BRD_CEO", body: B.board, party: "AMANI_BEYU", seat: "CHAIR" },
    { key: "BRD_CFO", body: B.board, party: "DAUDI_MOSHI", seat: "MEMBER" },
    { key: "BRD_CGO", body: B.board, party: "GRACE_KILELE", seat: "SECRETARY" },
    { key: "BRD_FAM", body: B.board, party: "NEEMA_BEYU", seat: "MEMBER" },
    { key: "BRD_RISK", body: B.board, party: "JOHN_MREMA", seat: "MEMBER" },
    { key: "AUD_RISK", body: B.audit, party: "JOHN_MREMA", seat: "CHAIR" },
    { key: "AUD_AUD", body: B.audit, party: "PETER_OKELLO", seat: "MEMBER" },
    { key: "AUD_CGO", body: B.audit, party: "GRACE_KILELE", seat: "MEMBER" },
    { key: "INV_CFO", body: B.invest, party: "DAUDI_MOSHI", seat: "CHAIR" },
    { key: "INV_CEO", body: B.invest, party: "AMANI_BEYU", seat: "MEMBER" },
    { key: "INV_FAM", body: B.invest, party: "NEEMA_BEYU", seat: "MEMBER" },
    { key: "FAM_PRIN", body: B.family, party: "NEEMA_BEYU", seat: "CHAIR" },
    { key: "FAM_CEO", body: B.family, party: "AMANI_BEYU", seat: "MEMBER" },
    { key: "FAM_CGO", body: B.family, party: "GRACE_KILELE", seat: "SECRETARY" },
    { key: "TAX_CFO", body: B.tax, party: "DAUDI_MOSHI", seat: "CHAIR" },
    { key: "TAX_CGO", body: B.tax, party: "GRACE_KILELE", seat: "MEMBER" },
    { key: "TAX_RISK", body: B.tax, party: "JOHN_MREMA", seat: "MEMBER" },
  ];
  await db
    .insert(s.governanceMembers)
    .values(
      members.map((m) => ({
        id: fixedId(ID_PREFIX.member, m.key),
        bodyId: m.body,
        partyId: fixedId(ID_PREFIX.party, m.party),
        seatRole: m.seat,
        votingRights: m.seat !== "OBSERVER",
        appointedOn: "2024-01-01",
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(s.resolutions)
    .values([
      { id: fixedId(ID_PREFIX.resolution, "R2025_014"), tenantId: T.group, bodyId: B.board, reference: "BEYU-BRD-2025-014", title: "Approve BEYU Group Waterfall Configuration v2.1", category: "POLICY", summary: "Adopt the revised enterprise cash waterfall for the FY2025 operating surplus, including a 10% Foundation allocation tier.", rationale: "Aligns distribution with the strategic reinvestment plan and the Foundation funding covenant.", dataBasis: "Finance OS consolidated cash forecast FY2025-Q3; Treasury positions as at period end.", authorityPolicyId: fixedId(ID_PREFIX.policy, "POL_ENT_WATERFALL"), consequences: "Binding on all TZ operating companies from the next distribution cycle.", proposedBy: "GROUP_CFO", status: "APPROVED", requiredMajority: "SIMPLE", quorumMet: true, votesFor: 4, votesAgainst: 0, votesAbstain: 1, decisionDate: new Date("2025-08-14T10:00:00Z") },
      { id: fixedId(ID_PREFIX.resolution, "R2025_021"), tenantId: T.group, bodyId: B.invest, reference: "BEYU-IC-2025-021", title: "Health OS regional expansion — capital allocation", category: "CAPITAL", summary: "Allocate USD 1,800,000 to the Health OS Mwanza expansion programme.", rationale: "IRR 18.4% against a 12% hurdle; supports strategic objective SO-2 (regional access).", dataBasis: "Capital request CAP-2025-004 with sensitivity analysis.", authorityPolicyId: fixedId(ID_PREFIX.policy, "POL_ENT_CAPITAL"), consequences: "Requires Group Board ratification as a reserved matter above USD 1,000,000.", proposedBy: "GROUP_CFO", status: "TABLED", requiredMajority: "SIMPLE", quorumMet: true, votesFor: 2, votesAgainst: 0, votesAbstain: 0 },
      { id: fixedId(ID_PREFIX.resolution, "R2025_007"), tenantId: T.group, bodyId: B.family, reference: "BEYU-FC-2025-007", title: "Verification of third-generation beneficiary class", category: "RESERVED_MATTER", summary: "Confirm eligibility of verified direct descendants in generation 3 as contingent beneficiaries.", rationale: "Lineage verified by documentary evidence and independent counsel review.", dataBasis: "Family registry lineage verification pack FV-2025-03.", consequences: "Updates beneficiary register; no immediate distribution effect.", proposedBy: "FAMILY_OFFICE_PRINCIPAL", status: "APPROVED", requiredMajority: "TWO_THIRDS", quorumMet: true, votesFor: 3, votesAgainst: 0, votesAbstain: 0, decisionDate: new Date("2025-06-02T09:00:00Z"), classification: "HIGHLY_RESTRICTED" },
      { id: fixedId(ID_PREFIX.resolution, "R2025_031"), tenantId: T.group, bodyId: B.tax, reference: "BEYU-TGC-2025-031", title: "Adopt capital allowance position for agricultural machinery", category: "TAX", summary: "Approve reliance on the Tanzanian capital deduction for qualifying agricultural plant.", rationale: "Clear statutory basis; low audit risk; documentation pack complete.", dataBasis: "Tax strategy TZ-CAP-ALLOW-01 eligibility assessment.", consequences: "Reduces FY2025 taxable income for BEYU Agriculture Ltd.", proposedBy: "GROUP_CFO", status: "DRAFT", requiredMajority: "SIMPLE", quorumMet: false },
    ])
    .onConflictDoNothing();

  /* ---------------- risk, control, compliance, legal ---------------- */
  await db
    .insert(s.risks)
    .values([
      { id: fixedId(ID_PREFIX.risk, "R001"), tenantId: T.group, code: "ERM-001", title: "Concentration of revenue in a single jurisdiction", category: "CONCENTRATION", description: "Over 70% of group revenue originates in Tanzania, exposing the group to single-country economic and regulatory shocks.", legalEntityId: E.tzHold, inherentLikelihood: 4, inherentImpact: 5, residualLikelihood: 3, residualImpact: 5, appetiteThreshold: 12, treatment: "MITIGATE", mitigationPlan: "Accelerate Kenya and DIFC diversification per strategic objective SO-4.", status: "MONITORED", nextReviewAt: "2026-03-31" },
      { id: fixedId(ID_PREFIX.risk, "R002"), tenantId: T.group, code: "ERM-002", title: "Cyber intrusion into clinical systems", category: "CYBERSECURITY", description: "Ransomware or data exfiltration affecting Health OS patient data.", legalEntityId: E.health, sectorCode: "HEALTH", inherentLikelihood: 4, inherentImpact: 5, residualLikelihood: 2, residualImpact: 5, appetiteThreshold: 12, treatment: "MITIGATE", mitigationPlan: "Zero-trust segmentation, EDR, 24/7 SOC, quarterly restore testing.", status: "MONITORED", nextReviewAt: "2026-02-28" },
      { id: fixedId(ID_PREFIX.risk, "R003"), tenantId: T.group, code: "ERM-003", title: "Uncertain tax position challenged by authority", category: "REGULATORY", description: "Transfer pricing methodology for intra-group services may be challenged.", legalEntityId: E.tzHold, inherentLikelihood: 3, inherentImpact: 4, residualLikelihood: 3, residualImpact: 4, appetiteThreshold: 9, treatment: "MITIGATE", mitigationPlan: "Refresh TP documentation and obtain advance pricing confirmation.", status: "ESCALATED", escalated: true, nextReviewAt: "2026-01-31" },
      { id: fixedId(ID_PREFIX.risk, "R004"), tenantId: T.group, code: "ERM-004", title: "AI recommendation relied upon without human review", category: "AI", description: "Material decision taken on a Noelia recommendation without the mandated human accountability step.", inherentLikelihood: 3, inherentImpact: 4, residualLikelihood: 1, residualImpact: 4, appetiteThreshold: 8, treatment: "MITIGATE", mitigationPlan: "Hard policy gate, AI decision register, mandatory review workflow.", status: "MONITORED", nextReviewAt: "2026-04-30" },
      { id: fixedId(ID_PREFIX.risk, "R005"), tenantId: T.group, code: "ERM-005", title: "Liquidity shortfall at country holding level", category: "LIQUIDITY", description: "Debt service and mandatory reserves could exceed available operating cash in a downside scenario.", legalEntityId: E.tzHold, inherentLikelihood: 3, inherentImpact: 4, residualLikelihood: 2, residualImpact: 4, appetiteThreshold: 9, treatment: "MITIGATE", mitigationPlan: "Maintain 90-day reserve floor in the waterfall; committed facility.", status: "MONITORED", nextReviewAt: "2026-03-15" },
      { id: fixedId(ID_PREFIX.risk, "R006"), tenantId: T.group, code: "ERM-006", title: "Beneficiary lineage dispute", category: "LEGAL", description: "Contested direct-descendant claim against the trust.", legalEntityId: E.trust, inherentLikelihood: 2, inherentImpact: 5, residualLikelihood: 2, residualImpact: 4, appetiteThreshold: 8, treatment: "MITIGATE", mitigationPlan: "Verified lineage evidence pack and Family Council resolution trail.", status: "OPEN", nextReviewAt: "2026-05-30", classification: "HIGHLY_RESTRICTED" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.controls)
    .values([
      { id: fixedId(ID_PREFIX.control, "C001"), tenantId: T.group, code: "CTL-SEC-001", title: "Multi-factor authentication on all privileged access", controlType: "PREVENTIVE", automation: "AUTOMATED", frameworks: ["ISO27001", "SOC2"], riskId: fixedId(ID_PREFIX.risk, "R002"), ownerRole: "PLATFORM_ADMIN", testFrequency: "QUARTERLY", lastTestedAt: "2025-10-01", effectiveness: "EFFECTIVE" },
      { id: fixedId(ID_PREFIX.control, "C002"), tenantId: T.group, code: "CTL-FIN-002", title: "Maker/checker on all journal postings", controlType: "PREVENTIVE", automation: "AUTOMATED", frameworks: ["IFRS", "SOC2"], ownerRole: "GROUP_CFO", testFrequency: "MONTHLY", lastTestedAt: "2025-11-30", effectiveness: "EFFECTIVE" },
      { id: fixedId(ID_PREFIX.control, "C003"), tenantId: T.group, code: "CTL-AI-003", title: "Mandatory human review of material AI recommendations", controlType: "PREVENTIVE", automation: "AUTOMATED", frameworks: ["ISO42001"], riskId: fixedId(ID_PREFIX.risk, "R004"), ownerRole: "CHIEF_GOVERNANCE_OFFICER", testFrequency: "QUARTERLY", lastTestedAt: "2025-09-15", effectiveness: "EFFECTIVE" },
      { id: fixedId(ID_PREFIX.control, "C004"), tenantId: T.group, code: "CTL-BCP-004", title: "Quarterly restore test of production backups", controlType: "DETECTIVE", automation: "SEMI_AUTOMATED", frameworks: ["ISO22301"], ownerRole: "PLATFORM_ADMIN", testFrequency: "QUARTERLY", lastTestedAt: "2025-10-20", effectiveness: "EFFECTIVE" },
      { id: fixedId(ID_PREFIX.control, "C005"), tenantId: T.group, code: "CTL-PRV-005", title: "Purpose limitation and lawful basis register for personal data", controlType: "PREVENTIVE", automation: "MANUAL", frameworks: ["GDPR", "TZ_DPA_2022"], ownerRole: "CHIEF_GOVERNANCE_OFFICER", testFrequency: "SEMI_ANNUAL", lastTestedAt: "2025-07-04", effectiveness: "PARTIALLY_EFFECTIVE" },
    ])
    .onConflictDoNothing();

  const obligations = [
    { key: "O1", code: "OBL-TZ-VAT", framework: "TRA", reference: "VAT Act Cap 148 s.66", title: "Monthly VAT return filing", jur: "TZ", type: "FILING", freq: "MONTHLY", due: "2026-01-20", entity: E.tzHold, state: "COMPLIANT" as const },
    { key: "O2", code: "OBL-TZ-PAYE", framework: "TRA", reference: "Income Tax Act s.81", title: "PAYE remittance and monthly return", jur: "TZ", type: "FILING", freq: "MONTHLY", due: "2026-01-07", entity: E.tzHold, state: "COMPLIANT" as const },
    { key: "O3", code: "OBL-TZ-DPA", framework: "TZ_DPA_2022", reference: "Personal Data Protection Act 2022 s.30", title: "Data controller registration and DPO notification", jur: "TZ", type: "REGISTRATION", freq: "ANNUAL", due: "2026-04-30", entity: E.health, state: "PARTIALLY_COMPLIANT" as const },
    { key: "O4", code: "OBL-ISO-27001", framework: "ISO27001", reference: "A.5–A.8 control set", title: "Information security management system operation", jur: "TZ", type: "CONTROL_OPERATION", freq: "CONTINUOUS", due: "2026-06-30", entity: E.holdings, state: "PARTIALLY_COMPLIANT" as const },
    { key: "O5", code: "OBL-AML-KYC", framework: "AML_KYC", reference: "AMLA 2006 (as amended) s.15", title: "Customer due diligence and suspicious transaction reporting", jur: "TZ", type: "PROCESS", freq: "CONTINUOUS", due: "2026-03-31", entity: E.fintech, state: "COMPLIANT" as const },
    { key: "O6", code: "OBL-NHIF-CLAIM", framework: "NHIF", reference: "NHIF claims guideline 2023", title: "Claims submission within 60 days of service", jur: "TZ", type: "OPERATIONAL", freq: "MONTHLY", due: "2026-01-31", entity: E.health, state: "NON_COMPLIANT" as const },
    { key: "O7", code: "OBL-IFRS-CONSOL", framework: "IFRS", reference: "IFRS 10", title: "Consolidated financial statements", jur: "TZ", type: "REPORTING", freq: "ANNUAL", due: "2026-06-30", entity: E.holdings, state: "NOT_ASSESSED" as const },
    { key: "O8", code: "OBL-GDPR-XFER", framework: "GDPR", reference: "Art. 44–49", title: "International transfer safeguards for EU data subjects", jur: "GB", type: "PROCESS", freq: "CONTINUOUS", due: "2026-05-31", entity: E.holdings, state: "REQUIRES_HUMAN_REVIEW" as const },
  ];
  await db
    .insert(s.complianceObligations)
    .values(
      obligations.map((o) => ({
        id: fixedId(ID_PREFIX.obligation, o.key),
        tenantId: T.group,
        code: o.code,
        framework: o.framework,
        reference: o.reference,
        title: o.title,
        obligationType: o.type,
        jurisdictionCode: o.jur,
        legalEntityId: o.entity,
        frequency: o.freq,
        nextDueAt: o.due,
        ownerRole: "CHIEF_RISK_COMPLIANCE",
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(s.complianceAssessments)
    .values(
      obligations.map((o) => ({
        id: fixedId(ID_PREFIX.assessment, o.key),
        tenantId: T.group,
        obligationId: fixedId(ID_PREFIX.obligation, o.key),
        period: "2025-Q4",
        state: o.state,
        findings:
          o.state === "NON_COMPLIANT"
            ? "Claim submission backlog exceeded the 60-day window for 4.2% of claims."
            : o.state === "PARTIALLY_COMPLIANT"
              ? "Control operating but evidence incomplete for the full period."
              : null,
        remediationPlan: o.state === "NON_COMPLIANT" ? "Automate claim ageing alerts in Health OS; weekly exception review." : null,
        remediationDueAt: o.state === "NON_COMPLIANT" ? "2026-02-28" : null,
        assessedBy: "CHIEF_RISK_COMPLIANCE",
        humanConfirmed: o.state !== "REQUIRES_HUMAN_REVIEW",
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(s.legalMatters)
    .values([
      { id: fixedId(ID_PREFIX.legal, "L1"), tenantId: T.group, code: "LGL-2025-001", matterType: "CONTRACT", title: "Master services agreement — regional laboratory network", legalEntityId: E.health, counterparty: "East Africa Diagnostics Ltd", jurisdictionCode: "TZ", exposureAmount: "420000", currency: "USD", obligationSummary: "Five-year exclusivity with annual volume commitments and a 90-day termination notice.", keyDeadline: "2026-03-01", counselName: "Mkono & Partners", status: "ACTIVE" },
      { id: fixedId(ID_PREFIX.legal, "L2"), tenantId: T.group, code: "LGL-2025-004", matterType: "LICENSE", title: "TMDA facility licence renewal", legalEntityId: E.health, jurisdictionCode: "TZ", obligationSummary: "Annual renewal with inspection prerequisite.", keyDeadline: "2026-02-15", status: "OPEN" },
      { id: fixedId(ID_PREFIX.legal, "L3"), tenantId: T.group, code: "LGL-2025-009", matterType: "DISPUTE", title: "Supplier claim for early termination", legalEntityId: E.agri, counterparty: "Kilimo Equipment Co.", jurisdictionCode: "TZ", exposureAmount: "96000", currency: "USD", obligationSummary: "Claim disputed; provision recognised in accordance with IAS 37.", keyDeadline: "2026-04-10", counselName: "Bowmans TZ", status: "IN_LITIGATION", classification: "RESTRICTED" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.continuityPlans)
    .values([
      { id: fixedId(ID_PREFIX.continuity, "BCP1"), code: "BCP-CORE-01", scope: "BEYU OS control plane", scenario: "Primary region outage", rpoMinutes: 5, rtoMinutes: 60, strategy: "Multi-AZ Postgres with PITR, warm standby in secondary region, ArgoCD re-deploy from Git.", ownerRole: "PLATFORM_ADMIN", lastTestedAt: "2025-10-20", lastTestOutcome: "PASSED — restored in 41 minutes", nextTestDue: "2026-01-20", runbookUri: "/docs/runbooks/dr-region-failover.md" },
      { id: fixedId(ID_PREFIX.continuity, "BCP2"), code: "BCP-DATA-02", scope: "Enterprise data", scenario: "Logical data corruption", rpoMinutes: 5, rtoMinutes: 240, strategy: "Point-in-time recovery to a shadow cluster, reconciliation against the audit hash chain before cutover.", ownerRole: "PLATFORM_ADMIN", lastTestedAt: "2025-09-12", lastTestOutcome: "PASSED — chain verified", nextTestDue: "2026-03-12", runbookUri: "/docs/runbooks/pitr-restore.md" },
      { id: fixedId(ID_PREFIX.continuity, "BCP3"), code: "BCP-CYBER-03", scope: "Group", scenario: "Ransomware / cyber incident", rpoMinutes: 15, rtoMinutes: 480, strategy: "Immutable offsite backups, isolated recovery environment, crisis committee activation, regulator notification within statutory windows.", ownerRole: "CHIEF_RISK_COMPLIANCE", lastTestedAt: "2025-08-05", lastTestOutcome: "PASSED WITH ACTIONS", nextTestDue: "2026-02-05", runbookUri: "/docs/runbooks/cyber-incident.md" },
    ])
    .onConflictDoNothing();

  /* ---------------- finance ---------------- */
  await db
    .insert(s.treasuryPositions)
    .values([
      { id: fixedId(ID_PREFIX.treasury, "T1"), tenantId: T.group, legalEntityId: E.holdings, institution: "Emirates NBD", accountLabel: "Group operating USD", currency: "USD", balance: "4820000", baseCurrencyBalance: "4820000", asOf: "2025-12-31" },
      { id: fixedId(ID_PREFIX.treasury, "T2"), tenantId: T.group, legalEntityId: E.tzHold, institution: "CRDB Bank", accountLabel: "TZ holding operating", currency: "TZS", balance: "6120000000", baseCurrencyBalance: "2340000", asOf: "2025-12-31" },
      { id: fixedId(ID_PREFIX.treasury, "T3"), tenantId: T.group, legalEntityId: E.health, institution: "NMB Bank", accountLabel: "Health operations", currency: "TZS", balance: "2870000000", baseCurrencyBalance: "1098000", asOf: "2025-12-31" },
      { id: fixedId(ID_PREFIX.treasury, "T4"), tenantId: T.group, legalEntityId: E.trust, institution: "SBM Mauritius", accountLabel: "Trust reserve", accountType: "RESERVE", currency: "USD", balance: "3150000", baseCurrencyBalance: "3150000", asOf: "2025-12-31", classification: "HIGHLY_RESTRICTED" },
      { id: fixedId(ID_PREFIX.treasury, "T5"), tenantId: T.group, legalEntityId: E.agri, institution: "NBC Bank", accountLabel: "Agriculture working capital", currency: "TZS", balance: "980000000", baseCurrencyBalance: "375000", asOf: "2025-12-31" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.capitalRequests)
    .values([
      { id: fixedId(ID_PREFIX.capital, "CAP1"), tenantId: T.group, legalEntityId: E.health, code: "CAP-2025-004", title: "Health OS Mwanza regional expansion", requestType: "INVESTMENT", sectorCode: "HEALTH", amount: "1800000", currency: "USD", horizonMonths: 84, expectedIrr: "0.184", expectedNpv: "742000", paybackMonths: 46, riskScore: 11, riskAdjustedReturn: "0.142", status: "UNDER_REVIEW", requestedBy: "GROUP_CFO", resolutionId: fixedId(ID_PREFIX.resolution, "R2025_021") },
      { id: fixedId(ID_PREFIX.capital, "CAP2"), tenantId: T.group, legalEntityId: E.agri, code: "CAP-2025-011", title: "Irrigation and mechanisation programme", requestType: "CAPEX", sectorCode: "AGRICULTURE", amount: "640000", currency: "USD", horizonMonths: 60, expectedIrr: "0.152", expectedNpv: "218000", paybackMonths: 41, riskScore: 9, riskAdjustedReturn: "0.118", status: "APPROVED", requestedBy: "SECTOR_OPERATOR", decisionDate: new Date("2025-11-12T00:00:00Z") },
      { id: fixedId(ID_PREFIX.capital, "CAP3"), tenantId: T.group, legalEntityId: E.fintech, code: "CAP-2025-015", title: "Payments licence capital adequacy top-up", requestType: "FINANCING", sectorCode: "FINANCE", amount: "300000", currency: "USD", horizonMonths: 36, expectedIrr: "0.096", expectedNpv: "42000", paybackMonths: 30, riskScore: 7, riskAdjustedReturn: "0.071", status: "SUBMITTED", requestedBy: "SECTOR_OPERATOR" },
      { id: fixedId(ID_PREFIX.capital, "CAP4"), tenantId: T.group, legalEntityId: E.foundation, code: "CAP-2025-019", title: "Foundation community health programme funding", requestType: "OPEX", sectorCode: "FOUNDATION", amount: "180000", currency: "USD", horizonMonths: 12, riskScore: 4, status: "APPROVED", requestedBy: "GROUP_CEO", decisionDate: new Date("2025-10-02T00:00:00Z") },
    ])
    .onConflictDoNothing();

  const wfConfigId = fixedId(ID_PREFIX.waterfallConfig, "WF_GROUP_V21");
  await db
    .insert(s.waterfallConfigs)
    .values({
      id: wfConfigId,
      tenantId: T.group,
      legalEntityId: E.tzHold,
      code: "WF-TZH-OPSURPLUS",
      name: "BEYU Tanzania Holding — operating surplus waterfall",
      version: "2.1.0",
      jurisdictionCode: "TZ",
      transactionType: "OPERATING_SURPLUS",
      currency: "USD",
      status: "ACTIVE",
      effectiveFrom: "2025-09-01",
      approvedByResolutionId: fixedId(ID_PREFIX.resolution, "R2025_014"),
      policyId: fixedId(ID_PREFIX.policy, "POL_ENT_WATERFALL"),
      notes: "Approved by BEYU-BRD-2025-014. Reserve floor set to 90 days of operating cost.",
    })
    .onConflictDoNothing();

  const tiers = [
    { seq: 1, code: "TAX", name: "Statutory corporate tax", type: "PERCENTAGE_OF_GROSS", rate: "0.3", beneficiary: "TAX_AUTHORITY", basis: "Income Tax Act Cap 332 (TZ) — 30% corporate rate" },
    { seq: 2, code: "OPEX", name: "Operating costs", type: "PERCENTAGE_OF_GROSS", rate: "0.32", beneficiary: "OPERATIONS", basis: "Approved FY2025 operating budget" },
    { seq: 3, code: "DEBT", name: "Senior debt service", type: "PERCENTAGE_OF_REMAINING", rate: "0.25", beneficiary: "LENDER", basis: "Facility agreement cl. 8 — DSCR covenant 1.35x" },
    { seq: 4, code: "RESERVE", name: "Mandatory reserve floor (90 days)", type: "THRESHOLD_TOPUP", min: "400000", beneficiary: "RESERVE", basis: "Board treasury policy ENT-FIN-005" },
    { seq: 5, code: "CAPEX", name: "Capital allocation pool", type: "PERCENTAGE_OF_REMAINING", rate: "0.35", beneficiary: "CAPITAL", basis: "Capital allocation policy ENT-FIN-002" },
    { seq: 6, code: "FOUNDATION", name: "Foundation allocation", type: "PERCENTAGE_OF_REMAINING", rate: "0.1", beneficiary: "FOUNDATION", basis: "Foundation funding covenant 2023" },
    { seq: 7, code: "OWNER", name: "Owner / beneficiary distributions", type: "RESIDUAL", beneficiary: "OWNER", basis: "Trust deed schedule 4 — discretionary distribution" },
  ];
  await db
    .insert(s.waterfallTiers)
    .values(
      tiers.map((t) => ({
        id: fixedId(ID_PREFIX.waterfallTier, `WF21_${t.code}`),
        configId: wfConfigId,
        sequence: t.seq,
        code: t.code,
        name: t.name,
        tierType: t.type,
        rate: t.rate ?? null,
        minAmount: t.min ?? null,
        beneficiaryType: t.beneficiary,
        legalBasis: t.basis,
        mandatory: ["TAX", "OPEX", "DEBT", "RESERVE"].includes(t.code),
      })),
    )
    .onConflictDoNothing();

  const demoRun = runWaterfall({
    grossAmount: 5250000,
    currency: "USD",
    tiers: tiers.map((t) => ({
      sequence: t.seq,
      code: t.code,
      name: t.name,
      tierType: t.type as never,
      rate: t.rate ? Number(t.rate) : null,
      minAmount: t.min ? Number(t.min) : null,
      beneficiaryType: t.beneficiary,
      legalBasis: t.basis,
      mandatory: ["TAX", "OPEX", "DEBT", "RESERVE"].includes(t.code),
    })),
    scenario: "BASE",
  });
  const runId = fixedId(ID_PREFIX.waterfallRun, "RUN_2025Q4");
  await db
    .insert(s.waterfallRuns)
    .values({
      id: runId,
      tenantId: T.group,
      configId: wfConfigId,
      period: "2025-Q4",
      grossAmount: "5250000",
      currency: "USD",
      totalAllocated: String(demoRun.totalAllocated),
      residual: String(demoRun.residual),
      scenario: "BASE",
      inputs: { grossAmount: 5250000 },
      explanation: demoRun.explanation,
      engineVersion: demoRun.engineVersion,
      checksum: demoRun.checksum,
      executedBy: "GROUP_CFO",
      approvedByResolutionId: fixedId(ID_PREFIX.resolution, "R2025_014"),
      status: "COMMITTED",
    })
    .onConflictDoNothing();
  await db
    .insert(s.waterfallRunLines)
    .values(
      demoRun.lines.map((l) => ({
        id: fixedId(ID_PREFIX.waterfallLine, `RUN_2025Q4_${l.tierCode}`),
        runId,
        sequence: l.sequence,
        tierCode: l.tierCode,
        tierName: l.tierName,
        beneficiaryType: l.beneficiaryType,
        basisAmount: String(l.basisAmount),
        allocatedAmount: String(l.allocatedAmount),
        remainingAfter: String(l.remainingAfter),
        formula: l.formula,
        legalBasis: l.legalBasis ?? null,
      })),
    )
    .onConflictDoNothing();

  /* ---------------- tax strategy intelligence ---------------- */
  await db
    .insert(s.taxStrategies)
    .values([
      {
        id: fixedId(ID_PREFIX.taxStrategy, "TZ_CAP_ALLOW_01"),
        code: "TZ-CAP-ALLOW-01",
        title: "Capital deduction on qualifying agricultural plant and machinery",
        jurisdictionCode: "TZ",
        category: "CAPITAL_ALLOWANCES",
        position: "LEGAL_TAX_PLANNING",
        legalBasis: "Statutory capital deduction for depreciable assets used in agriculture.",
        statutoryReference: "Income Tax Act Cap 332, Third Schedule (Tanzania)",
        eligibilityCriteria: [
          { key: "jurisdiction", label: "Taxpayer resident in Tanzania", operator: "EQUALS", value: "TZ", mandatory: true },
          { key: "assetClass", label: "Asset is qualifying plant and machinery", operator: "EQUALS", value: "PLANT_MACHINERY", mandatory: true },
          { key: "assetInUse", label: "Asset in use in the year of income", operator: "EQUALS", value: true, mandatory: true },
          { key: "invoiceEvidence", label: "Original supplier invoices retained", operator: "EQUALS", value: true, mandatory: true },
        ] as s.TaxEligibilityCriterion[],
        documentationRequirements: ["Fixed asset register extract", "Supplier invoices and import documents", "Asset commissioning certificate"],
        implementationSteps: ["Classify asset in the fixed asset register", "Compute the deduction per the Third Schedule class", "Disclose in the annual return", "Retain evidence for the statutory period"],
        economicBenefitBasis: "Accelerated deduction reduces current-year taxable income; timing benefit not a permanent saving.",
        benefitRate: "0.0375",
        taxEffect: "Reduces taxable income in the year of income.",
        cashflowEffect: "Positive timing effect on the current-year instalment.",
        accountingEffect: "Deferred tax liability recognised under IAS 12.",
        complianceRisk: 1,
        auditRisk: 2,
        legalRisk: 1,
        reputationalRisk: 1,
        requiredApprovals: ["GROUP_CFO"],
        alternatives: ["Standard wear-and-tear deduction", "Operating lease structure"],
        evidenceRequirements: ["Asset register", "Invoices", "Board approval of capital purchase"],
        provenanceSource: "Tanzania Income Tax Act Cap 332 (Revised Edition) — reviewed by group tax counsel",
        effectiveFrom: "2024-07-01",
        reviewDate: "2026-06-30",
      },
      {
        id: fixedId(ID_PREFIX.taxStrategy, "TZ_TP_SERVICES"),
        code: "TZ-TP-SERVICES-02",
        title: "Intra-group services charge under the arm's length principle",
        jurisdictionCode: "TZ",
        category: "TRANSFER_PRICING",
        position: "AGGRESSIVE_UNCERTAIN",
        legalBasis: "Deductibility of intra-group management services where an arm's length benefit test is satisfied.",
        statutoryReference: "Income Tax (Transfer Pricing) Regulations 2018 (Tanzania)",
        eligibilityCriteria: [
          { key: "jurisdiction", label: "Taxpayer resident in Tanzania", operator: "EQUALS", value: "TZ", mandatory: true },
          { key: "tpDocumentation", label: "Contemporaneous TP documentation prepared", operator: "EQUALS", value: true, mandatory: true },
          { key: "benefitTest", label: "Documented benefit test for services received", operator: "EQUALS", value: true, mandatory: true },
          { key: "markup", label: "Cost-plus mark-up within the benchmarked range (%)", operator: "AT_MOST", value: 10, mandatory: true },
        ] as s.TaxEligibilityCriterion[],
        documentationRequirements: ["Local file", "Master file", "Benefit test memorandum", "Benchmarking study"],
        implementationSteps: ["Prepare benchmarking study", "Execute intra-group services agreement", "Maintain time and cost allocation evidence", "Disclose related-party transactions"],
        economicBenefitBasis: "Deduction of genuine service costs at arm's length pricing.",
        benefitRate: "0.012",
        taxEffect: "Reduces Tanzanian taxable profit where the benefit test is met.",
        cashflowEffect: "Reduces current tax; may create withholding tax on service fees.",
        accountingEffect: "Intercompany charge eliminated on consolidation.",
        complianceRisk: 3,
        auditRisk: 4,
        legalRisk: 3,
        reputationalRisk: 3,
        requiredApprovals: ["TAX_GOVERNANCE_COMMITTEE", "GROUP_BOARD"],
        alternatives: ["Direct local cost incurrence", "Cost-sharing arrangement"],
        evidenceRequirements: ["Benchmarking study", "Service logs", "Board minutes"],
        provenanceSource: "Tanzania TP Regulations 2018 — external adviser opinion on file",
        authorityStatus: "AUTHORITATIVE",
        effectiveFrom: "2024-01-01",
        reviewDate: "2026-03-31",
      },
      {
        id: fixedId(ID_PREFIX.taxStrategy, "TZ_CHAR_DON"),
        code: "TZ-CHAR-DON-03",
        title: "Deduction for donations to approved charitable institutions",
        jurisdictionCode: "TZ",
        category: "PHILANTHROPY",
        position: "LEGAL_TAX_PLANNING",
        legalBasis: "Deduction for donations to institutions approved by the Commissioner, subject to statutory caps.",
        statutoryReference: "Income Tax Act Cap 332 s.12 (Tanzania)",
        eligibilityCriteria: [
          { key: "jurisdiction", label: "Taxpayer resident in Tanzania", operator: "EQUALS", value: "TZ", mandatory: true },
          { key: "doneeApproved", label: "Donee holds Commissioner approval", operator: "EQUALS", value: true, mandatory: true },
          { key: "donationPctOfIncome", label: "Donation within statutory cap (% of income)", operator: "AT_MOST", value: 2, mandatory: true },
          { key: "receiptEvidence", label: "Official donation receipts retained", operator: "EQUALS", value: true, mandatory: false },
        ] as s.TaxEligibilityCriterion[],
        documentationRequirements: ["Donee approval certificate", "Official receipts", "Board resolution authorising the donation"],
        implementationSteps: ["Verify donee approval status", "Obtain board authorisation", "Record and cap the deduction", "Disclose in the return"],
        economicBenefitBasis: "Permanent deduction within the statutory cap.",
        benefitRate: "0.006",
        taxEffect: "Permanent reduction of taxable income within the cap.",
        cashflowEffect: "Cash outflow to the donee; partial tax offset.",
        accountingEffect: "Expense recognised in the period of donation.",
        complianceRisk: 1,
        auditRisk: 1,
        legalRisk: 1,
        reputationalRisk: 1,
        requiredApprovals: ["GROUP_CFO", "GROUP_BOARD"],
        alternatives: ["Direct programme funding without deduction"],
        evidenceRequirements: ["Approval certificate", "Receipts"],
        provenanceSource: "Income Tax Act Cap 332 s.12 — reviewed by group tax counsel",
        effectiveFrom: "2024-07-01",
        reviewDate: "2026-06-30",
      },
      {
        id: fixedId(ID_PREFIX.taxStrategy, "GB_RND_CREDIT"),
        code: "GB-RND-CREDIT-01",
        title: "R&D expenditure credit (United Kingdom)",
        jurisdictionCode: "GB",
        category: "INCENTIVE",
        position: "LEGAL_TAX_PLANNING",
        legalBasis: "Statutory credit for qualifying research and development expenditure.",
        statutoryReference: "Corporation Tax Act 2009 Part 13 (UK)",
        eligibilityCriteria: [
          { key: "jurisdiction", label: "Taxpayer within UK corporation tax", operator: "EQUALS", value: "GB", mandatory: true },
          { key: "qualifyingRnD", label: "Project meets the BEIS definition of R&D", operator: "EQUALS", value: true, mandatory: true },
        ] as s.TaxEligibilityCriterion[],
        documentationRequirements: ["Technical narrative", "Cost apportionment schedule"],
        implementationSteps: ["Identify qualifying projects", "Prepare technical narrative", "Claim in the CT600"],
        economicBenefitBasis: "Above-the-line credit on qualifying expenditure.",
        benefitRate: "0.02",
        taxEffect: "Credit against corporation tax.",
        cashflowEffect: "Potential payable credit.",
        accountingEffect: "Recognised as other income.",
        complianceRisk: 2,
        auditRisk: 3,
        legalRisk: 1,
        reputationalRisk: 1,
        requiredApprovals: ["GROUP_CFO"],
        alternatives: ["Patent Box (separate assessment)"],
        evidenceRequirements: ["Project records", "Timesheets"],
        provenanceSource: "CTA 2009 Part 13 — UK adviser memorandum",
        effectiveFrom: "2024-04-01",
        reviewDate: "2026-04-01",
      },
      {
        id: fixedId(ID_PREFIX.taxStrategy, "BLOCKED_SHAM"),
        code: "GLOBAL-PROHIBITED-01",
        title: "Undisclosed offshore routing to conceal taxable profit",
        jurisdictionCode: "TZ",
        category: "PROHIBITED",
        position: "PROHIBITED_EVASION",
        legalBasis: "None. Constitutes tax evasion and, where ownership is concealed, potential money laundering.",
        statutoryReference: "Prohibited — Income Tax Act Cap 332 and AMLA 2006",
        eligibilityCriteria: [] as s.TaxEligibilityCriterion[],
        documentationRequirements: [],
        implementationSteps: [],
        economicBenefitBasis: "Not applicable — unlawful.",
        benefitRate: null,
        taxEffect: "Unlawful evasion.",
        cashflowEffect: "Not applicable.",
        accountingEffect: "Misstatement of financial records.",
        complianceRisk: 5,
        auditRisk: 5,
        legalRisk: 5,
        reputationalRisk: 5,
        requiredApprovals: [],
        alternatives: ["Lawful transfer pricing with proper documentation"],
        evidenceRequirements: [],
        provenanceSource: "Registered explicitly so the engine can hard-block it (Constitution Art. 12).",
        authorityStatus: "REJECTED",
        effectiveFrom: "2024-01-01",
        reviewDate: "2026-12-31",
      },
    ])
    .onConflictDoNothing();

  /* ---------------- HCM ---------------- */
  await db
    .insert(s.positions)
    .values([
      { id: fixedId(ID_PREFIX.position, "P1"), tenantId: T.group, code: "POS-EXEC-CEO", title: "Group Chief Executive", grade: "E1", jobFamily: "EXECUTIVE" },
      { id: fixedId(ID_PREFIX.position, "P2"), tenantId: T.group, code: "POS-EXEC-CFO", title: "Group Chief Financial Officer", grade: "E1", jobFamily: "FINANCE", reportsToPositionId: fixedId(ID_PREFIX.position, "P1") },
      { id: fixedId(ID_PREFIX.position, "P3"), tenantId: T.group, code: "POS-EXEC-CGO", title: "Chief Governance Officer", grade: "E1", jobFamily: "GOVERNANCE", reportsToPositionId: fixedId(ID_PREFIX.position, "P1") },
      { id: fixedId(ID_PREFIX.position, "P4"), tenantId: T.health, code: "POS-HEA-MD", title: "Medical Director", grade: "M1", jobFamily: "CLINICAL" },
      { id: fixedId(ID_PREFIX.position, "P5"), tenantId: T.group, code: "POS-HR-DIR", title: "Group HCM Director", grade: "E2", jobFamily: "PEOPLE", reportsToPositionId: fixedId(ID_PREFIX.position, "P1") },
    ])
    .onConflictDoNothing();

  const staff = [
    { key: "AMANI_BEYU", no: "BEYU-EMP-00001", entity: E.holdings, pos: "P1", hire: "2015-06-02", salary: "38000", ccy: "USD" },
    { key: "DAUDI_MOSHI", no: "BEYU-EMP-00002", entity: E.holdings, pos: "P2", hire: "2016-02-15", salary: "29000", ccy: "USD" },
    { key: "GRACE_KILELE", no: "BEYU-EMP-00003", entity: E.holdings, pos: "P3", hire: "2017-08-01", salary: "26500", ccy: "USD" },
    { key: "JOHN_MREMA", no: "BEYU-EMP-00004", entity: E.tzHold, pos: "P3", hire: "2018-03-19", salary: "18000", ccy: "USD" },
    { key: "ASHA_NDULU", no: "BEYU-EMP-00005", entity: E.tzHold, pos: "P5", hire: "2019-01-07", salary: "16000", ccy: "USD" },
    { key: "SARA_LEMA", no: "BEYU-EMP-00006", entity: E.health, pos: "P4", hire: "2020-11-02", salary: "9800", ccy: "USD" },
    { key: "PETER_OKELLO", no: "BEYU-EMP-00007", entity: E.holdings, pos: "P3", hire: "2021-05-10", salary: "14000", ccy: "USD" },
  ];
  await db
    .insert(s.employees)
    .values(
      staff.map((e) => ({
        id: fixedId(ID_PREFIX.employee, e.key),
        tenantId: T.group,
        employeeNo: e.no,
        partyId: fixedId(ID_PREFIX.party, e.key),
        legalEntityId: e.entity,
        positionId: fixedId(ID_PREFIX.position, e.pos),
        workEmail: `${e.key.toLowerCase()}@beyu.os`,
        countryCode: "TZ",
        hireDate: e.hire,
        baseSalary: e.salary,
        salaryCurrency: e.ccy,
        contractRef: `CON-${e.no}`,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(s.employmentEvents)
    .values(
      staff.map((e) => ({
        id: fixedId(ID_PREFIX.employmentEvent, `${e.key}_HIRE`),
        employeeId: fixedId(ID_PREFIX.employee, e.key),
        eventType: "HIRE",
        effectiveFrom: e.hire,
        details: { contractRef: `CON-${e.no}` },
        approvedBy: "HCM_DIRECTOR",
        recordedBy: "SEED/CONSTITUTIONAL_BOOTSTRAP",
      })),
    )
    .onConflictDoNothing();

  /* ---------------- family office ---------------- */
  const fam = [
    { key: "FM_G1_FOUNDER", party: "AMANI_BEYU", branch: "FOUNDER", gen: 1, parent: null, direct: true, ver: "VERIFIED" as const },
    { key: "FM_G1_SPOUSE", party: "NEEMA_BEYU", branch: "FOUNDER", gen: 1, parent: null, direct: false, ver: "VERIFIED" as const },
  ];
  await db
    .insert(s.familyMembers)
    .values(
      fam.map((f) => ({
        id: fixedId(ID_PREFIX.familyMember, f.key),
        tenantId: T.group,
        partyId: fixedId(ID_PREFIX.party, f.party),
        familyLine: "BEYU",
        branch: f.branch,
        generation: f.gen,
        parentMemberId: f.parent,
        directDescendant: f.direct,
        verificationStatus: f.ver,
        verificationMethod: "DOCUMENTARY_AND_COUNSEL_REVIEW",
        verifiedBy: "FAMILY_COUNCIL",
        verifiedAt: new Date("2025-06-02T09:00:00Z"),
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(s.beneficiaries)
    .values([
      { id: fixedId(ID_PREFIX.beneficiary, "B1"), tenantId: T.group, familyMemberId: fixedId(ID_PREFIX.familyMember, "FM_G1_FOUNDER"), trustEntityId: E.trust, beneficiaryClass: "PRIMARY", eligibility: "ELIGIBLE", eligibilityRationale: "Named primary beneficiary in the trust deed schedule 3; lineage verified.", entitlementPct: "40", conditions: [], effectiveFrom: "2014-03-11", verifiedBy: "TRUSTEE_BOARD", approvedByResolutionId: fixedId(ID_PREFIX.resolution, "R2025_007") },
      { id: fixedId(ID_PREFIX.beneficiary, "B2"), tenantId: T.group, familyMemberId: fixedId(ID_PREFIX.familyMember, "FM_G1_SPOUSE"), trustEntityId: E.trust, beneficiaryClass: "PRIMARY", eligibility: "ELIGIBLE", eligibilityRationale: "Named primary beneficiary in the trust deed schedule 3.", entitlementPct: "40", conditions: [], effectiveFrom: "2014-03-11", verifiedBy: "TRUSTEE_BOARD", approvedByResolutionId: fixedId(ID_PREFIX.resolution, "R2025_007") },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.familyVaultItems)
    .values([
      { id: fixedId(ID_PREFIX.vaultItem, "V1"), tenantId: T.group, vaultType: "TRUST", title: "BEYU Family Trust Deed (executed)", description: "Constitutional trust instrument with schedules 1–5.", custodianRole: "TRUSTEE_BOARD", successionInstruction: "Released to successor trustees upon appointment resolution." },
      { id: fixedId(ID_PREFIX.vaultItem, "V2"), tenantId: T.group, vaultType: "FAMILY", title: "BEYU Family Constitution v3", description: "Family values, governance, succession and conflict resolution.", custodianRole: "FAMILY_COUNCIL" },
      { id: fixedId(ID_PREFIX.vaultItem, "V3"), tenantId: T.group, vaultType: "EMERGENCY", title: "Emergency continuity instructions", description: "Sealed instructions for incapacity or succession events.", custodianRole: "FAMILY_COUNCIL", sealedUntil: "2030-01-01" },
      { id: fixedId(ID_PREFIX.vaultItem, "V4"), tenantId: T.group, vaultType: "LEGACY", title: "Founder legacy archive", description: "Historical records, correspondence and family history.", custodianRole: "FAMILY_OFFICE_PRINCIPAL" },
      { id: fixedId(ID_PREFIX.vaultItem, "V5"), tenantId: T.group, vaultType: "CREDENTIAL", title: "Registry of key custodians", description: "Index of credential custody assignments (no secrets stored).", custodianRole: "PLATFORM_ADMIN" },
    ])
    .onConflictDoNothing();

  /* ---------------- foundation ---------------- */
  await db
    .insert(s.foundationPrograms)
    .values([
      { id: fixedId(ID_PREFIX.program, "PRG1"), tenantId: T.foundation, code: "FDN-HEALTH-01", name: "Community maternal health outreach", theme: "HEALTH", countryCode: "TZ", budget: "180000", currency: "USD", spendToDate: "121400", beneficiariesReached: 14820, impactMetric: "Antenatal visits completed", impactValue: "9640", fundingResolutionId: fixedId(ID_PREFIX.resolution, "R2025_014") },
      { id: fixedId(ID_PREFIX.program, "PRG2"), tenantId: T.foundation, code: "FDN-EDU-02", name: "STEM scholarship programme", theme: "EDUCATION", countryCode: "TZ", budget: "95000", currency: "USD", spendToDate: "64200", beneficiariesReached: 240, impactMetric: "Scholars retained to year 2", impactValue: "213" },
      { id: fixedId(ID_PREFIX.program, "PRG3"), tenantId: T.foundation, code: "FDN-AGRI-03", name: "Smallholder resilience initiative", theme: "AGRICULTURE", countryCode: "TZ", budget: "120000", currency: "USD", spendToDate: "38900", beneficiariesReached: 3100, impactMetric: "Yield increase (%)", impactValue: "18" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.sectorMetrics)
    .values([
      { id: fixedId(ID_PREFIX.sectorMetric, "M1"), tenantId: T.group, sectorCode: "HEALTH", metricCode: "REVENUE_YTD_USD", period: "2025", value: "9640000", unit: "USD", sourceSystem: "BEYU_HEALTH_OS" },
      { id: fixedId(ID_PREFIX.sectorMetric, "M2"), tenantId: T.group, sectorCode: "FINANCE", metricCode: "REVENUE_YTD_USD", period: "2025", value: "12470000", unit: "USD", sourceSystem: "BEYU_FINANCE_OS" },
      { id: fixedId(ID_PREFIX.sectorMetric, "M3"), tenantId: T.group, sectorCode: "AGRICULTURE", metricCode: "REVENUE_YTD_USD", period: "2025", value: "6450000", unit: "USD", sourceSystem: "BEYU_AGRICULTURE_OS" },
      { id: fixedId(ID_PREFIX.sectorMetric, "M4"), tenantId: T.group, sectorCode: "HEALTH", metricCode: "PATIENT_ENCOUNTERS", period: "2025", value: "184220", unit: "COUNT", sourceSystem: "BEYU_HEALTH_OS" },
      { id: fixedId(ID_PREFIX.sectorMetric, "M5"), tenantId: T.group, sectorCode: "FINANCE", metricCode: "ACTIVE_WALLETS", period: "2025", value: "412000", unit: "COUNT", sourceSystem: "BEYU_FINANCE_OS" },
      { id: fixedId(ID_PREFIX.sectorMetric, "M6"), tenantId: T.group, sectorCode: "AGRICULTURE", metricCode: "HECTARES_UNDER_MANAGEMENT", period: "2025", value: "8400", unit: "HA", sourceSystem: "BEYU_AGRICULTURE_OS" },
    ])
    .onConflictDoNothing();

  /* ---------------- documents & knowledge ---------------- */
  await db
    .insert(s.retentionPolicies)
    .values([
      { code: "RET-CORP-10Y", recordType: "CORPORATE_RECORD", jurisdictionCode: "TZ", retentionYears: 10, legalBasis: "Companies Act Cap 212" },
      { code: "RET-TAX-5Y", recordType: "TAX_RECORD", jurisdictionCode: "TZ", retentionYears: 5, legalBasis: "Tax Administration Act 2015 s.35" },
      { code: "RET-HR-7Y", recordType: "EMPLOYMENT_RECORD", jurisdictionCode: "TZ", retentionYears: 7, legalBasis: "Employment and Labour Relations Act 2004" },
      { code: "RET-TRUST-PERM", recordType: "TRUST_INSTRUMENT", jurisdictionCode: "MU", retentionYears: 99, legalBasis: "Trusts Act 2001 (Mauritius)" },
      { code: "RET-CLIN-10Y", recordType: "CLINICAL_RECORD", jurisdictionCode: "TZ", retentionYears: 10, legalBasis: "Health facility record-keeping guideline" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.documents)
    .values([
      { id: fixedId(ID_PREFIX.document, "D1"), tenantId: T.group, fileName: "beyu-family-trust-deed-v1.pdf", fileType: "application/pdf", category: "CONSTITUTIONAL", description: "Executed BEYU Family Trust deed with schedules.", version: "1.0.0", source: "EXTERNAL_COUNSEL", uploadedBy: "FAMILY_OFFICE_PRINCIPAL", effectiveDate: "2014-03-11", entityScope: "BEYU-FT", jurisdictionCode: "MU", classification: "HIGHLY_RESTRICTED", authorityStatus: "AUTHORITATIVE", checksum: sha256("trust-deed-v1"), storageUri: "vault://beyu/trust/deed-v1.pdf", retentionCode: "RET-TRUST-PERM", legalHold: true, approvedBy: "TRUSTEE_BOARD", approvedAt: new Date("2014-03-11T00:00:00Z") },
      { id: fixedId(ID_PREFIX.document, "D2"), tenantId: T.group, fileName: "waterfall-config-v2.1-approval.pdf", fileType: "application/pdf", category: "GOVERNANCE", description: "Board approval pack for waterfall configuration v2.1.", version: "2.1.0", source: "GOVERNANCE_ENGINE", uploadedBy: "CHIEF_GOVERNANCE_OFFICER", effectiveDate: "2025-09-01", entityScope: "BEYU-TZH", jurisdictionCode: "TZ", classification: "RESTRICTED", authorityStatus: "AUTHORITATIVE", checksum: sha256("wf-2.1"), storageUri: "s3://beyu-docs/governance/wf-2.1.pdf", retentionCode: "RET-CORP-10Y", approvedBy: "GROUP_BOARD", approvedAt: new Date("2025-08-14T10:00:00Z") },
      { id: fixedId(ID_PREFIX.document, "D3"), tenantId: T.group, fileName: "tz-transfer-pricing-local-file-2025.pdf", fileType: "application/pdf", category: "TAX", description: "Contemporaneous transfer pricing local file for FY2025.", version: "1.0.0", source: "EXTERNAL_ADVISER", uploadedBy: "GROUP_CFO", effectiveDate: "2025-12-01", entityScope: "BEYU-TZH", jurisdictionCode: "TZ", classification: "RESTRICTED", authorityStatus: "UNDER_REVIEW", checksum: sha256("tp-local-2025"), storageUri: "s3://beyu-docs/tax/tp-2025.pdf", retentionCode: "RET-TAX-5Y" },
      { id: fixedId(ID_PREFIX.document, "D4"), tenantId: T.group, fileName: "beyu-logo-primary.png", fileType: "image/png", category: "BRAND", description: "Canonical BEYU brand mark — authoritative logo asset.", version: "3.0.0", source: "BRAND_OFFICE", uploadedBy: "PLATFORM_ADMIN", effectiveDate: "2024-01-01", classification: "PUBLIC", authorityStatus: "AUTHORITATIVE", checksum: sha256("beyu-logo-v3"), storageUri: "s3://beyu-brand/logo-primary.png", retentionCode: "RET-CORP-10Y" },
      { id: fixedId(ID_PREFIX.document, "D5"), tenantId: T.group, fileName: "isms-statement-of-applicability-v2.xlsx", fileType: "application/vnd.ms-excel", category: "COMPLIANCE", description: "ISO 27001 statement of applicability (self-assessed, not certified).", version: "2.0.0", source: "SECURITY_OFFICE", uploadedBy: "CHIEF_RISK_COMPLIANCE", effectiveDate: "2025-06-01", classification: "CONFIDENTIAL", authorityStatus: "AUTHORITATIVE", checksum: sha256("soa-v2"), storageUri: "s3://beyu-docs/security/soa-v2.xlsx", retentionCode: "RET-CORP-10Y" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.knowledgeSources)
    .values([
      { id: fixedId(ID_PREFIX.knowledge, "K1"), code: "KN-TZ-ITA", title: "Tanzania Income Tax Act Cap 332 — key provisions", domain: "TAX", ownerRole: "GROUP_CFO", jurisdictionCode: "TZ", provenance: "Statute, reviewed by group tax counsel 2025-07", effectiveFrom: "2024-07-01", reviewDate: "2026-06-30", content: "Corporate income tax rate 30%. Capital deductions per the Third Schedule. Donations to approved institutions deductible subject to statutory caps. Transfer pricing governed by the 2018 Regulations requiring contemporaneous documentation.", keywords: ["tax", "tanzania", "deduction", "capital", "transfer pricing"] },
      { id: fixedId(ID_PREFIX.knowledge, "K2"), code: "KN-GOV-WATERFALL", title: "Enterprise distribution waterfall doctrine", domain: "FINANCE", ownerRole: "GROUP_CFO", provenance: "Board-approved treasury policy ENT-FIN-005", effectiveFrom: "2025-09-01", reviewDate: "2026-09-01", content: "Cash is applied in strict tier order: statutory taxes, operating costs, debt service, mandatory reserves, capital allocation, foundation allocation and finally owner or beneficiary distributions. Any deviation requires a board resolution.", keywords: ["waterfall", "distribution", "reserve", "capital", "cash"] },
      { id: fixedId(ID_PREFIX.knowledge, "K3"), code: "KN-AI-GOV", title: "Noelia AI operating boundaries", domain: "AI", ownerRole: "CHIEF_GOVERNANCE_OFFICER", provenance: "Constitution Article 6 and policy CONST-AI-001", effectiveFrom: "2024-01-01", reviewDate: "2026-01-01", content: "Noelia is the single AI identity of the BEYU ecosystem operating on the HIVE runtime. Noelia inherits the requesting user's authority and can never exceed it, never posts financial entries, never alters ownership or beneficiary entitlement, and flags material outputs for human review.", keywords: ["noelia", "hive", "governance", "review", "authority"] },
      { id: fixedId(ID_PREFIX.knowledge, "K4"), code: "KN-SEC-CLASS", title: "Security classification handling standard", domain: "SECURITY", ownerRole: "PLATFORM_ADMIN", provenance: "Security architecture standard SEC-STD-002", effectiveFrom: "2024-01-01", reviewDate: "2026-03-31", content: "PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED and HIGHLY_RESTRICTED. Highly restricted data requires named grants, MFA, full audit and encryption with dedicated keys. Family, beneficiary and clinical data default to the highest tiers.", keywords: ["classification", "security", "restricted", "encryption", "access"] },
      { id: fixedId(ID_PREFIX.knowledge, "K5"), code: "KN-HCM-SOT", title: "HCM single source of truth rule", domain: "WORKFORCE", ownerRole: "HCM_DIRECTOR", provenance: "Constitution Article 2", effectiveFrom: "2024-01-01", reviewDate: "2026-06-30", content: "One employee master identifier exists for the entire ecosystem. Sector OSs consume governed HCM data and may not create independent employee masters. Finance OS consumes authorised workforce outputs and remains authoritative for financial consequences.", keywords: ["employee", "workforce", "master", "hcm", "truth"] },
    ])
    .onConflictDoNothing();

  /* ---------------- registries ---------------- */
  await db
    .insert(s.osRegistry)
    .values([
      { id: fixedId(ID_PREFIX.osRegistry, "BEYU_OS"), code: "BEYU_OS", name: "BEYU OS", kind: "CONTROL_PLANE", purpose: "Global enterprise control plane governing the entire BEYU ecosystem.", ownerRole: "GROUP_CEO", authorityScope: "ENTERPRISE_WIDE", dataAuthority: ["IDENTITY", "ORGANIZATION", "OWNERSHIP", "GOVERNANCE", "POLICY", "AUDIT", "RISK", "COMPLIANCE", "CAPITAL", "DOCUMENTS", "AI_IDENTITY"], dependencies: [], apis: ["/api/v1/*"], events: ["*"], complianceFrameworks: ["ISO27001", "SOC2", "GDPR"], classification: "RESTRICTED" },
      { id: fixedId(ID_PREFIX.osRegistry, "HCM"), code: "SHARED_HCM", name: "Human Capital Management", kind: "SHARED_CAPABILITY", purpose: "Single source of truth for the workforce lifecycle.", ownerRole: "HCM_DIRECTOR", authorityScope: "ENTERPRISE_WIDE", dataAuthority: ["EMPLOYEE_MASTER", "POSITION", "EMPLOYMENT_EVENT"], dependencies: ["BEYU_OS"], apis: ["/api/v1/hcm/employees"], events: ["EMPLOYEE_CREATED", "EMPLOYMENT_CHANGED"], complianceFrameworks: ["TZ_LABOUR", "GDPR"] },
      { id: fixedId(ID_PREFIX.osRegistry, "FAMILY_OFFICE"), code: "SHARED_FAMILY_OFFICE", name: "Family Office", kind: "SHARED_CAPABILITY", purpose: "Family governance, lineage, beneficiaries, vaults and succession — a first-class BEYU OS capability, never a separate OS.", ownerRole: "FAMILY_OFFICE_PRINCIPAL", authorityScope: "ENTERPRISE_WIDE", dataAuthority: ["FAMILY_REGISTRY", "BENEFICIARY", "FAMILY_VAULT"], dependencies: ["BEYU_OS", "SHARED_GOVERNANCE"], apis: ["/api/v1/family/*"], events: ["BENEFICIARY_VERIFIED", "FAMILY_RESOLUTION_APPROVED"], complianceFrameworks: ["MU_TRUSTS_ACT", "AML_KYC"], classification: "HIGHLY_RESTRICTED" },
      { id: fixedId(ID_PREFIX.osRegistry, "FINANCE_OS"), code: "FINANCE_OS", name: "BEYU Finance OS", kind: "SECTOR_OS", purpose: "Authoritative domain for financial consequences, treasury, capital, waterfall and tax strategy intelligence.", ownerRole: "GROUP_CFO", authorityScope: "FINANCIAL_CONSEQUENCE", dataAuthority: ["LEDGER", "TREASURY", "CAPITAL", "WATERFALL", "TAX_POSITION"], dependencies: ["BEYU_OS", "SHARED_HCM"], apis: ["/api/v1/finance/*"], events: ["PAYMENT_POSTED", "WATERFALL_EXECUTED", "TAX_STRATEGY_APPROVED"], complianceFrameworks: ["IFRS", "TRA", "AML_KYC"] },
      { id: fixedId(ID_PREFIX.osRegistry, "HEALTH_OS"), code: "HEALTH_OS", name: "BEYU Health OS", kind: "SECTOR_OS", purpose: "Healthcare operations: EHR, clinical workflows, pharmacy, laboratory, claims and clinical AI.", ownerRole: "SECTOR_OPERATOR", authorityScope: "CLINICAL_OPERATIONS", dataAuthority: ["PATIENT_RECORD", "ENCOUNTER", "CLINICAL_ORDER"], dependencies: ["BEYU_OS", "SHARED_HCM", "FINANCE_OS"], apis: ["/api/v1/health/*"], events: ["ENCOUNTER_CREATED", "CLAIM_SUBMITTED"], complianceFrameworks: ["FHIR", "DICOM", "ICD11", "MTUHA", "DHIS2", "NHIF", "TMDA"], classification: "RESTRICTED" },
      { id: fixedId(ID_PREFIX.osRegistry, "AGRI_OS"), code: "AGRICULTURE_OS", name: "BEYU Agriculture OS", kind: "SECTOR_OS", purpose: "Agricultural operations: land, crop cycles, inputs, yield and supply chain.", ownerRole: "SECTOR_OPERATOR", authorityScope: "AGRICULTURAL_OPERATIONS", dataAuthority: ["FARM_BLOCK", "CROP_CYCLE", "HARVEST"], dependencies: ["BEYU_OS", "FINANCE_OS", "SHARED_HCM"], apis: ["/api/v1/agriculture/*"], events: ["HARVEST_RECORDED"], complianceFrameworks: ["TZ_AGRI"] },
      { id: fixedId(ID_PREFIX.osRegistry, "FOUNDATION_OS"), code: "FOUNDATION_OS", name: "BEYU Foundation OS", kind: "SECTOR_OS", purpose: "Non-profit operations: programmes, grants, donors, impact and monitoring & evaluation, with separate legal and financial boundaries.", ownerRole: "GROUP_CEO", authorityScope: "NONPROFIT_OPERATIONS", dataAuthority: ["PROGRAMME", "GRANT", "IMPACT_MEASURE"], dependencies: ["BEYU_OS", "FINANCE_OS", "SHARED_HCM"], apis: ["/api/v1/foundation/*"], events: ["PROGRAMME_FUNDED"], complianceFrameworks: ["TZ_NGO_ACT"] },
      { id: fixedId(ID_PREFIX.osRegistry, "HIVE"), code: "HIVE_RUNTIME", name: "HIVE AI Runtime", kind: "AI_RUNTIME", purpose: "Runtime intelligence: model routing, RAG, tool calling, evaluation and monitoring under BEYU OS governance.", ownerRole: "CHIEF_GOVERNANCE_OFFICER", authorityScope: "AI_EXECUTION", dataAuthority: ["AI_DECISION_RECORD", "PROMPT_VERSION", "MODEL_VERSION"], dependencies: ["BEYU_OS"], apis: ["/api/v1/ai/noelia"], events: ["AI_DECISION_RECORDED", "AI_DECISION_REVIEWED"], complianceFrameworks: ["ISO42001"] },
      { id: fixedId(ID_PREFIX.osRegistry, "MINING_OS"), code: "MINING_OS", name: "BEYU Mining OS (proposed)", kind: "SECTOR_OS", purpose: "Proposed sector OS for mining operations. Registered before build to prevent unnecessary OS proliferation.", ownerRole: "GROUP_CEO", authorityScope: "MINING_OPERATIONS", dataAuthority: [], dependencies: ["BEYU_OS", "FINANCE_OS"], apis: [], events: [], complianceFrameworks: ["TZ_MINING_ACT"], lifecycle: "DRAFT" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.sourceOfTruth)
    .values(
      [
        ["Identity", "BEYU_OS", "identity.users / identity.parties", ["ALL"]],
        ["Employees", "SHARED_HCM", "people.employees", ["FINANCE_OS", "HEALTH_OS", "AGRICULTURE_OS", "FOUNDATION_OS"]],
        ["Organizations", "BEYU_OS", "core.org_units", ["ALL"]],
        ["Legal Entities", "BEYU_OS", "core.legal_entities", ["ALL"]],
        ["Ownership", "BEYU_OS", "core.ownership_records", ["FINANCE_OS"]],
        ["Governance", "BEYU_OS", "governance.resolutions", ["ALL"]],
        ["Policies", "BEYU_OS", "governance.policies", ["ALL"]],
        ["Risk", "BEYU_OS", "assurance.risks", ["ALL"]],
        ["Compliance", "BEYU_OS", "assurance.compliance_obligations", ["ALL"]],
        ["Financial consequences", "FINANCE_OS", "finance.journal_entries", ["ALL"]],
        ["Tax positions", "FINANCE_OS", "finance.tax_strategies", ["ALL"]],
        ["Healthcare operations", "HEALTH_OS", "health.encounters", ["BEYU_OS"]],
        ["Agricultural operations", "AGRICULTURE_OS", "agriculture.crop_cycles", ["BEYU_OS"]],
        ["Foundation operations", "FOUNDATION_OS", "people.foundation_programs", ["BEYU_OS"]],
        ["Family governance", "SHARED_FAMILY_OFFICE", "people.family_members / beneficiaries", ["BEYU_OS"]],
        ["AI identity", "BEYU_OS", "Noelia (single AI identity)", ["ALL"]],
        ["AI runtime", "HIVE_RUNTIME", "platform.ai_decisions", ["ALL"]],
        ["Audit", "BEYU_OS", "platform.audit_log", ["ALL"]],
        ["Documents", "BEYU_OS", "platform.documents", ["ALL"]],
      ].map(([capability, os, store, consumers]) => ({
        id: fixedId(ID_PREFIX.sot, String(capability)),
        capability: String(capability),
        authoritativeOs: String(os),
        authoritativeStore: String(store),
        consumers: consumers as string[],
        duplicationAllowed: false,
        notes: "Sector extensions permitted; competing masters prohibited (Constitution Art. 2).",
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(s.integrations)
    .values([
      { id: fixedId(ID_PREFIX.integration, "I1"), tenantId: T.group, code: "INT-TRA-EFD", name: "Tanzania Revenue Authority e-filing", provider: "TRA", category: "TAX_AUTHORITY", protocol: "REST", standard: "OPENAPI", authType: "MTLS", secretRef: "vault://beyu/integrations/tra", ownerRole: "GROUP_CFO", slaUptimePct: "99.10" },
      { id: fixedId(ID_PREFIX.integration, "I2"), tenantId: T.group, code: "INT-NHIF-CLAIMS", name: "NHIF claims gateway", provider: "NHIF", category: "REGULATOR", protocol: "REST", standard: "OPENAPI", authType: "OAUTH2", secretRef: "vault://beyu/integrations/nhif", ownerRole: "SECTOR_OPERATOR", slaUptimePct: "98.40" },
      { id: fixedId(ID_PREFIX.integration, "I3"), tenantId: T.group, code: "INT-CRDB-ISO20022", name: "CRDB corporate banking", provider: "CRDB", category: "BANK", protocol: "SFTP", standard: "ISO20022", authType: "MTLS", secretRef: "vault://beyu/integrations/crdb", ownerRole: "GROUP_CFO", slaUptimePct: "99.80" },
      { id: fixedId(ID_PREFIX.integration, "I4"), tenantId: T.group, code: "INT-DHIS2", name: "DHIS2 national health reporting", provider: "MoH", category: "HEALTH", protocol: "REST", standard: "DHIS2", authType: "OAUTH2", secretRef: "vault://beyu/integrations/dhis2", ownerRole: "SECTOR_OPERATOR", slaUptimePct: "97.60" },
      { id: fixedId(ID_PREFIX.integration, "I5"), tenantId: T.group, code: "INT-OIDC-IDP", name: "Enterprise identity provider", provider: "Okta", category: "IDP", protocol: "REST", standard: "OIDC", authType: "OIDC", secretRef: "vault://beyu/integrations/idp", ownerRole: "PLATFORM_ADMIN", slaUptimePct: "99.95" },
      { id: fixedId(ID_PREFIX.integration, "I6"), tenantId: T.group, code: "INT-FHIR-LAB", name: "Reference laboratory FHIR exchange", provider: "EA Diagnostics", category: "HEALTH", protocol: "REST", standard: "FHIR", authType: "OAUTH2", secretRef: "vault://beyu/integrations/lab", ownerRole: "SECTOR_OPERATOR", slaUptimePct: "98.90" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.metricDefinitions)
    .values([
      { code: "KPI-LIQUIDITY-USD", name: "Consolidated liquidity", definition: "Sum of treasury balances translated to USD at period-end rates.", domain: "FINANCE", sourceOfTruth: "FINANCE_OS/treasury_positions", ownerRole: "GROUP_CFO", calculation: "Σ base_currency_balance where as_of = period end", period: "MONTHLY", unit: "USD" },
      { code: "KPI-CAPITAL-PIPELINE", name: "Capital pipeline value", definition: "Total value of capital requests not yet rejected.", domain: "FINANCE", sourceOfTruth: "FINANCE_OS/capital_requests", ownerRole: "GROUP_CFO", calculation: "Σ amount where status ≠ REJECTED", period: "MONTHLY", unit: "USD" },
      { code: "KPI-RISK-BREACH", name: "Risks above appetite", definition: "Count of risks whose residual score exceeds the approved appetite threshold.", domain: "RISK", sourceOfTruth: "BEYU_OS/risks", ownerRole: "CHIEF_RISK_COMPLIANCE", calculation: "count(residual_likelihood × residual_impact > appetite_threshold)", period: "MONTHLY", unit: "COUNT" },
      { code: "KPI-COMPLIANCE-RATE", name: "Compliance rate", definition: "Share of assessed obligations in a COMPLIANT state.", domain: "COMPLIANCE", sourceOfTruth: "BEYU_OS/compliance_assessments", ownerRole: "CHIEF_RISK_COMPLIANCE", calculation: "compliant ÷ assessed", period: "QUARTERLY", unit: "PERCENT" },
      { code: "KPI-HEADCOUNT", name: "Active headcount", definition: "Active employees in the single HCM master.", domain: "WORKFORCE", sourceOfTruth: "SHARED_HCM/employees", ownerRole: "HCM_DIRECTOR", calculation: "count(status = ACTIVE)", period: "MONTHLY", unit: "COUNT" },
      { code: "KPI-AI-REVIEW", name: "AI decisions pending human review", definition: "Material AI outputs awaiting the mandated human accountability step.", domain: "AI", sourceOfTruth: "HIVE_RUNTIME/ai_decisions", ownerRole: "CHIEF_GOVERNANCE_OFFICER", calculation: "count(human_review_required AND reviewed_by IS NULL)", period: "DAILY", unit: "COUNT" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.dataAssets)
    .values([
      { id: fixedId(ID_PREFIX.dataAsset, "DA1"), code: "DA-IDENTITY", name: "Identity master", domain: "IDENTITY", systemOfRecord: "BEYU_OS", ownerRole: "PLATFORM_ADMIN", stewardRole: "CHIEF_GOVERNANCE_OFFICER", classification: "CONFIDENTIAL", containsPersonalData: true, lawfulBasis: "CONTRACT", retentionCode: "RET-CORP-10Y", lineageDownstream: ["DA-EMPLOYEE", "DA-FAMILY"], qualityRules: ["email unique", "party linked", "no orphan session"] },
      { id: fixedId(ID_PREFIX.dataAsset, "DA2"), code: "DA-EMPLOYEE", name: "Employee master", domain: "WORKFORCE", systemOfRecord: "SHARED_HCM", ownerRole: "HCM_DIRECTOR", stewardRole: "HCM_DIRECTOR", classification: "RESTRICTED", containsPersonalData: true, lawfulBasis: "CONTRACT", retentionCode: "RET-HR-7Y", lineageUpstream: ["DA-IDENTITY"], qualityRules: ["one employee per party", "employee_no unique"] },
      { id: fixedId(ID_PREFIX.dataAsset, "DA3"), code: "DA-OWNERSHIP", name: "Ownership registry", domain: "ORGANIZATION", systemOfRecord: "BEYU_OS", ownerRole: "CHIEF_GOVERNANCE_OFFICER", stewardRole: "GROUP_CFO", classification: "RESTRICTED", retentionCode: "RET-CORP-10Y", qualityRules: ["economic ≤ 100 per entity per period", "provenance mandatory"] },
      { id: fixedId(ID_PREFIX.dataAsset, "DA4"), code: "DA-FAMILY", name: "Family & beneficiary registry", domain: "FAMILY_OFFICE", systemOfRecord: "SHARED_FAMILY_OFFICE", ownerRole: "FAMILY_OFFICE_PRINCIPAL", stewardRole: "CHIEF_GOVERNANCE_OFFICER", classification: "HIGHLY_RESTRICTED", containsPersonalData: true, lawfulBasis: "LEGITIMATE_INTEREST_TRUST_ADMIN", retentionCode: "RET-TRUST-PERM", lineageUpstream: ["DA-IDENTITY"], qualityRules: ["lineage verified before eligibility", "entitlement ≤ 100"] },
      { id: fixedId(ID_PREFIX.dataAsset, "DA5"), code: "DA-AUDIT", name: "Enterprise audit ledger", domain: "AUDIT", systemOfRecord: "BEYU_OS", ownerRole: "AUDITOR", stewardRole: "CHIEF_GOVERNANCE_OFFICER", classification: "RESTRICTED", retentionCode: "RET-CORP-10Y", qualityRules: ["append only", "hash chain intact"] },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.architectureDecisions)
    .values([
      { id: fixedId(ID_PREFIX.adr, "ADR1"), adrNumber: 1, title: "BEYU OS is the single enterprise control plane", status: "ACCEPTED", context: "Multiple sector initiatives risked creating competing control planes for identity, governance and audit.", decision: "All enterprise-wide capabilities are implemented once in BEYU OS and consumed by Sector OSs through governed APIs, events and policies.", consequences: "Sector OSs are lighter and must integrate; enterprise capabilities gain a single hardening path.", alternatives: "Federated per-sector platforms (rejected: duplication, divergent truth, audit gaps).", securityAnalysis: "One identity, one authorization model, one audit ledger reduces attack surface and blind spots.", complianceAnalysis: "Single evidence trail for ISO/SOC/GDPR-aligned controls.", rollbackPlan: "None required; boundary reasserted through the OS registry.", decidedBy: "Architecture Review Board", decidedOn: "2024-01-15" },
      { id: fixedId(ID_PREFIX.adr, "ADR2"), adrNumber: 2, title: "Family Office is a first-class BEYU OS capability, not a separate OS", status: "ACCEPTED", context: "A standalone Family Office OS was proposed.", decision: "Family Office remains inside BEYU OS with the highest classification tier and dedicated governance bodies.", consequences: "Family data inherits enterprise identity, audit and policy; no duplicate masters.", alternatives: "Separate OS (rejected: duplicate identity and governance, weaker audit).", securityAnalysis: "HIGHLY_RESTRICTED classification with named grants and MFA.", complianceAnalysis: "Trust law and privacy obligations centrally evidenced.", rollbackPlan: "Not applicable.", decidedBy: "Group Board", decidedOn: "2024-02-08" },
      { id: fixedId(ID_PREFIX.adr, "ADR3"), adrNumber: 3, title: "Tax Strategy Intelligence lives inside Finance OS", status: "ACCEPTED", context: "Proposal for a dedicated Tax OS.", decision: "Tax intelligence, calculation, compliance and governance workflows are Finance OS capabilities with jurisdiction-scoped knowledge.", consequences: "Prevents OS proliferation and keeps financial consequence authority unified.", alternatives: "Separate Tax OS (rejected).", securityAnalysis: "Tax positions inherit finance controls and maker/checker.", complianceAnalysis: "Jurisdiction gating prevents cross-border misapplication of national rules.", rollbackPlan: "Not applicable.", decidedBy: "Architecture Review Board", decidedOn: "2024-04-22" },
      { id: fixedId(ID_PREFIX.adr, "ADR4"), adrNumber: 4, title: "Hash-chained append-only audit ledger", status: "ACCEPTED", context: "Audit integrity must be demonstrable to regulators and auditors.", decision: "Audit and event records are append-only and hash-chained; verification is exposed as a system self-test.", consequences: "Mutations become detectable; storage grows monotonically and is partitioned over time.", alternatives: "Standard mutable audit table (rejected: not tamper-evident).", securityAnalysis: "Provides non-repudiation and detection of retro-active tampering.", complianceAnalysis: "Supports ISO 27001 A.8.15 and SOC 2 CC7 evidence expectations.", rollbackPlan: "Chain can be re-anchored with a documented genesis event.", decidedBy: "Architecture Review Board", decidedOn: "2024-06-30" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.regulatoryChanges)
    .values([
      { id: fixedId(ID_PREFIX.regulatoryChange, "RC1"), jurisdictionCode: "TZ", reference: "Finance Act 2025", title: "Adjustment to withholding tax on service fees", changeType: "AMENDMENT", summary: "Detected amendment affecting withholding on cross-border service fees. Requires governance assessment before any policy change.", publishedOn: "2025-07-01", effectiveFrom: "2025-07-01", impactedDomains: ["TAX", "FINANCE"], assessmentStatus: "UNDER_ASSESSMENT", ownerRole: "GROUP_CFO" },
      { id: fixedId(ID_PREFIX.regulatoryChange, "RC2"), jurisdictionCode: "TZ", reference: "Personal Data Protection (Collection and Processing) Regulations", title: "Controller registration renewal requirements", changeType: "NEW_REGULATION", summary: "New registration renewal cycle and DPO notification duties.", publishedOn: "2025-03-14", effectiveFrom: "2025-09-01", impactedDomains: ["PRIVACY", "COMPLIANCE"], assessmentStatus: "DETECTED", ownerRole: "CHIEF_GOVERNANCE_OFFICER" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.featureFlags)
    .values([
      { key: "noelia.tax_assessment", description: "Enable Noelia-assisted tax eligibility pre-screening (human review always required).", scope: "ENTERPRISE", enabled: true, ownerRole: "CHIEF_GOVERNANCE_OFFICER", updatedBy: "SEED" },
      { key: "waterfall.scenario_modelling", description: "Enable multi-scenario waterfall modelling in the control centre.", scope: "ENTERPRISE", enabled: true, ownerRole: "GROUP_CFO", updatedBy: "SEED" },
      { key: "sector.mining_os", description: "Expose the proposed Mining OS surface (registered, not built).", scope: "ENTERPRISE", enabled: false, ownerRole: "GROUP_CEO", updatedBy: "SEED" },
      { key: "security.step_up_mfa", description: "Require step-up authentication for high-risk permissions.", scope: "ENTERPRISE", enabled: true, ownerRole: "PLATFORM_ADMIN", updatedBy: "SEED" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.strategicObjectives)
    .values([
      { id: fixedId(ID_PREFIX.objective, "SO1"), tenantId: T.group, code: "SO-1", horizon: "2026", title: "Grow consolidated revenue to USD 40m", description: "Scale the three operating sectors while protecting margin discipline.", ownerRole: "GROUP_CEO", targetValue: "40000000", currentValue: "28560000", unit: "USD", status: "ON_TRACK" },
      { id: fixedId(ID_PREFIX.objective, "SO2"), tenantId: T.group, code: "SO-2", horizon: "2026", title: "Extend Health OS access to three additional regions", description: "Regional expansion of clinical capacity and telemedicine coverage.", ownerRole: "SECTOR_OPERATOR", targetValue: "3", currentValue: "1", unit: "REGIONS", status: "AT_RISK" },
      { id: fixedId(ID_PREFIX.objective, "SO3"), tenantId: T.group, code: "SO-3", horizon: "2026", title: "Zero critical audit findings", description: "Maintain a clean assurance record across all frameworks in scope.", ownerRole: "CHIEF_RISK_COMPLIANCE", targetValue: "0", currentValue: "1", unit: "FINDINGS", status: "AT_RISK" },
      { id: fixedId(ID_PREFIX.objective, "SO4"), tenantId: T.group, code: "SO-4", horizon: "2027", title: "Reduce single-jurisdiction revenue concentration below 60%", description: "Diversify into Kenya and DIFC-based advisory revenue.", ownerRole: "GROUP_CEO", targetValue: "60", currentValue: "71", unit: "PERCENT", status: "ON_TRACK" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.workflows)
    .values([
      {
        id: fixedId(ID_PREFIX.workflow, "WF_CAPITAL"),
        code: "WF-CAPITAL-APPROVAL",
        name: "Capital request approval",
        domain: "FINANCE",
        definition: [
          { step: 1, name: "Finance review", type: "APPROVAL", role: "GROUP_CFO", slaHours: 48, escalateToRole: "GROUP_CEO" },
          { step: 2, name: "Risk assessment", type: "TASK", role: "CHIEF_RISK_COMPLIANCE", slaHours: 72 },
          { step: 3, name: "Investment Committee decision", type: "APPROVAL", role: "INVESTMENT_COMMITTEE", slaHours: 168, escalateToRole: "GROUP_BOARD" },
          { step: 4, name: "Board ratification (reserved matter)", type: "APPROVAL", role: "GROUP_BOARD", slaHours: 336 },
        ],
        policyId: fixedId(ID_PREFIX.policy, "POL_ENT_CAPITAL"),
      },
      {
        id: fixedId(ID_PREFIX.workflow, "WF_TAX"),
        code: "WF-TAX-GOVERNANCE",
        name: "Tax position governance",
        domain: "TAX",
        definition: [
          { step: 1, name: "Eligibility assessment", type: "TASK", role: "GROUP_CFO", slaHours: 72 },
          { step: 2, name: "Qualified human review", type: "HUMAN_REVIEW", role: "TAX_GOVERNANCE_COMMITTEE", slaHours: 120 },
          { step: 3, name: "Documentation evidence lodged", type: "TASK", role: "GROUP_CFO", slaHours: 168 },
          { step: 4, name: "Committee approval", type: "APPROVAL", role: "TAX_GOVERNANCE_COMMITTEE", slaHours: 240 },
        ],
        policyId: fixedId(ID_PREFIX.policy, "POL_TAX_GOV"),
      },
      {
        id: fixedId(ID_PREFIX.workflow, "WF_AI_REVIEW"),
        code: "WF-AI-DECISION-REVIEW",
        name: "AI decision human review",
        domain: "AI",
        definition: [
          { step: 1, name: "Reviewer triage", type: "HUMAN_REVIEW", role: "CHIEF_GOVERNANCE_OFFICER", slaHours: 24, escalateToRole: "GROUP_CEO" },
          { step: 2, name: "Disposition recorded", type: "TASK", role: "CHIEF_GOVERNANCE_OFFICER", slaHours: 48 },
        ],
        policyId: fixedId(ID_PREFIX.policy, "POL_CONST_AI"),
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.tasks)
    .values([
      { id: fixedId(ID_PREFIX.task, "TSK1"), tenantId: T.group, title: "Close NHIF claim ageing exception", description: "Remediate the 60-day claim submission breach identified in the 2025-Q4 assessment.", assigneeUserId: fixedId(ID_PREFIX.user, "JOHN_MREMA"), assigneeRole: "CHIEF_RISK_COMPLIANCE", priority: "HIGH", dueAt: new Date("2026-02-28T00:00:00Z"), status: "IN_PROGRESS" },
      { id: fixedId(ID_PREFIX.task, "TSK2"), tenantId: T.group, title: "Ratify Health OS expansion (reserved matter)", description: "Board ratification required above USD 1,000,000.", assigneeUserId: fixedId(ID_PREFIX.user, "GRACE_KILELE"), assigneeRole: "CHIEF_GOVERNANCE_OFFICER", priority: "HIGH", dueAt: new Date("2026-01-31T00:00:00Z"), status: "OPEN" },
      { id: fixedId(ID_PREFIX.task, "TSK3"), tenantId: T.group, title: "Refresh transfer pricing documentation", description: "Address escalated risk ERM-003 before the filing deadline.", assigneeUserId: fixedId(ID_PREFIX.user, "DAUDI_MOSHI"), assigneeRole: "GROUP_CFO", priority: "HIGH", dueAt: new Date("2026-03-31T00:00:00Z"), status: "OPEN" },
      { id: fixedId(ID_PREFIX.task, "TSK4"), tenantId: T.group, title: "Quarterly DR restore test", description: "Execute BCP-DATA-02 restore test and verify the audit hash chain.", assigneeUserId: fixedId(ID_PREFIX.user, "PLATFORM_ADMIN"), assigneeRole: "PLATFORM_ADMIN", priority: "NORMAL", dueAt: new Date("2026-03-12T00:00:00Z"), status: "OPEN" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.notifications)
    .values([
      { id: fixedId(ID_PREFIX.notification, "N1"), tenantId: T.group, role: "GROUP_BOARD", channel: "IN_APP", urgency: "HIGH", subject: "Reserved matter awaiting ratification", body: "Capital request CAP-2025-004 (USD 1.8m) requires Group Board ratification.", linkHref: "/os/capital", classification: "RESTRICTED" },
      { id: fixedId(ID_PREFIX.notification, "N2"), tenantId: T.group, role: "CHIEF_RISK_COMPLIANCE", channel: "IN_APP", urgency: "HIGH", subject: "Risk above appetite", body: "ERM-003 residual score exceeds the approved appetite threshold.", linkHref: "/os/risk" },
      { id: fixedId(ID_PREFIX.notification, "N3"), tenantId: T.group, role: "CHIEF_GOVERNANCE_OFFICER", channel: "IN_APP", urgency: "NORMAL", subject: "Regulatory change detected", body: "Finance Act 2025 withholding amendment requires governance assessment.", linkHref: "/os/compliance" },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.anomalySignals)
    .values([
      { id: fixedId(ID_PREFIX.anomaly, "AN1"), tenantId: T.group, detector: "payments.duplicate_v2", signalType: "DUPLICATE_PAYMENT", subjectType: "PAYMENT_BATCH", subjectId: "PB-2025-11-004", severity: "HIGH", confidence: "0.9120", evidence: { matchedFields: ["supplier", "amount", "invoiceRef"], amount: 48200, currency: "USD", occurrences: 2 }, assignedRole: "GROUP_CFO" },
      { id: fixedId(ID_PREFIX.anomaly, "AN2"), tenantId: T.group, detector: "identity.privilege_drift", signalType: "UNUSUAL_GRANT", subjectType: "ROLE_ASSIGNMENT", subjectId: "RAS-SAMPLE-9931", severity: "MEDIUM", confidence: "0.7400", evidence: { grantedOutsideChangeWindow: true, privileged: true }, assignedRole: "PLATFORM_ADMIN" },
      { id: fixedId(ID_PREFIX.anomaly, "AN3"), tenantId: T.group, detector: "procurement.conflict_of_interest", signalType: "CONFLICT_OF_INTEREST", subjectType: "SUPPLIER", subjectId: "SUP-2211", severity: "MEDIUM", confidence: "0.6800", evidence: { sharedDirector: true, source: "ownership_registry" }, assignedRole: "CHIEF_GOVERNANCE_OFFICER" },
    ])
    .onConflictDoNothing();

  console.log(`BEYU OS bootstrap complete (${TODAY}). Bootstrap credentials were not printed.`);
  await pool.end();
}

main().catch(async (err) => {
  console.error("Seed failed:", err);
  await pool.end();
  process.exit(1);
});
