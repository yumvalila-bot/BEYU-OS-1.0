import { describe, expect, it } from "vitest";
import {
  buildDescentGraph,
  determineDescendantStatus,
  assessLineageEvidence,
  reconcileStoredDescendantFlags,
  verifiedDescendantsOf,
  assertLineageWriteIsHuman,
  type DescentNode,
} from "../../src/lib/family/lineage";
import { FamilyInstitutionError } from "../../src/lib/family/model";

/**
 * Family Line Registry — pure engine, no database.
 *
 * The invariants under test are the ones the institution cannot afford to get
 * wrong: descent is never inferred, marriage never creates descent, a broken
 * chain is never upgraded to descent, and adoption is never decided either way
 * without a ratified treatment.
 */

const founder: DescentNode = {
  memberId: "FAM_FOUNDER",
  familyLine: "BEYU",
  parentMemberId: null,
  relationshipToParent: "BIRTH_DESCENDANT",
  verificationStatus: "VERIFIED",
};

const gen2 = (id: string, parent = "FAM_FOUNDER"): DescentNode => ({
  memberId: id,
  familyLine: "BEYU",
  parentMemberId: parent,
  relationshipToParent: "BIRTH_DESCENDANT",
  verificationStatus: "VERIFIED",
});

const gen3 = (id: string, parent: string): DescentNode => gen2(id, parent);

const spouseOf = (id: string, linkedTo: string): DescentNode => ({
  memberId: id,
  familyLine: "BEYU",
  parentMemberId: null,
  relationshipToParent: "SPOUSE_OF_MEMBER",
  linkedToMemberId: linkedTo,
  verificationStatus: "VERIFIED",
});

const nodesOf = (nodes: DescentNode[]) => new Map(nodes.map((n) => [n.memberId, n]));

describe("buildDescentGraph", () => {
  it("numbers generations from the founder at 1", () => {
    const nodes = [founder, gen2("FAM_G2A"), gen3("FAM_G3A", "FAM_G2A")];
    const graph = buildDescentGraph(nodes);

    expect(graph.positions["FAM_FOUNDER"].generation).toBe(1);
    expect(graph.positions["FAM_G2A"].generation).toBe(2);
    expect(graph.positions["FAM_G3A"].generation).toBe(3);
    expect(graph.maxGeneration).toBe(3);
    expect(graph.founders).toEqual(["FAM_FOUNDER"]);
  });

  it("places siblings of the founder's children on distinct branches", () => {
    const nodes = [founder, gen2("FAM_G2A"), gen2("FAM_G2B"), gen3("FAM_G3A", "FAM_G2A"), gen3("FAM_G3B", "FAM_G2B")];
    const graph = buildDescentGraph(nodes);

    expect(graph.positions["FAM_G3A"].branch).not.toBe(graph.positions["FAM_G3B"].branch);
    expect(graph.branches.length).toBeGreaterThanOrEqual(2);
  });

  it("reports an unknown parent rather than inventing a generation", () => {
    const nodes = [gen2("FAM_ORPHAN", "FAM_MISSING")];
    const graph = buildDescentGraph(nodes);

    expect(graph.issues.some((i) => i.issue === "UNKNOWN_PARENT")).toBe(true);
    expect(graph.positions["FAM_ORPHAN"]).toBeUndefined();
  });

  it("reports a parent cycle and computes no position for the members inside it", () => {
    const nodes: DescentNode[] = [
      { ...gen2("FAM_A", "FAM_B") },
      { ...gen2("FAM_B", "FAM_A") },
    ];
    const graph = buildDescentGraph(nodes);

    expect(graph.issues.some((i) => i.issue === "PARENT_CYCLE")).toBe(true);
    expect(graph.positions["FAM_A"]).toBeUndefined();
    expect(graph.positions["FAM_B"]).toBeUndefined();
  });

  it("refuses a parent link on an affinity relationship", () => {
    const nodes: DescentNode[] = [
      founder,
      { ...spouseOf("FAM_SPOUSE", "FAM_FOUNDER"), parentMemberId: "FAM_FOUNDER" },
    ];
    const graph = buildDescentGraph(nodes);

    expect(graph.issues.some((i) => i.issue === "AFFINAL_WITH_PARENT_LINK")).toBe(true);
  });

  it("reports a duplicate member id instead of silently overwriting", () => {
    const graph = buildDescentGraph([founder, founder]);
    expect(graph.issues.some((i) => i.issue === "DUPLICATE_MEMBER")).toBe(true);
  });
});

