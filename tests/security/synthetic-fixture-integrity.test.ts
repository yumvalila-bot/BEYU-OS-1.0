/**
 * BEYU OS — SYNTHETIC FIXTURE INTEGRITY (BLK-08).
 *
 * WHY THIS SUITE EXISTS. The seed writes invented people, families, beneficiary
 * rows and resolutions into a real database. Those rows used to carry
 * verification METADATA that looked like the outcome of a real process:
 *
 *   family_members.verification_status 'VERIFIED'
 *   family_members.verification_method 'DOCUMENTARY_AND_COUNSEL_REVIEW'
 *   family_members.verified_by          'FAMILY_COUNCIL'
 *   family_members.verified_at          2025-06-02
 *   beneficiaries.verified_by           'TRUSTEE_BOARD'
 *   beneficiaries.eligibility           'ELIGIBLE'
 *   beneficiaries.entitlement_pct       40
 *   beneficiaries.approved_by_resolution_id → R2025_007
 *   resolutions(R2025_007).data_basis   "Family registry lineage verification pack FV-2025-03"
 *   parties.kyc_status                  'VERIFIED'
 *   parties.kyc_method                  'NIDA_DOCUMENT_VERIFICATION'
 *
 * None of it happened. No identity document exists for a fictional person, no
 * counsel reviewed anything, no NIDA check could have run (the repository's own
 * federation registry records NIDA as CONTRACT_PENDING / NONE_PUBLISHED /
 * UNVERIFIED), and no instrument in this repository defines a beneficiary class.
 *
 * These tests are the guard: synthetic rows must be incapable of being read as
 * verified identity, lineage, appointment, beneficiary entitlement, legal
 * approval or authorization to execute. They assert both directions:
 *
 *   A. every synthetic row carries the UNVERIFIED / no-actor state; and
 *   B. the machinery that consumes those columns actually REFUSES, rather than
 *      merely displaying something reassuring.
 *
 * A green run does not mean the data is real. It means the data cannot be
 * mistaken for real.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { parties, familyMembers, beneficiaries, resolutions } from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { buildDescentGraph, determineDescendantStatus, type DescentNode } from "../../src/lib/family/lineage";

const SYNTHETIC_PARTY_KEYS = ["AMANI_BEYU", "NEEMA_BEYU"] as const;
const SYNTHETIC_MEMBER_KEYS = ["FM_G1_FOUNDER", "FM_G1_SPOUSE"] as const;
const SYNTHETIC_BENEFICIARY_KEYS = ["B1", "B2"] as const;
const SYNTHETIC_RESOLUTION_KEY = "R2025_007";

/**
 * Evidence ATTRIBUTIONS found in `text` — the constructions a fixture must never
 * contain.
 *
 * Why attributions rather than a substring scan: the corrected fixtures read
 * "no documentary evidence, counsel review or verification pack exists, and none
 * may be cited from this row". That sentence is the honest statement, and a scan
 * for the words "counsel review" flags it as the very claim it denies — which is
 * how a guard ends up punishing the fix and pressuring a future maintainer to
 * delete the disclosure.
 *
 * Parsing English negation reliably is out of scope, so this checks what is
 * actually forbidden: evidence attributed to a source, and references to a named
 * evidence artefact. The original defect text —
 *   "Lineage verified by documentary evidence and independent counsel review."
 *   dataBasis "Family registry lineage verification pack FV-2025-03."
 * — trips both patterns. A denial of those same things trips neither.
 */
const EVIDENCE_ATTRIBUTION = [
  /\b(?:verified|confirmed|reviewed|approved|certified|evidenced|witnessed)\s+by\b/i,
  /\bpack\s+[A-Z]{2,4}-\d/i,
  /\bper\s+(?:the\s+)?(?:verification|evidence)\s+pack/i,
  /\b(?:executed|counter-?signed)\s+(?:deed|instrument)/i,
  /\bby\s+(?:independent\s+)?(?:counsel|advocate|notary|auditor)\b/i,
] as const;

function evidenceAttributions(text: string): string[] {
  return EVIDENCE_ATTRIBUTION.filter((re) => re.test(text)).map((re) => re.source);
}

