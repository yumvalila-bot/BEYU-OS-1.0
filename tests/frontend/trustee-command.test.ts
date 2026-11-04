/**
 * BEYU OS — TRUSTEE COMMAND certification.
 *
 * WHAT CHANGED, AND WHY THIS SUITE EXISTS
 *   "Trustee Command" already existed — as a dashboard inside the Health OS
 *   sector SPA (`sectors/health/src/views/Governance.tsx`). It showed HARD-CODED
 *   trustees ("Founding Trustee · Chair"), hard-coded resolutions ("TR-2026-04")
 *   and hard-coded distribution figures to anyone who picked the trustee demo
 *   role. It was demonstration data, and it was reachable from a sector surface
 *   that has no authority over the Family Trust.
 *
 *   The upgrade replaces it with a real BEYU OS control-plane capability at
 *   `/os/family/trustee-command`, composed from registers that already own the
 *   facts: `entity_appointments` (trustee identity), `governance_bodies`
 *   (reserved matters, quorum), `trust_instruments` / `trust_provisions` /
 *   `trust_decisions` / `trust_distributions`, `legal_entities` and the
 *   CAP_POSTING activation gate.
 *
 * THE INVARIANTS THIS SUITE PINS
 *   A. NO NEW AUTHORITY. Trustee Command never becomes an OS, never adds a
 *      permission, and grants nothing. It is gated by the EXISTING
 *      `familyoffice:trust.read` capability — the same one the trust API uses.
 *   B. NO SECOND WRITE PATH. The page and the API are read-only; there is no
 *      POST sibling and no `.insert/.update/.delete` in either file. Every
 *      consequential act stays in `trust-governance-service.ts`.
 *   C. NO FABRICATED STATE. A reserved matter with no governed record type
 *      reports NOT_INSTRUMENTED; provisions without a ratified legal-effect
 *      reference are counted INERT; enforceability is never assumed.
 *   D. AN APPOINTMENT IS NOT A PERMISSION. The model states it structurally.
 *   E. FINANCIAL POSTING IS REPORTED, NEVER OPENED. The CAP_POSTING verdict is
 *      surfaced from the activation gate and the page contains no posting path.
 *
 * The pure-model tests run with no database and no server. The transport tests
 * follow the repository convention in tests/helpers/http.ts: skip when no server
 * is running, fail when one was explicitly configured and is not answering.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TRUSTEE_COMMAND_BOUNDARY,
  TRUSTEE_DECISION_TYPES,
  buildTrusteeCommandModel,
  enterpriseTree,
  summariseDistributions,
  summariseInstruments,
  summariseProvisions,
  summariseReservedMatters,
  trusteeBindings,
  type PostingLock,
} from "@/lib/family/trustee-command";
import { TRUSTEE_RESERVED_MATTERS } from "@/lib/family/model";
import { CAPABILITY_IA, visible } from "@/app/os/capabilities";
import { PERMISSIONS } from "@/lib/constants";
import type { Principal } from "@/lib/authz";

const ROOT = process.cwd();
const source = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

/** Source with comments stripped — comments must not satisfy an assertion. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function principal(...permissions: (keyof typeof PERMISSIONS)[]): Principal {
  return {
    userId: "usr-test",
    partyId: "pty-test",
    email: "test@beyu.invalid",
    displayName: "Test Principal",
    tenantId: "ten-test",
    tenantCode: "TEST",
    tenantType: "GROUP",
    roles: ["TEST_ROLE"],
    permissions: new Set(permissions),
    clearance: "HIGHLY_RESTRICTED",
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "ses-test",
    riskScore: 0,
    emergencyPermissions: [],
    // `can()` authorizes from the canonical inseparable authority tuples, never
    // from the compatibility permission summary alone.
    authorityGrants: permissions.map((permission, index) => ({
      sourceId: `test-grant-${index}`,
      source: "ROLE_ASSIGNMENT" as const,
      role: "TEST_ROLE",
      permission,
      tenantId: "ten-test",
      legalEntityId: null,
      countryCode: null,
      validFrom: null,
      validTo: null,
    })),
  };
}

const LOCKED_POSTING: PostingLock = {
  capabilityCode: "CAP_POSTING",
  executable: false,
  activationStatus: "LOCKED",
  reason: "CAP_POSTING is locked pending P1, P6, P7, P9.",
  blockedBy: ["P1", "P6", "P7", "P9"],
};

const trust = {
  id: "LEN_BEYU_FAMILY_TRUST",
  code: "BEYU-FT",
  legalName: "BEYU Family Trust",
  entityType: "TRUST",
  countryCode: "MU",
  status: "ACTIVE",
  functionalCurrency: "USD",
  jurisdictions: [],
};

describe("A. Trustee Command is a capability, never an OS and never a grant", () => {
  it("is advertised exactly once, in the Family Office domains group, gated by familyoffice:trust.read", () => {
    const items = CAPABILITY_IA.flatMap((group) => group.items);
    const entries = items.filter((item) => item.href === "/os/family/trustee-command");
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.label).toBe("Trustee Command");
    expect(entry.visibility).toEqual({ kind: "permission", permission: "familyoffice:trust.read" });
    expect(entry.label.endsWith(" OS")).toBe(false);

    const group = CAPABILITY_IA.find((candidate) =>
      candidate.items.some((item) => item.href === "/os/family/trustee-command"),
    );
    expect(group?.id).toBe("family-office-domains");
  });

  it("never appears as a Sector OS or as a second control-plane route", () => {
    expect(CAPABILITY_IA.find((g) => g.id === "sector")?.items.map((i) => i.href))
      .not.toContain("/os/family/trustee-command");
    expect(CAPABILITY_IA.find((g) => g.id === "executive")?.items.map((i) => i.href))
      .not.toContain("/os/family/trustee-command");
  });

  it("adds no permission to the constitutional catalogue", () => {
    // The capability reuses the EXISTING trust grant. A new permission would
    // need an explicit constitutional decision, not a feature branch.
    expect(PERMISSIONS).toHaveProperty("familyoffice:trust.read");
    expect(PERMISSIONS).not.toHaveProperty("familyoffice:trustee.read");
    expect(PERMISSIONS).not.toHaveProperty("trustee:command.read");
    expect(Object.keys(PERMISSIONS).filter((code) => code.startsWith("trustee:"))).toEqual([]);
  });

  it("is visible to a holder of the trust grant and invisible to everyone else", () => {
    const entry = CAPABILITY_IA.flatMap((g) => g.items).find(
      (item) => item.href === "/os/family/trustee-command",
    )!;
    expect(visible(principal("familyoffice:trust.read"), entry)).toBe(true);
    expect(visible(principal("family:member.read"), entry)).toBe(false);
    expect(visible(principal(), entry)).toBe(false);
  });
});

describe("B. read-only by construction — no second write path", () => {
  const page = () => code(source("src", "app", "os", "family", "trustee-command", "page.tsx"));
  const route = () => code(source("src", "app", "api", "v1", "family-office", "trustee-command", "route.ts"));
  const service = () => code(source("src", "lib", "family", "trustee-command-service.ts"));
  const model = () => code(source("src", "lib", "family", "trustee-command.ts"));

  it("the page re-authorizes on deep link and never writes", () => {
    expect(page()).toMatch(/requireAccess\(/);
    expect(page()).toContain('"familyoffice:trust.read"');
    expect(page()).not.toMatch(/\.(insert|update|delete)\(/);
    expect(page()).not.toMatch(/\bdb\./);
  });

  it("the API exposes GET only — no mutation sibling", () => {
    expect(route()).toMatch(/export async function GET/);
    expect(route()).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(route()).toContain('permission: TRUSTEE_TRUST_CAPABILITY');
  });

  it("the service and model contain no write statement at all", () => {
    for (const text of [service(), model()]) {
      expect(text).not.toMatch(/\.(insert|update|delete)\(/);
      expect(text).not.toMatch(/withAuditTransaction|db\.transaction/);
      // Reading is allowed; posting to Finance is not, from any layer here.
      expect(text).not.toMatch(/postJournal|CAP_POSTING\s*=/);
    }
  });

  it("the service imports the canonical capability primitive rather than re-deciding authorization", () => {
    const text = service();
    expect(text).toMatch(/from "@\/lib\/authz"/);
    expect(text).toContain("can(principal, TRUSTEE_TRUST_CAPABILITY");
    expect(text).toContain("tenantScopeIds");
    expect(text).toContain("classificationsAtOrBelow");
  });

  it("refuses an entity-scoped grant rather than widening it", () => {
    const text = service();
    expect(text).toContain("TRUSTEE_COMMAND_ENTITY_SCOPE_UNSUPPORTED");
    expect(text).toMatch(/principal\.entityScope\.length > 0/);
  });
});

describe("C. no fabricated state", () => {
  it("every constitutional reserved matter appears, instrumented or not", () => {
    const rows = summariseReservedMatters({ declaredByBody: [], decisions: [] });
    expect(rows.map((row) => row.matter)).toEqual([...TRUSTEE_RESERVED_MATTERS]);
    expect(rows).toHaveLength(TRUSTEE_RESERVED_MATTERS.length);
  });

  it("reports NOT_INSTRUMENTED where the trust schema has no governed record type", () => {
    const rows = summariseReservedMatters({ declaredByBody: [], decisions: [] });
    const byMatter = new Map(rows.map((row) => [row.matter, row]));
    for (const matter of ["TRUST_AMENDMENT", "TRUST_INVESTMENT", "BENEFICIARY_DETERMINATION", "TRUST_PROTECTOR_EXERCISE"] as const) {
      expect(byMatter.get(matter)?.state, matter).toBe("NOT_INSTRUMENTED");
      expect(byMatter.get(matter)?.evidenceTypes).toEqual([]);
    }
  });

  it("derives review state from the decision rows it is given", () => {
    const approved = summariseReservedMatters({
      declaredByBody: ["TRUST_DISTRIBUTION"],
      decisions: [{ decisionType: "DISTRIBUTION_APPROVAL", status: "APPROVED" }],
    }).find((row) => row.matter === "TRUST_DISTRIBUTION")!;
    expect(approved.state).toBe("RECORDED");
    expect(approved.recordedActs).toBe(1);
    expect(approved.reservedByBody).toBe(true);

    const pending = summariseReservedMatters({
      declaredByBody: [],
      decisions: [{ decisionType: "TRUSTEE_APPOINTMENT", status: "PROPOSED" }],
    }).find((row) => row.matter === "TRUSTEE_APPOINTMENT")!;
    expect(pending.state).toBe("IN_REVIEW");
    expect(pending.reservedByBody).toBe(false);
    expect(pending.requires.join(" ")).toContain("not declared in the body's reserved-matters charter");

    const disputed = summariseReservedMatters({
      declaredByBody: [],
      decisions: [{ decisionType: "TRUSTEE_REMOVAL", status: "DISPUTED" }],
    }).find((row) => row.matter === "TRUSTEE_REMOVAL")!;
    expect(disputed.state).toBe("DISPUTED");

    const empty = summariseReservedMatters({ declaredByBody: ["TRUSTEE_APPOINTMENT"], decisions: [] })
      .find((row) => row.matter === "TRUSTEE_APPOINTMENT")!;
    expect(empty.state).toBe("NOT_RECORDED");
  });

  it("ignores an unknown decision type instead of guessing a matter for it", () => {
    const rows = summariseReservedMatters({
      declaredByBody: [],
      decisions: [{ decisionType: "NOT_A_TYPE", status: "APPROVED" }],
    });
    expect(rows.every((row) => row.recordedActs === 0)).toBe(true);
  });

  it("counts provisions INERT without a ratified legal-effect reference", () => {
    const posture = summariseProvisions([
      { provisionType: "SPENDTHRIFT", legalEffectStatus: "INERT", legalEffectReference: null, enforceabilityAssumed: false },
      { provisionType: "NO_CONTEST", legalEffectStatus: "LEGAL_REVIEWED", legalEffectReference: "RES-1", enforceabilityAssumed: false },
      { provisionType: "SPENDTHRIFT", legalEffectStatus: "UNDER_LEGAL_REVIEW", legalEffectReference: "RES-2", enforceabilityAssumed: false },
      // A row that broke the rule must be counted, never hidden.
      { provisionType: "OTHER", legalEffectStatus: "INERT", legalEffectReference: null, enforceabilityAssumed: true },
    ]);
    expect(posture.total).toBe(4);
    expect(posture.inert).toBe(2);
    expect(posture.legallyEffective).toBe(1);
    expect(posture.underReview).toBe(1);
    expect(posture.enforceabilityAssumed).toBe(1);
    expect(posture.byType.SPENDTHRIFT).toBe(2);
  });

  it("summarises instruments by status without inventing an effective version", () => {
    const posture = summariseInstruments([
      { id: "A", instrumentName: "Deed", instrumentType: "DEED", version: 1, status: "EXECUTED", legalReviewStatus: "LEGAL_REVIEWED", effectiveDate: "2014-03-11" },
      { id: "B", instrumentName: "Restatement", instrumentType: "RESTATEMENT", version: 2, status: "DRAFT", legalReviewStatus: "REQUIRES_LEGAL_REVIEW", effectiveDate: null },
    ]);
    expect(posture.total).toBe(2);
    expect(posture.byStatus).toEqual({ EXECUTED: 1, DRAFT: 1 });
    expect(posture.effectiveCount).toBe(1);
    expect(posture.legalReviewPending).toBe(1);
    expect(posture.latest?.id).toBe("B");

    const none = summariseInstruments([]);
    expect(none.latest).toBeNull();
    expect(none.total).toBe(0);
  });

  it("separates distribution DECISION records from money movement", () => {
    const posture = summariseDistributions([
      { distributionType: "DISCRETIONARY", status: "EXECUTED", amount: "1000.00", currency: "USD", financeRecordRef: null },
      { distributionType: "MANDATORY", status: "EXECUTED", amount: "500.50", currency: "USD", financeRecordRef: "FIN-1" },
      { distributionType: "EDUCATION", status: "PROPOSED", amount: "250.00", currency: "TZS", financeRecordRef: null },
    ]);
    expect(posture.total).toBe(3);
    expect(posture.executed).toBe(2);
    expect(posture.proposed).toBe(1);
    // Executed but not yet in Finance OS: money truth is still elsewhere.
    expect(posture.awaitingFinance).toBe(1);
    expect(posture.byCurrency).toEqual({ TZS: "250.00", USD: "1500.50" });
  });
});

describe("D. an appointment is not a permission", () => {
  it("keeps only current TRUSTEE appointments and marks the boundary structurally", () => {
    const bindings = trusteeBindings([
      { partyId: "P1", displayName: "Amani Beyu", role: "TRUSTEE", appointedOn: "2014-03-11", resignedOn: null, authorityLimit: null, resolutionRef: "R-1" },
      { partyId: "P2", displayName: "Former Trustee", role: "TRUSTEE", appointedOn: "2014-03-11", resignedOn: "2020-01-01", authorityLimit: null, resolutionRef: "R-2" },
      { partyId: "P3", displayName: "A Protector", role: "PROTECTOR", appointedOn: "2015-01-01", resignedOn: null, authorityLimit: null, resolutionRef: "R-3" },
      { partyId: "P4", displayName: "Neema Beyu", role: "TRUSTEE", appointedOn: "2016-06-01", resignedOn: null, authorityLimit: "100000.00", resolutionRef: null },
    ]);
    expect(bindings.map((binding) => binding.partyId)).toEqual(["P1", "P4"]);
    for (const binding of bindings) {
      expect(binding.appointmentIsNotPermission).toBe(true);
      expect(binding.registryRole).toBe("TRUSTEE");
    }
  });

  it("computes quorum from canonical appointments and states it is availability, not a decision", () => {
    const model = buildTrusteeCommandModel({
      now: new Date("2026-11-04T00:00:00Z"),
      trust,
      appointments: [
        { partyId: "P1", displayName: "A", role: "TRUSTEE", appointedOn: "2014-03-11", resignedOn: null, authorityLimit: null, resolutionRef: null },
      ],
      body: { code: "TRUSTEE_BOARD", quorumMinimum: 2, majorityRule: "UNANIMOUS" },
      declaredReservedMatters: ["TRUST_DISTRIBUTION", "TRUST_AMENDMENT", "NOT_A_MATTER"],
      decisions: [],
      instruments: [],
      provisions: [],
      distributions: [],
      entities: [],
      posting: LOCKED_POSTING,
    });
    expect(model.quorum?.quorumMet).toBe(false);
    expect(model.quorum?.activeTrustees).toBe(1);
    expect(model.quorum?.note).toContain("availability to decide, not a decision");
    // Declared matters are filtered to the canonical vocabulary.
    expect(model.counts.reservedMattersDeclared).toBe(2);
  });

  it("returns the structural guarantees on every model", () => {
    const model = buildTrusteeCommandModel({
      now: new Date("2026-11-04T00:00:00Z"),
      trust,
      appointments: [],
      body: null,
      declaredReservedMatters: [],
      decisions: [],
      instruments: [],
      provisions: [],
      distributions: [],
      entities: [],
      posting: LOCKED_POSTING,
    });
    expect(model.advisoryOnly).toBe(true);
    expect(model.executesNothing).toBe(true);
    expect(model.grantsAuthority).toBe(false);
    expect(model.boundary).toBe(TRUSTEE_COMMAND_BOUNDARY);
    expect(model.quorum).toBeNull();
    expect(model.trusteeBindings).toEqual([]);
  });
});

describe("E. financial posting is reported, never opened", () => {
  it("carries the activation gate's verdict verbatim into the rails", () => {
    const model = buildTrusteeCommandModel({
      now: new Date("2026-11-04T00:00:00Z"),
      trust,
      appointments: [],
      body: null,
      declaredReservedMatters: [],
      decisions: [],
      instruments: [],
      provisions: [],
      distributions: [],
      entities: [],
      posting: LOCKED_POSTING,
    });
    expect(model.rails.financialPosting).toEqual(LOCKED_POSTING);
    expect(model.rails.financialPosting.executable).toBe(false);
    expect(model.rails.financialPosting.blockedBy).toEqual(["P1", "P6", "P7", "P9"]);
    expect(model.rails.aiMayApprove).toBe(false);
    expect(model.rails.lastAiPermittedStep).toBe("CHECK_RISK");
    expect(model.rails.superiorInstruments[0]).toBe("APPLICABLE_LAW");
  });

  it("the page renders the lock state and contains no posting or approval path", () => {
    const text = code(source("src", "app", "os", "family", "trustee-command", "page.tsx"));
    expect(text).toContain("financialPosting.executable");
    expect(text).not.toMatch(/postJournal|requireCapability|CAP_POSTING\s*=/);
    expect(text).not.toMatch(/approveResolution|recordTrustDecision|proposeTrustDistribution/);
    // No form element: nothing to submit, therefore nothing to execute.
    expect(text).not.toMatch(/<form|<button/);
  });

  it("the decision-gate rail states that AI may not reach APPROVE", () => {
    const text = code(source("src", "lib", "family", "trustee-command.ts"));
    expect(text).toContain("LAST_AI_PERMITTED_STEP");
    expect(text).toContain("aiMayApprove: false");
  });
});

describe("enterprise map", () => {
  const entities = [
    { id: "TRUST", code: "FT", legalName: "BEYU Family Trust", entityType: "TRUST", parentEntityId: null, countryCode: "MU", status: "ACTIVE" },
    { id: "HOLD", code: "HOLD", legalName: "BEYU Holdings", entityType: "HOLDING", parentEntityId: "TRUST", countryCode: "MU", status: "ACTIVE" },
    { id: "TZ", code: "TZ", legalName: "BEYU Tanzania", entityType: "COUNTRY_HOLDING", parentEntityId: "HOLD", countryCode: "TZ", status: "ACTIVE" },
    { id: "HEALTH", code: "HL", legalName: "BEYU Health Ltd", entityType: "OPERATING_COMPANY", parentEntityId: "TZ", countryCode: "TZ", status: "ACTIVE" },
  ];

  it("builds the hierarchy beneath the trust with depth", () => {
    const tree = enterpriseTree(entities, "TRUST");
    expect(tree).toHaveLength(1);
    expect(tree[0]!.code).toBe("FT");
    expect(tree[0]!.children[0]!.code).toBe("HOLD");
    expect(tree[0]!.children[0]!.children[0]!.code).toBe("TZ");
    expect(tree[0]!.children[0]!.children[0]!.children[0]!.code).toBe("HL");
    expect(tree[0]!.children[0]!.children[0]!.children[0]!.depth).toBe(3);
  });

  it("attaches an orphan beneath the trust instead of dropping it", () => {
    const tree = enterpriseTree(
      [...entities, { id: "ORPHAN", code: "OR", legalName: "Orphan Ltd", entityType: "SUBSIDIARY", parentEntityId: "MISSING", countryCode: "TZ", status: "ACTIVE" }],
      "TRUST",
    );
    expect(tree[0]!.children.map((child) => child.code).sort()).toEqual(["HOLD", "OR"]);
  });

  it("survives a corrupt parent pointer without hanging or duplicating", () => {
    const tree = enterpriseTree(
      [
        { id: "TRUST", code: "FT", legalName: "Trust", entityType: "TRUST", parentEntityId: "SELF", countryCode: "MU", status: "ACTIVE" },
        { id: "A", code: "A", legalName: "A", entityType: "HOLDING", parentEntityId: "B", countryCode: "MU", status: "ACTIVE" },
        { id: "B", code: "B", legalName: "B", entityType: "HOLDING", parentEntityId: "A", countryCode: "MU", status: "ACTIVE" },
      ],
      "TRUST",
    );
    const codes: string[] = [];
    const visit = (nodes: ReturnType<typeof enterpriseTree>) => {
      for (const node of nodes) {
        codes.push(node.code);
        visit(node.children);
      }
    };
    visit(tree);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("the demonstration dashboard is replaced, not duplicated", () => {
  it("keeps the sector SPA's demo view out of the control plane", () => {
    const demo = source("sectors", "health", "src", "views", "Governance.tsx");
    // The demo remains where it was (a sector demonstration), but no control-
    // plane file may import it or reproduce its hard-coded trustees.
    expect(demo).toContain("Trustee Command");
    // `spa-content.ts` is the BUILT Health sector bundle, generated by
    // scripts/build-health-spa.mjs from the sector's own demo views. It is not
    // control-plane source, so it is excluded exactly as the other frontend
    // suites exclude it.
    const appFiles = walk(join(ROOT, "src", "app")).filter(
      (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith("spa-content.ts"),
    );
    for (const file of appFiles) {
      const text = code(readFileSync(file, "utf8"));
      expect(text, file).not.toContain("sectors/health/src/views/Governance");
      expect(text, file).not.toMatch(/EMP-1000\d/);
      expect(text, file).not.toMatch(/TR-2026-0\d/);
    }
  });

  it("the page states its own read-only boundary in plain language", () => {
    const text = source("src", "app", "os", "family", "trustee-command", "page.tsx");
    expect(text).toContain("it decides nothing");
    expect(text).toContain("An appointment is a fiduciary office");
    expect(text).toContain("Authority is not inherited by convenience.");
  });

  it("maps reserved matters only to decision types the trust service actually writes", () => {
    // The mapping may not borrow a decision type that the governed service never
    // records, because that would imply evidence the repository cannot produce.
    const service = code(source("src", "lib", "family", "office", "trust-governance-service.ts"));
    for (const type of TRUSTEE_DECISION_TYPES) {
      expect(service, `${type} must be a governed decision type`).toContain(`"${type}"`);
    }
    expect(TRUSTEE_DECISION_TYPES).toContain("DISTRIBUTION_APPROVAL");
  });
});
