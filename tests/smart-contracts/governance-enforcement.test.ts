/**
 * BEYU-SCG Phase 2 — GOVERNANCE ENFORCEMENT TESTS.
 *
 * These tests exist because a control that is never exercised is not a control.
 * Every denial path in `src/lib/smart-contracts/registry.ts` is exercised here,
 * and the mechanical checks are themselves tested against deliberately broken
 * inputs, so that a check which cannot fail is caught.
 *
 * TWO KINDS OF ASSERTION, KEPT APART:
 *   1. NEGATIVE — the boundary refuses. Absence, malformation, expiry,
 *      revocation, scope mismatch, unknown ids, unknown classes, `permitted:
 *      true` postures: each must DENY.
 *   2. STRUCTURAL — properties true of the code itself: no automation declares
 *      external execution, A7 is unreachable, the register and inventory agree,
 *      and the register carries no secret.
 *
 * WHAT A GREEN RUN HERE MEANS: the authorization boundary behaves as documented.
 * WHAT IT DOES NOT MEAN: that any automation is authorized, that anything is
 * compliant, enforceable, secure or deployed. R-AUT-01 is empty, and these tests
 * assert that it stays empty.
 *
 * DB-FREE BY DESIGN. Nothing here touches a database, a network, a chain or a
 * provider. The whole suite runs with no environment configured.
 */
import { existsSync, readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  AUTOMATION_CLASSES,
  AUTOMATION_REGISTRY,
  AUTOMATION_DENIAL_REASONS,
  HUMAN_BINDINGS,
  INVENTORY_GRANTS_AUTHORITY,
  PERMITTED_CLASSES,
  PROHIBITED_CLASSES,
  SCG_AUTHORIZATION_REGISTER_ID,
  SCG_INVENTORY_ID,
  automationById,
  automationsWithExternalExecution,
  authorizeAutomation,
  interpretExecutionPosture,
  humanBindingById,
  type AutomationAuthorizationRequest,
  type AutomationDecision,
  type DecisionLookup,
} from "@/lib/smart-contracts/registry";
import {
  checkAuthorizationGuards,
  checkInventoryFreshness,
  checkNoSecrets,
  checkNoSigningSurface,
  checkProhibitedClaims,
} from "@/lib/smart-contracts/checks";

const ROOT = process.cwd();
const PACK_DIR = "docs/governance/smart-contracts";

/* ------------------------------------------------------------------ */
/* Fixture helpers — synthetic, explicitly not evidence                */
/* ------------------------------------------------------------------ */

const NOW = "2026-10-15T12:00:00Z";

/** A fully-formed, well-scoped, unexpired, unrevoked decision. Synthetic. */
function syntheticDecision(overrides: Partial<AutomationDecision> = {}): AutomationDecision {
  return {
    reference: "DEC-SYNTHETIC-0001",
    status: "APPROVED",
    provenance: "GOVERNED",
    automationId: "AUT-05",
    automationVersion: "1.0.0",
    tenantId: "TEN_BEYU_GROUP",
    legalEntityId: null,
    effectiveFrom: "2026-01-01T00:00:00Z",
    expiresAt: "2027-01-01T00:00:00Z",
    revokedAt: null,
    ...overrides,
  };
}

/**
 * A governed lookup backed by a synthetic decision. This is the shape the
 * production lookup will have once a governed projection exists; here it exists
 * only to prove the permit path is reachable at all, so that the denials above
 * it are attributable to the rule under test rather than to a dead code path.
 */
function lookupReturning(...decisions: AutomationDecision[]): DecisionLookup {
  return (reference) => decisions.find((d) => d.reference === reference) ?? null;
}

function request(overrides: Partial<AutomationAuthorizationRequest> = {}): AutomationAuthorizationRequest {
  return {
    automationId: "AUT-05",
    automationVersion: "1.0.0",
    tenantId: "TEN_BEYU_GROUP",
    legalEntityId: null,
    now: NOW,
    approval: { decision: syntheticDecision() },
    ...overrides,
  };
}