describe("determineDescendantStatus — the direct descendant principle", () => {
  it("returns DIRECT_DESCENDANT for an unbroken, verified birth chain", () => {
    const nodes = [founder, gen2("FAM_G2A"), gen3("FAM_G3A", "FAM_G2A")];
    const graph = buildDescentGraph(nodes);

    const d = determineDescendantStatus(graph, "FAM_G3A", nodesOf(nodes));
    expect(d.status).toBe("DIRECT_DESCENDANT");
    expect(d.directDescendant).toBe(true);
    expect(d.generation).toBe(3);
    expect(d.blockers).toEqual([]);
    expect(d.chain).toEqual(["FAM_FOUNDER", "FAM_G2A", "FAM_G3A"]);
  });

  it("returns NON_DESCENDANT for a spouse, with the spouse rule stated as the basis", () => {
    const nodes = [founder, gen2("FAM_G2A"), spouseOf("FAM_SPOUSE", "FAM_G2A")];
    const graph = buildDescentGraph(nodes);

    const d = determineDescendantStatus(graph, "FAM_SPOUSE", nodesOf(nodes));
    expect(d.status).toBe("NON_DESCENDANT");
    expect(d.directDescendant).toBe(false);
    expect(d.blockers).toContain("AFFINAL_RELATIONSHIP");
    expect(d.basis.join(" ")).toMatch(/Marriage does not create direct-descendant status/);
  });

  it("returns NON_DESCENDANT for a former spouse", () => {
    const nodes: DescentNode[] = [
      founder,
      gen2("FAM_G2A"),
      { ...spouseOf("FAM_EX", "FAM_G2A"), relationshipToParent: "FORMER_SPOUSE_OF_MEMBER" },
    ];
    const graph = buildDescentGraph(nodes);
    expect(determineDescendantStatus(graph, "FAM_EX", nodesOf(nodes)).status).toBe("NON_DESCENDANT");
  });

  it("is INDETERMINATE, never DIRECT, when a link in the chain is unverified", () => {
    const nodes: DescentNode[] = [
      founder,
      { ...gen2("FAM_G2A"), verificationStatus: "UNVERIFIED" },
      gen3("FAM_G3A", "FAM_G2A"),
    ];
    const graph = buildDescentGraph(nodes);

    const d = determineDescendantStatus(graph, "FAM_G3A", nodesOf(nodes));
    expect(d.status).toBe("INDETERMINATE");
    expect(d.directDescendant).toBe(false);
    expect(d.blockers.join(" ")).toMatch(/LINEAGE_NOT_VERIFIED/);
  });

  it("does not decide adoption either way without a ratified treatment", () => {
    const nodes: DescentNode[] = [
      founder,
      { ...gen2("FAM_ADOPTED"), relationshipToParent: "ADOPTED_CHILD" },
    ];
    const graph = buildDescentGraph(nodes);

    const d = determineDescendantStatus(graph, "FAM_ADOPTED", nodesOf(nodes));
    expect(d.status).toBe("ADOPTION_UNCONFIRMED");
    expect(d.directDescendant).toBe(false);
    expect(d.policyDecisionRequired).not.toBeNull();
    expect(d.policyDecisionRequired?.status).toBe("OPEN");
    expect(d.policyDecisionRequired?.decision).toBeNull();
  });

  it("follows the ratified treatment once one is supplied", () => {
    const nodes: DescentNode[] = [
      founder,
      { ...gen2("FAM_ADOPTED"), relationshipToParent: "ADOPTED_CHILD" },
    ];
    const graph = buildDescentGraph(nodes);

    const included = determineDescendantStatus(graph, "FAM_ADOPTED", nodesOf(nodes), {
      treatedAsDirectDescendant: true,
      instrumentReference: "TRUST-2024 cl.7",
    });
    expect(included.status).toBe("DIRECT_DESCENDANT");

    const excluded = determineDescendantStatus(graph, "FAM_ADOPTED", nodesOf(nodes), {
      treatedAsDirectDescendant: false,
      instrumentReference: "TRUST-2024 cl.7",
    });
    expect(excluded.status).toBe("NON_DESCENDANT");
  });

  it("never treats a stepchild as a direct descendant without an explicit provision", () => {
    const nodes: DescentNode[] = [founder, { ...gen2("FAM_STEP"), relationshipToParent: "STEPCHILD" }];
    const graph = buildDescentGraph(nodes);

    const d = determineDescendantStatus(graph, "FAM_STEP", nodesOf(nodes), {
      treatedAsDirectDescendant: true,
      instrumentReference: "TRUST-2024 cl.7",
    });
    expect(d.status).toBe("INDETERMINATE");
    expect(d.blockers).toContain("STEPCHILD_STATUS_NOT_DEFINED_BY_GOVERNING_FRAMEWORK");
  });

  it("is INDETERMINATE for a member absent from the extract", () => {
    const graph = buildDescentGraph([founder]);
    const d = determineDescendantStatus(graph, "FAM_NOBODY", nodesOf([founder]));
    expect(d.status).toBe("INDETERMINATE");
    expect(d.blockers).toContain("MEMBER_NOT_IN_REGISTRY");
  });
});