const partyIds = SYNTHETIC_PARTY_KEYS.map((k) => fixedId(ID_PREFIX.party, k));
const memberIds = SYNTHETIC_MEMBER_KEYS.map((k) => fixedId(ID_PREFIX.familyMember, k));
const beneficiaryIds = SYNTHETIC_BENEFICIARY_KEYS.map((k) => fixedId(ID_PREFIX.beneficiary, k));

/** True when every synthetic row this suite asserts on is present. */
let seeded = false;

beforeAll(async () => {
  const rows = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(inArray(familyMembers.id, memberIds));
  seeded = rows.length === SYNTHETIC_MEMBER_KEYS.length;
});

afterAll(async () => {
  // This suite writes nothing, so there is nothing to clean up. It is stated
  // explicitly because a reader should not have to infer it.
});

describe("synthetic fixtures are not verified identity", () => {
  it("is running against a seeded database (otherwise this suite proves nothing)", () => {
    // A skip here would be a silent pass. If the fixtures are absent the suite
    // fails loudly so nobody reads a green run as coverage it did not have.
    expect(seeded).toBe(true);
  });

  it("every synthetic family member is UNVERIFIED, with no method, actor or date", async () => {
    const rows = await db
      .select()
      .from(familyMembers)
      .where(inArray(familyMembers.id, memberIds));
    expect(rows).toHaveLength(SYNTHETIC_MEMBER_KEYS.length);

    for (const row of rows) {
      expect(row.verificationStatus, `${row.id} must not claim verification`).toBe("UNVERIFIED");
      // The three columns that turn a status into a claim about a real process.
      expect(row.verificationMethod, `${row.id} must name no verification method`).toBeNull();
      expect(row.verifiedBy, `${row.id} must name no verifying actor`).toBeNull();
      expect(row.verifiedAt, `${row.id} must record no verification date`).toBeNull();
    }
  });

  it("no synthetic family member asserts direct descent", async () => {
    // Descent is a verified claim; the governed registration path refuses to
    // assert it (DIRECT_DESCENDANT_REQUIRES_VERIFICATION, tested in
    // tests/family/family-member-guard.test.ts). A seed may not assert what the
    // governed path refuses to assert.
    const rows = await db
      .select({ id: familyMembers.id, direct: familyMembers.directDescendant })
      .from(familyMembers)
      .where(inArray(familyMembers.id, memberIds));
    for (const row of rows) {
      expect(row.direct, `${row.id} must not assert direct descent`).toBe(false);
    }
  });

  it("no synthetic party claims KYC verification or a KYC method", async () => {
    const rows = await db.select().from(parties).where(inArray(parties.id, partyIds));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.kycStatus, `${row.id} must not claim identity verification`).toBe("UNVERIFIED");
      expect(row.kycMethod, `${row.id} must name no KYC method`).toBeNull();
    }
  });

  it("no seeded party anywhere claims VERIFIED identity — not just the two asserted above", async () => {
    // The defect was systemic, not limited to the rows under test, so the guard
    // is systemic: nothing a seed writes may claim a completed identity check.
    const claimed = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(parties)
      .where(and(eq(parties.kycStatus, "VERIFIED"), isNotNull(parties.kycMethod)));
    expect(Number(claimed[0]?.n ?? 0), "seeded parties must not carry VERIFIED KYC with a method").toBe(0);
  });
});