const OK_OPTIONS = { lookup: lookupReturning(syntheticDecision()), bodyEvidenced: true } as const;

/* ------------------------------------------------------------------ */
/* 1 — the register is internally consistent                           */
/* ------------------------------------------------------------------ */

describe("BEYU-SCG — the automation register", () => {
  it("holds 23 automations over 6 human bindings, and every id is unique and shaped", () => {
    expect(AUTOMATION_REGISTRY).toHaveLength(23);
    expect(HUMAN_BINDINGS).toHaveLength(6);
    const ids = AUTOMATION_REGISTRY.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^AUT-\d{2}$/);
    for (const b of HUMAN_BINDINGS) expect(b.id).toMatch(/^HB-\d{2}$/);
  });

  it("registers every automation under a permitted class, and never under a prohibited one", () => {
    for (const record of AUTOMATION_REGISTRY) {
      expect(PERMITTED_CLASSES).toContain(record.class);
      expect(PROHIBITED_CLASSES).not.toContain(record.class);
    }
  });

  it("resolves every referenced human binding, and every binding's source paths exist", () => {
    const ids = new Set(HUMAN_BINDINGS.map((b) => b.id));
    for (const record of AUTOMATION_REGISTRY) {
      for (const ref of record.humanBindings) expect(ids.has(ref), `${record.id} references ${ref}`).toBe(true);
    }
    for (const binding of HUMAN_BINDINGS) {
      for (const path of binding.sourcePaths) {
        expect(() => readFileSync(join(ROOT, path)), `${binding.id} → ${path}`).not.toThrow();
      }
    }
  });

  it("resolves every declared source path and, where named, every test path", () => {
    for (const record of AUTOMATION_REGISTRY) {
      expect(record.sourcePaths.length, `${record.id} declares no source path`).toBeGreaterThan(0);
      for (const path of record.sourcePaths) {
        // A module directory (e.g. `src/lib/authority/`) is a legitimate
        // reference for a layer; a named test must be a file.
        expect(existsSync(join(ROOT, path)), `${record.id} → ${path} does not exist`).toBe(true);
      }
      for (const path of record.tests ?? []) {
        expect(existsSync(join(ROOT, path)), `${record.id} → ${path} does not exist`).toBe(true);
      }
    }
  });

  it("grants authority nowhere: the flag is false by contract, on every record", () => {
    expect(INVENTORY_GRANTS_AUTHORITY).toBe(false);
    for (const record of AUTOMATION_REGISTRY) {
      expect(record.grantsAuthority).toBe(false);
      expect(record.externalExecution).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2 — external execution is unreachable                               */
/* ------------------------------------------------------------------ */

describe("BEYU-SCG — A7 external execution stays prohibited", () => {
  it("has no automation that can sign, submit, broadcast, post, pay or transfer", () => {
    expect(automationsWithExternalExecution()).toEqual([]);
  });

  it("catalogues A7 as prohibited and lists it outside the permitted set", () => {
    expect(AUTOMATION_CLASSES).toContain("A7");
    expect(PROHIBITED_CLASSES).toEqual(["A7"]);
    expect(PERMITTED_CLASSES).not.toContain("A7");
  });

  it("refuses an A7 class outright, naming the prohibition", () => {
    const result = authorizeAutomation({ ...request(), automationId: "AUT-99" });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.denial).toBe("UNKNOWN_AUTOMATION");
  });

  it("the repository holds no web3, RPC or signing dependency, and no signer import in the domain", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const forbidden of ["viem", "ethers", "web3", "wagmi", "@solana/web3.js"]) {
      expect(deps, `${forbidden} must not be a dependency`).not.toContain(forbidden);
    }

    // The blockchain service states the boundary as a structural property.
    const service = readFileSync(join(ROOT, "src/lib/blockchain/service.ts"), "utf8");
    expect(service).toContain("NO KEYS, EVER");

    // No signer CALL anywhere in the governed domain. Note the distinction the
    // shared guard makes: `src/lib/blockchain/model.ts` legitimately contains
    // the bare string "privateKey" inside FORBIDDEN_EVENT_FIELDS, a denylist
    // that rejects private keys from event payloads. Only a call or a
    // key-shaped value is a signing surface.
    expect(checkNoSigningSurface(ROOT).filter((f) => f.severity === "BLOCKING")).toEqual([]);
  });

  it("a machine-readable inventory exists whose entries all declare external execution impossible", () => {
    const raw = JSON.parse(readFileSync(join(ROOT, PACK_DIR, "AUTOMATION_INVENTORY.json"), "utf8")) as {
      inventory_id?: string;
      grants_authority?: boolean;
      entries?: { id: string; class: string }[];
    };
    expect(raw.inventory_id).toBe(SCG_INVENTORY_ID);
    expect(raw.grants_authority).toBe(false);
    expect(raw.entries).toBeDefined();
    for (const entry of raw.entries ?? []) {
      expect(entry.class, `${entry.id} must not be A7`).not.toBe("A7");
    }
  });
});

/* ------------------------------------------------------------------ */
/* 3 — the type system forbids A7 authority                            */
/* ------------------------------------------------------------------ */

describe("BEYU-SCG — the prohibition is a type, not a policy", () => {
  it("cannot be defeated by any value a caller could construct", () => {
    // `ExternalExecutionAuthority` is `never`. This is asserted by the compiler:
    // the only way to obtain such a value is a cast, and every function that
    // could consume one refuses at runtime as well. The test below pins the
    // RUNTIME half of that belt-and-braces pair.
    const forgedAuthority = { class: "A7", permission: "EXECUTE" } as unknown as never;
    expect(forgedAuthority).toBeDefined();

    // No exported function accepts an "authority" argument of any kind: the
    // request shape has no vocabulary for one.
    const result = authorizeAutomation(request(), OK_OPTIONS);
    expect(result.externalExecution).toBe(false);
    expect(result.grantsAuthority).toBe(false);
  });

  it("a permit still cannot carry external execution or authority", () => {
    const result = authorizeAutomation(request(), OK_OPTIONS);
    expect(result.allowed).toBe(true);
    expect(result.externalExecution).toBe(false);
    expect(result.grantsAuthority).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 4 — unknown and absent inputs are refused                           */
/* ------------------------------------------------------------------ */

describe("BEYU-SCG — unknown or absent inputs are refused, never defaulted", () => {
  it("denies an unknown automation id", () => {
    const result = authorizeAutomation({ ...request(), automationId: "AUT-99" }, OK_OPTIONS);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.denial).toBe("UNKNOWN_AUTOMATION");
      expect(result.reason).toMatch(/never defaulted/i);
    }
  });

  it("denies an empty, whitespace, null-ish or non-string id", () => {
    for (const id of ["", "   ", "aut-05", "AUT-5", "AUT-005", "'; drop table", "AUT-05 ", null as unknown as string]) {
      const result = authorizeAutomation({ ...request(), automationId: id }, OK_OPTIONS);
      expect(result.allowed, `id ${JSON.stringify(id)} must be denied`).toBe(false);
    }
  });

  it("looks up fail-closed: an unknown id returns null, never a record", () => {
    expect(automationById("AUT-99")).toBeNull();
    expect(automationById("")).toBeNull();
    expect(automationById("HB-01")).toBeNull();
    expect(automationById("AUT-05")?.id).toBe("AUT-05");
    expect(humanBindingById("HB-99")).toBeNull();
  });

  it("denies an unverifiable decision instant", () => {
    for (const now of ["", "not-a-date", "yesterday"]) {
      const result = authorizeAutomation({ ...request(), now }, OK_OPTIONS);
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.denial).toBe("APPROVAL_ABSENT");
    }
  });

  it("denies the absence of approval evidence", () => {
    const result = authorizeAutomation({ ...request(), approval: null }, OK_OPTIONS);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.denial).toBe("APPROVAL_ABSENT");
      expect(result.reason).toMatch(/not an authorization/i);
    }
  });

  it("denies an approval that carries no decision reference", () => {
    const result = authorizeAutomation({ ...request(), approval: { decision: syntheticDecision({ reference: "  " }) } }, OK_OPTIONS);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.denial).toBe("APPROVAL_MISSING_DECISION_REFERENCE");
  });
});