describe("verifiedDescendantsOf", () => {
  it("excludes spouses attached to a descendant", () => {
    const nodes = [founder, gen2("FAM_G2A"), gen3("FAM_G3A", "FAM_G2A"), spouseOf("FAM_SPOUSE", "FAM_G2A")];
    const graph = buildDescentGraph(nodes);

    const descendants = verifiedDescendantsOf(graph, "FAM_FOUNDER", nodesOf(nodes));
    const ids = descendants.map((d) => d.memberId);

    expect(ids).toContain("FAM_G2A");
    expect(ids).toContain("FAM_G3A");
    expect(ids).not.toContain("FAM_SPOUSE");
  });
});

describe("reconcileStoredDescendantFlags", () => {
  it("reports a stored flag the engine cannot substantiate rather than honouring it", () => {
    const nodes: DescentNode[] = [founder, { ...gen2("FAM_G2A"), verificationStatus: "UNVERIFIED" }];
    const graph = buildDescentGraph(nodes);

    const reconciled = reconcileStoredDescendantFlags(
      graph,
      [{ memberId: "FAM_G2A", directDescendant: true }],
      nodesOf(nodes),
    );

    expect(reconciled[0].stored).toBe(true);
    expect(reconciled[0].engine).toBe(false);
    expect(reconciled[0].discrepancy).toBe(true);
  });
});

describe("assessLineageEvidence", () => {
  it("refuses to apply an unratified standard and raises a policy decision", () => {
    const assessment = assessLineageEvidence(
      "BIRTH_DESCENDANT",
      [
        {
          evidenceId: "FLE_1",
          memberId: "FAM_G2A",
          type: "BIRTH_CERTIFICATE",
          evidenceDate: "1990-01-01",
          issuer: "RITA",
          checksum: "abc123",
          documentId: "DOC_1",
        },
      ],
      { standardRatified: false },
    );

    expect(assessment.sufficient).toBe(false);
    expect(assessment.policyDecisionRequired).not.toBeNull();
    expect(assessment.policyDecisionRequired?.code).toBe("FAM-PD-001");
  });

  it("applies the candidate standard only once ratified, and reports what is missing", () => {
    const evidence = [
      {
        evidenceId: "FLE_1",
        memberId: "FAM_G2A",
        type: "BIRTH_CERTIFICATE" as const,
        evidenceDate: "1990-01-01",
        issuer: "RITA",
        checksum: "abc123",
        documentId: "DOC_1",
      },
    ];

    const insufficient = assessLineageEvidence("BIRTH_DESCENDANT", evidence, {
      standardRatified: true,
      ratifiedByReference: "FC-RES-001",
    });
    expect(insufficient.sufficient).toBe(false);
    expect(insufficient.missing).toContain("NATIONAL_ID");

    const sufficient = assessLineageEvidence(
      "BIRTH_DESCENDANT",
      [...evidence, { ...evidence[0], evidenceId: "FLE_2", type: "NATIONAL_ID" as const }],
      { standardRatified: true, ratifiedByReference: "FC-RES-001" },
    );
    expect(sufficient.sufficient).toBe(true);
    expect(sufficient.missing).toEqual([]);
  });

  it("rejects a malformed evidence date", () => {
    expect(() =>
      assessLineageEvidence(
        "BIRTH_DESCENDANT",
        [
          {
            evidenceId: "FLE_1",
            memberId: "FAM_G2A",
            type: "BIRTH_CERTIFICATE",
            evidenceDate: "01/01/1990",
            issuer: "RITA",
            checksum: "abc",
            documentId: "DOC_1",
          },
        ],
        { standardRatified: true },
      ),
    ).toThrow(FamilyInstitutionError);
  });
});

describe("AI authority boundary", () => {
  it("refuses an AI actor writing a lineage record", () => {
    expect(() => assertLineageWriteIsHuman("AI", "verify")).toThrow(/may not verify a family-line record/);
    expect(() => assertLineageWriteIsHuman("HUMAN", "verify")).not.toThrow();
    expect(() => assertLineageWriteIsHuman("SERVICE", "verify")).not.toThrow();
  });
});