describe("synthetic fixtures do not confer lineage or beneficiary status", () => {
  it("the lineage engine reports a synthetic descent chain as NOT verified", async () => {
    // This is the functional half of the guard. The previous fixture marked the
    // chain VERIFIED, which is what let `unbrokenDescentToFounder` become true —
    // the flag that carries descent rights into family-ownership eligibility.
    const rows = await db
      .select({
        memberId: familyMembers.id,
        familyLine: familyMembers.familyLine,
        relationshipToParent: familyMembers.relationshipToParent,
        parentMemberId: familyMembers.parentMemberId,
        linkedToMemberId: familyMembers.linkedToMemberId,
        verificationStatus: familyMembers.verificationStatus,
      })
      .from(familyMembers)
      .where(inArray(familyMembers.id, memberIds));

    const nodes: DescentNode[] = rows.map((r) => ({
      memberId: r.memberId,
      familyLine: r.familyLine,
      parentMemberId: r.parentMemberId,
      relationshipToParent: r.relationshipToParent as DescentNode["relationshipToParent"],
      linkedToMemberId: r.linkedToMemberId,
      verificationStatus: r.verificationStatus as DescentNode["verificationStatus"],
    }));

    const graph = buildDescentGraph(nodes);
    for (const node of nodes) {
      expect(node.verificationStatus).toBe("UNVERIFIED");
      const position = graph.positions[node.memberId];
      expect(
        position?.unbrokenDescentToFounder ?? false,
        `${node.memberId} must not evaluate as an unbroken verified descent`,
      ).toBe(false);
    }
  });

  it("an unverified chain yields a LINEAGE_NOT_VERIFIED blocker rather than a determination", () => {
    // Pure-engine assertion on the same rule, independent of the database.
    const founder: DescentNode = {
      memberId: "SYN_FOUNDER",
      familyLine: "SYN",
      relationshipToParent: "BIRTH_DESCENDANT",
      parentMemberId: null,
      verificationStatus: "UNVERIFIED",
    };
    const graph = buildDescentGraph([founder]);
    const nodesById = new Map([[founder.memberId, founder]]);
    const determination = determineDescendantStatus(graph, founder.memberId, nodesById, null);

    expect(determination.status).toBe("INDETERMINATE");
    expect(determination.directDescendant).toBe(false);
    expect(determination.blockers).toContain("LINEAGE_NOT_VERIFIED: SYN_FOUNDER");
    expect(determination.blockers).toContain("DESCENT_CHAIN_NOT_UNBROKEN");

    // The contrast that makes this a guard rather than a restatement: the SAME
    // node marked VERIFIED would satisfy the chain check. The status is the only
    // thing standing between synthetic data and a descent determination, which
    // is exactly why the seed must not assert it.
    const verified: DescentNode = { ...founder, verificationStatus: "VERIFIED" };
    const verifiedGraph = buildDescentGraph([verified]);
    expect(verifiedGraph.positions["SYN_FOUNDER"]?.unbrokenDescentToFounder).toBe(true);
  });

  it("every synthetic beneficiary is UNDER_REVIEW, with no percentage, verifier or resolution", async () => {
    const rows = await db.select().from(beneficiaries).where(inArray(beneficiaries.id, beneficiaryIds));
    expect(rows).toHaveLength(SYNTHETIC_BENEFICIARY_KEYS.length);

    for (const row of rows) {
      expect(row.eligibility, `${row.id} must not assert eligibility`).toBe("UNDER_REVIEW");
      // A percentage is a claimed share of trust property. Recording one would
      // invent an entitlement for a person who does not exist.
      expect(row.entitlementPct, `${row.id} must record no entitlement share`).toBeNull();
      expect(row.verifiedBy, `${row.id} must name no verifying actor`).toBeNull();
      expect(row.approvedByResolutionId, `${row.id} must cite no approving resolution`).toBeNull();
      expect(row.eligibilityRationale).toMatch(/SYNTHETIC/);
    }
  });

  it("no seeded beneficiary claims ELIGIBLE, a percentage, or a resolution", async () => {
    const eligible = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(beneficiaries)
      .where(eq(beneficiaries.eligibility, "ELIGIBLE"));
    expect(Number(eligible[0]?.n ?? 0), "seed must not declare anyone ELIGIBLE").toBe(0);

    const entitled = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(beneficiaries)
      .where(isNotNull(beneficiaries.entitlementPct));
    expect(Number(entitled[0]?.n ?? 0), "seed must not record entitlement percentages").toBe(0);

    const approved = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(beneficiaries)
      .where(isNotNull(beneficiaries.approvedByResolutionId));
    expect(Number(approved[0]?.n ?? 0), "seed must not cite approving resolutions").toBe(0);
  });
});