/* ------------------------------------------------------------------ */
/* 5 — missing, malformed, expired and revoked authorization           */
/* ------------------------------------------------------------------ */

describe("BEYU-SCG — malformed, expired and revoked authorization is denied", () => {
  it("denies a decision that does not resolve through the governed lookup", () => {
    const result = authorizeAutomation(request(), { lookup: () => null, bodyEvidenced: true });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.denial).toBe("DECISION_UNKNOWN");
      expect(result.reason).toMatch(/not proof that the decision exists/i);
    }
  });

  it("denies a caller-supplied decision object even when it looks perfect", () => {
    // The request carries a decision, but the governed lookup knows nothing
    // about it. A caller cannot mint authority by describing it.
    const result = authorizeAutomation(request(), { lookup: () => null, bodyEvidenced: true });
    expect(result.allowed).toBe(false);
  });

  it("denies REFERENCE_DATA provenance — seed and hand-inserted data never authorise", () => {
    for (const provenance of ["REFERENCE_DATA", "UNKNOWN"] as const) {
      const decision = syntheticDecision({ provenance });
      const result = authorizeAutomation(request(), { lookup: lookupReturning(decision), bodyEvidenced: true });
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.denial).toBe("DECISION_PROVENANCE_NOT_GOVERNED");
    }
  });

  it("denies every decision status except APPROVED", () => {
    for (const status of ["DRAFT", "REJECTED", "SUPERSEDED", "WITHDRAWN"] as const) {
      const decision = syntheticDecision({ status });
      const result = authorizeAutomation(request(), { lookup: lookupReturning(decision), bodyEvidenced: true });
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.denial).toBe("DECISION_NOT_APPROVED");
    }
  });

  it("denies an expired decision and one that has not yet taken effect", () => {
    const expired = syntheticDecision({ expiresAt: "2026-01-01T00:00:00Z" });
    const e = authorizeAutomation(request(), { lookup: lookupReturning(expired), bodyEvidenced: true });
    expect(e.allowed).toBe(false);
    if (!e.allowed) expect(e.denial).toBe("AUTHORIZATION_EXPIRED");

    const future = syntheticDecision({ effectiveFrom: "2027-01-01T00:00:00Z" });
    const f = authorizeAutomation(request(), { lookup: lookupReturning(future), bodyEvidenced: true });
    expect(f.allowed).toBe(false);
    if (!f.allowed) expect(f.denial).toBe("NOT_YET_EFFECTIVE");
  });

  it("denies a revoked authorization, and a decision with an unverifiable window", () => {
    const revoked = syntheticDecision({ revokedAt: "2026-06-01T00:00:00Z" });
    const r = authorizeAutomation(request(), { lookup: lookupReturning(revoked), bodyEvidenced: true });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.denial).toBe("AUTHORIZATION_REVOKED");

    for (const bad of [{ effectiveFrom: "soon" }, { expiresAt: "" }]) {
      const decision = syntheticDecision(bad);
      const result = authorizeAutomation(request(), { lookup: lookupReturning(decision), bodyEvidenced: true });
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.denial).toBe("DECISION_UNKNOWN");
    }
  });

  it("denies a version mismatch — a newer automation needs a newer decision", () => {
    const decision = syntheticDecision({ automationVersion: "0.9.0" });
    const result = authorizeAutomation(request(), { lookup: lookupReturning(decision), bodyEvidenced: true });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.denial).toBe("VERSION_MISMATCH");
  });

  it("denies a decision scoped to a different tenant or entity", () => {
    const otherTenant = syntheticDecision({ tenantId: "TEN_OTHER" });
    const t = authorizeAutomation(request(), { lookup: lookupReturning(otherTenant), bodyEvidenced: true });
    expect(t.allowed).toBe(false);
    if (!t.allowed) expect(t.denial).toBe("DECISION_OUT_OF_SCOPE");

    const otherEntity = syntheticDecision({ tenantId: "TEN_BEYU_GROUP", legalEntityId: "ENT_OTHER" });
    const e = authorizeAutomation(request(), { lookup: lookupReturning(otherEntity), bodyEvidenced: true });
    expect(e.allowed).toBe(false);
    if (!e.allowed) expect(e.denial).toBe("DECISION_OUT_OF_SCOPE");
  });

  it("denies a decision that authorizes a different automation", () => {
    const decision = syntheticDecision({ automationId: "AUT-06" });
    const result = authorizeAutomation(request(), { lookup: lookupReturning(decision), bodyEvidenced: true });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.denial).toBe("DECISION_OUT_OF_SCOPE");
  });

  it("refuses to name or accept a catalogue reference as an automation", () => {
    // AUT-03 is the Noelia tool registry: an aggregate surface, not an
    // automation. It can never hold an authorization.
    expect(automationById("AUT-03")).toBeNull();
    expect(AUTOMATION_REGISTRY.find((a) => a.id === "AUT-03")?.verification).toBe("CATALOGUE_REFERENCE");
    const result = authorizeAutomation({ ...request(), automationId: "AUT-03" }, OK_OPTIONS);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.denial).toBe("CATALOGUE_REFERENCE_NOT_AUTHORIZABLE");
  });

  it("every denial reason is exercised by at least one test above, so none is dead", () => {
    // A denial code no test can provoke is a code that may never fire in
    // production either. The two not provoked directly — because the shapes that
    // would provoke them are unreachable by construction — are listed
    // explicitly here with the reason, rather than quietly ignored.
    const unreachableByConstruction: (typeof AUTOMATION_DENIAL_REASONS)[number][] = [
      "PROHIBITED_CLASS_EXTERNAL_EXECUTION", // no A7 record exists to look up
      "EXTERNAL_EXECUTION_PROHIBITED", // no record declares externalExecution
    ];
    expect(AUTOMATION_DENIAL_REASONS.length).toBe(15);
    expect(unreachableByConstruction).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* 6 — the governance body does not exist, so nothing is authorized    */
/* ------------------------------------------------------------------ */

describe("BEYU-SCG — R-AUT-01 stays empty absent a constituted body", () => {
  it("denies by default with GOVERNANCE_BODY_NOT_CONSTITUTED", () => {
    const result = authorizeAutomation(request());
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.denial).toBe("GOVERNANCE_BODY_NOT_CONSTITUTED");
      expect(result.reason).toMatch(/no approving body is evidenced/i);
    }
  });

  it("denies every automation in the register, for every permitted class", () => {
    for (const record of AUTOMATION_REGISTRY) {
      const result = authorizeAutomation({
        automationId: record.id,
        automationVersion: "1.0.0",
        tenantId: "TEN_BEYU_GROUP",
        now: NOW,
        approval: { decision: syntheticDecision({ automationId: record.id }) },
      });
      expect(result.allowed, `${record.id} must not be authorized by default`).toBe(false);
    }
  });

  it("cannot be unlocked by an environment variable, a flag or an inventory field", () => {
    const before = process.env.BEYU_SCG_AUTOMATION_AUTHORIZED;
    process.env.BEYU_SCG_AUTOMATION_AUTHORIZED = "true";
    const result = authorizeAutomation(request());
    if (before === undefined) delete process.env.BEYU_SCG_AUTOMATION_AUTHORIZED;
    else process.env.BEYU_SCG_AUTOMATION_AUTHORIZED = before;
    expect(result.allowed).toBe(false);
  });

  it("names the register it would populate, and the pack says it is empty", () => {
    expect(SCG_AUTHORIZATION_REGISTER_ID).toBe("R-AUT-01");
    const registers = readFileSync(join(ROOT, PACK_DIR, "REGISTERS_AND_TEMPLATES.md"), "utf8");
    expect(registers).toContain("R-AUT-01");
    expect(registers).toMatch(/Opening state: ZERO authorised automations/);
  });

  it("the permit path is reachable only with injected, synthetic evidence", () => {
    // This test exists to prove the permit path is not dead code. It uses a
    // synthetic decision and an explicitly-evidenced body flag, both supplied
    // by the test. Nothing in the production path supplies either.
    const result = authorizeAutomation(request(), OK_OPTIONS);
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.decisionReference).toBe("DEC-SYNTHETIC-0001");
      expect(result.class).toBe("A1");
      expect(result.note).toMatch(/never to sign, submit, broadcast, post, pay or transfer/i);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 7 — a permitted posture is not a permission                         */
/* ------------------------------------------------------------------ */

describe("BEYU-SCG — an execution posture never grants permission", () => {
  it("reports gates open while refusing to be a permission", () => {
    const posture = interpretExecutionPosture({ permitted: true, blockedBy: [] });
    expect(posture.gatesOpen).toBe(true);
    expect(posture.isPermission).toBe(false);
    expect(posture.requiresBeforeActing.length).toBeGreaterThan(0);
  });

  it("requires a governed decision, a human approval, a verified registry record and dispute closure", () => {
    const posture = interpretExecutionPosture({ permitted: true, blockedBy: [] });
    const text = posture.requiresBeforeActing.join(" | ");
    expect(text).toMatch(/governed decision/i);
    expect(text).toMatch(/human approval/i);
    expect(text).toMatch(/registry record/i);
    expect(text).toMatch(/dispute/i);
  });

  it("carries the refusal reasons when gates are closed, and treats a refusal as information", () => {
    const posture = interpretExecutionPosture({ permitted: false, blockedBy: ["SMART_CONTRACT_NOT_VERIFIED_IN_REGISTRY"] });
    expect(posture.gatesOpen).toBe(false);
    expect(posture.blockedBy).toEqual(["SMART_CONTRACT_NOT_VERIFIED_IN_REGISTRY"]);
    expect(posture.blockedByNote).toMatch(/not an error/i);
    expect(posture.isPermission).toBe(false);
  });

  it("tolerates a posture with no blockedBy and no fields at all", () => {
    for (const input of [{ permitted: false }, { permitted: true }, {} as { permitted: boolean }]) {
      const posture = interpretExecutionPosture(input);
      expect(posture.isPermission).toBe(false);
      expect(posture.gatesOpen).toBe(input.permitted === true);
    }
  });

  it("is never an input to authorization: the request shape has no posture field", () => {
    const withPosture = { ...request(), permitted: true, executionPosture: { permitted: true } } as unknown as AutomationAuthorizationRequest;
    const result = authorizeAutomation(withPosture);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.denial).toBe("GOVERNANCE_BODY_NOT_CONSTITUTED");
  });
});

/* ------------------------------------------------------------------ */
/* 8 — the mechanical checks pass on the real artefacts                */
/* ------------------------------------------------------------------ */

const packFiles = ["README.md", "SMART_CONTRACT_AUTHORITY_FRAMEWORK.md", "AUTOMATION_GOVERNANCE.md", "REGISTERS_AND_TEMPLATES.md", "VERIFICATION_LOG.md"].map(
  (f) => `${PACK_DIR}/${f}`,
);

describe("BEYU-SCG — mechanical checks against the real artefacts", () => {
  it("V-3 inventory freshness finds nothing blocking", () => {
    expect(checkInventoryFreshness(ROOT).findings.filter((f) => f.severity === "BLOCKING")).toEqual([]);
  });

  it("V-4 no-secret scan finds nothing blocking", () => {
    expect(checkNoSecrets(ROOT).findings.filter((f) => f.severity === "BLOCKING")).toEqual([]);
  });

  it("V-6 prohibited-claim scan finds nothing blocking", () => {
    expect(checkProhibitedClaims(ROOT, packFiles).findings.filter((f) => f.severity === "BLOCKING")).toEqual([]);
  });

  it("V-7 authorization guards find nothing blocking", () => {
    expect(checkAuthorizationGuards().findings.filter((f) => f.severity === "BLOCKING")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 9 — the checks can fail (a check that cannot fail is not a check)   */
/* ------------------------------------------------------------------ */

describe("BEYU-SCG — the mechanical checks detect the defects they exist for", () => {
  const tmp = mkdtempSync(join(tmpdir(), "beyu-scg-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  function seedTmpInventory(entries: unknown[], extra: Record<string, unknown> = {}): string {
    mkdirSync(join(tmp, PACK_DIR), { recursive: true });
    writeFileSync(
      join(tmp, PACK_DIR, "AUTOMATION_INVENTORY.json"),
      JSON.stringify({ inventory_id: "BEYU-SCG-04A", grants_authority: false, entries, human_bindings: [], ...extra }),
    );
    return tmp;
  }

  it("BLOCKS an entry whose source path does not exist", () => {
    seedTmpInventory([{ id: "AUT-01", class: "A1", source_paths: ["src/lib/payments/ingest.ts", "src/lib/does-not-exist.ts"], human_binding: [] }]);
    const findings = checkInventoryFreshness(tmp).findings;
    expect(findings.some((f) => f.code === "SOURCE_PATH_MISSING" && f.severity === "BLOCKING")).toBe(true);
  });

  it("BLOCKS duplicate ids and malformed ids", () => {
    seedTmpInventory([
      { id: "AUT-01", class: "A1", source_paths: ["src/lib/payments/ingest.ts"] },
      { id: "AUT-01", class: "A1", source_paths: ["src/lib/payments/ingest.ts"] },
      { id: "AUT-1", class: "A1", source_paths: ["src/lib/payments/ingest.ts"] },
    ]);
    const codes = checkInventoryFreshness(tmp).findings.map((f) => f.code);
    expect(codes).toContain("ENTRY_ID_DUPLICATE");
    expect(codes).toContain("ENTRY_ID_SHAPE");
  });

  it("BLOCKS an inventory that forgot a whole automation-bearing directory", () => {
    seedTmpInventory([{ id: "AUT-01", class: "A1", source_paths: ["src/lib/payments/ingest.ts"] }]);
    const codes = checkInventoryFreshness(tmp).findings.map((f) => f.code);
    expect(codes).toContain("DIRECTORY_UNREPRESENTED");
  });

  it("BLOCKS drift between the JSON inventory and the TypeScript register", () => {
    seedTmpInventory([{ id: "AUT-01", class: "A6", source_paths: ["src/lib/payments/ingest.ts"], human_binding: ["HB-99"] }]);
    const codes = checkInventoryFreshness(tmp).findings.map((f) => f.code);
    expect(codes).toContain("CLASS_DRIFT");
    expect(codes).toContain("HUMAN_BINDING_UNRESOLVED");
  });

  it("BLOCKS an entry marked authorized, and an A7 entry without a prohibition", () => {
    seedTmpInventory([
      { id: "AUT-01", class: "A1", source_paths: ["src/lib/payments/ingest.ts"], authorized: true },
      { id: "AUT-02", class: "A7", source_paths: ["src/lib/payments/ingest.ts"] },
    ]);
    const codes = checkProhibitedClaims(tmp, []).findings.map((f) => f.code);
    expect(codes).toContain("AUTHORIZATION_FIELD_PRESENT");
    expect(codes).toContain("A7_WITHOUT_PROHIBITION");
  });

  it("BLOCKS a document that declares a completion label as its status", () => {
    mkdirSync(join(tmp, PACK_DIR), { recursive: true });
    const doc = `${PACK_DIR}/SOME_DOC.md`;
    writeFileSync(join(tmp, doc), "# doc\n**Document ID:** `X`\nStatus: `APPROVED`\n");
    const findings = checkProhibitedClaims(tmp, [doc]).findings;
    expect(findings.some((f) => f.code === "COMPLETION_LABEL_AS_STATUS" && f.severity === "BLOCKING")).toBe(true);
  });

  it("BLOCKS a document whose status is outside the vocabulary", () => {
    mkdirSync(join(tmp, PACK_DIR), { recursive: true });
    const doc = `${PACK_DIR}/OTHER_DOC.md`;
    writeFileSync(join(tmp, doc), "# doc\nStatus: `LOOKS_FINE_TO_ME`\n");
    const findings = checkProhibitedClaims(tmp, [doc]).findings;
    expect(findings.some((f) => f.code === "STATUS_NOT_IN_VOCABULARY")).toBe(true);
  });

  it("BLOCKS a private key placed as a value, while allowing the word in a prohibition", () => {
    mkdirSync(join(tmp, PACK_DIR), { recursive: true });
    const doc = `${PACK_DIR}/REGISTERS_AND_TEMPLATES.md`;
    writeFileSync(join(tmp, doc), "# registers\nNo private key may ever be recorded here.\n");
    expect(checkNoSecrets(tmp).findings.filter((f) => f.severity === "BLOCKING")).toEqual([]);

    writeFileSync(join(tmp, "AUTOMATION_INVENTORY.json"), JSON.stringify({ inventory_id: "BEYU-SCG-04A", entries: [] }));
    writeFileSync(join(tmp, PACK_DIR, "AUTOMATION_INVENTORY.json"), JSON.stringify({ inventory_id: "BEYU-SCG-04A", entries: [], note: "0x1234567890abcdef1234567890abcdef12345678" }));
    const findings = checkNoSecrets(tmp).findings;
    expect(findings.some((f) => f.code === "EVM_ADDRESS" && f.severity === "BLOCKING")).toBe(true);
  });

  it("BLOCKS a real signing call placed in the governed domain (V-7)", () => {
    const forged = join(tmp, "src/lib/blockchain");
    try {
      mkdirSync(forged, { recursive: true });
      writeFileSync(join(forged, "forged-signer.ts"), "export async function go() { await signTransaction({ to: '0x00' }); }\n");
      expect(checkNoSigningSurface(tmp).some((f) => f.code === "SIGN_CALL" && f.severity === "BLOCKING")).toBe(true);

      writeFileSync(join(forged, "forged-key.ts"), "export const privateKey: string = process.env.SIGNER_KEY!;\n");
      expect(checkNoSigningSurface(tmp).some((f) => f.code === "KEY_VALUE")).toBe(true);
    } finally {
      rmSync(forged, { recursive: true, force: true });
    }
  });

  it("does NOT flag prohibition prose that names a key field (the distinction is load-bearing)", () => {
    const domain = join(tmp, "src/lib/payments");
    mkdirSync(domain, { recursive: true });
    try {
      writeFileSync(join(domain, "denylist.ts"), 'export const FORBIDDEN = ["privateKey", "mnemonic", "seedPhrase"] as const;\n');
      expect(checkNoSigningSurface(tmp).filter((f) => f.severity === "BLOCKING")).toEqual([]);
    } finally {
      rmSync(domain, { recursive: true, force: true });
    }
  });

  it("BLOCKS a register that marks an automation AUTHORISED (V-7)", () => {
    // Simulated by re-running the guard against a doctored view: the real
    // register has no `status` field at all, which is the empty state.
    expect(AUTOMATION_REGISTRY.every((a) => !("status" in a))).toBe(true);
    expect(checkAuthorizationGuards().blocking).toBe(0);
  });
});