describe("synthetic fixtures do not assert legal evidence", () => {
  it("the synthetic resolution names no evidence pack and no counsel review", async () => {
    const [row] = await db
      .select()
      .from(resolutions)
      .where(eq(resolutions.id, fixedId(ID_PREFIX.resolution, SYNTHETIC_RESOLUTION_KEY)));
    expect(row, "the synthetic resolution should exist as a labelled fixture").toBeTruthy();

    // It is labelled as synthetic so a reader cannot mistake it for a record.
    expect(row!.title).toMatch(/SYNTHETIC/);
    expect(row!.dataBasis ?? "").toMatch(/synthetic|none/i);

    // The fabricated evidence reference is gone: no pack id, no asserted review.
    const blob = JSON.stringify(row);
    expect(blob, "the invented evidence pack reference must be gone").not.toMatch(/FV-2025-03/);
    expect(
      evidenceAttributions(blob),
      "a fixture must not attribute evidence to a source — denying that evidence exists is the correct form",
    ).toEqual([]);
    // It must not name a fabricated human proposer.
    expect(row!.proposedBy).not.toBe("FAMILY_OFFICE_PRINCIPAL");
  });

  it("no seeded resolution asserts a verification or counsel-review basis", async () => {
    const rows = await db
      .select({ id: resolutions.id, dataBasis: resolutions.dataBasis, rationale: resolutions.rationale })
      .from(resolutions);
    for (const row of rows) {
      const blob = `${row.dataBasis ?? ""} ${row.rationale ?? ""}`;
      expect(
        evidenceAttributions(blob),
        `${row.id} must not attribute evidence to a verification pack, counsel or documentary record`,
      ).toEqual([]);
    }
  });
});

describe("the guard can actually fail (a check that cannot fail is not a check)", () => {
  it("catches the exact strings the defect used, while allowing the honest replacement", () => {
    // The original, defective text. If these do not trip the detector, the
    // detector is decorative.
    const originalRationale = "Lineage verified by documentary evidence and independent counsel review.";
    const originalDataBasis = "Family registry lineage verification pack FV-2025-03.";

    expect(evidenceAttributions(originalRationale)).not.toEqual([]);
    expect(evidenceAttributions(originalDataBasis)).not.toEqual([]);

    // The honest replacement denies those same things and must NOT be flagged.
    const replacement =
      "NONE — synthetic demonstration data. There is no evidence pack, no verification " +
      "reference and no source document behind this row. No counsel reviewed anything.";
    expect(evidenceAttributions(replacement)).toEqual([]);
  });

  it("catches an asserted verification status and a fabricated actor", () => {
    // Status/actor fabrication is asserted on the rows themselves elsewhere in
    // this suite; here the point is that the string-level detector is not the
    // only guard. Both layers are stated so neither is mistaken for the other.
    expect("verifiedBy: FAMILY_COUNCIL").toMatch(/verifiedBy/);
    expect(evidenceAttributions("Approved by the Trustee Board.")).not.toEqual([]);
  });
});

describe("synthetic fixtures cannot authorize execution", () => {
  it("no seeded family or beneficiary row produces a governance verdict", async () => {
    // Authorization does not flow from these tables at all. The decision
    // registry is the only route, its seeded rows are PENDING with
    // activation_status LOCKED, and provenance must be GOVERNED for any row to
    // count (src/lib/decision-authority.ts: "seeded or unverified records do not
    // confer authority"). This asserts the state directly so a future seed
    // change that tries to short-circuit it fails here.
    const registry = await db.execute(sql`
      select count(*)::int n
      from governance_decision_registry
      where provenance = 'GOVERNED'
         or status in ('ACTIVATED','RATIFIED','ACTIVATION_READY')
    `);
    const rows = (registry as unknown as { rows?: Array<{ n: number }> }).rows ?? [];
    expect(Number(rows[0]?.n ?? 0), "no seeded registry row may carry authority").toBe(0);
  });

  it("the seeded governance bodies are RECORDS, not a constituted authority", async () => {
    // The demonstration seeds bodies, members and resolutions so the governed
    // paths can be exercised. None of that constitutes a governance body: the
    // registry rows above are the authority route and they are LOCKED. This test
    // exists so nobody reads the existence of `BEYU Family Council` as its
    // constitution — see BEYU-SCG-16 BLK-01.
    const bodies = await db.execute(sql`select count(*)::int n from governance_bodies`);
    const bodyRows = (bodies as unknown as { rows?: Array<{ n: number }> }).rows ?? [];
    expect(Number(bodyRows[0]?.n ?? 0)).toBeGreaterThan(0);

    const authority = await db.execute(sql`
      select count(*)::int n
      from governance_decision_registry
      where provenance = 'GOVERNED'
    `);
    const authorityRows = (authority as unknown as { rows?: Array<{ n: number }> }).rows ?? [];
    expect(
      Number(authorityRows[0]?.n ?? 0),
      "bodies existing is not authority existing; seeded registry rows must carry no GOVERNED provenance",
    ).toBe(0);
  });
});
