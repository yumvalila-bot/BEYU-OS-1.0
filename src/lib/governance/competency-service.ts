import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  governanceBodies,
  governanceCharters,
  governanceCharterTerms,
  governanceMembers,
  parties,
} from "@/db/schema";
import type { Principal } from "../authz";
import { readGoverningBody } from "./body-authority";
import {
  COMPETENCY_DOMAINS,
  type CompetencyDomain,
  type BoardCompositionAnalysis,
  type SuccessionPlan,
  type MemberCompetencyEvidence,
  type IndependenceIndicator,
} from "./competency-contract";
import { assessComposition } from "./charter-rules";

/** Standard inferred competency mapping by seat role and historical appointment evidence. */
const ROLE_DEFAULT_COMPETENCIES: Record<string, CompetencyDomain[]> = {
  CHAIR: ["GOVERNANCE_LEADERSHIP", "STRATEGY_SCALE"],
  VICE_CHAIR: ["GOVERNANCE_LEADERSHIP", "RISK_INTERNAL_CONTROLS"],
  SECRETARY: ["GOVERNANCE_LEADERSHIP", "LEGAL_REGULATORY"],
  TREASURER: ["FINANCIAL_AUDIT", "RISK_INTERNAL_CONTROLS"],
  INDEPENDENT_MEMBER: ["LEGAL_REGULATORY", "RISK_INTERNAL_CONTROLS"],
  MEMBER: ["INDUSTRY_SECTOR", "STRATEGY_SCALE"],
  COMMITTEE_MEMBER: ["INDUSTRY_SECTOR", "ESG_SUSTAINABILITY"],
  OBSERVER: ["ESG_SUSTAINABILITY"],
};

const ROLE_DEFAULT_INDEPENDENCE: Record<string, IndependenceIndicator> = {
  INDEPENDENT_MEMBER: "INDEPENDENT_NON_EXECUTIVE",
  CHAIR: "INDEPENDENT_NON_EXECUTIVE",
  SECRETARY: "INDEPENDENT_NON_EXECUTIVE",
  TREASURER: "INDEPENDENT_NON_EXECUTIVE",
  VICE_CHAIR: "INDEPENDENT_NON_EXECUTIVE",
  MEMBER: "EXECUTIVE_DIRECTOR",
  COMMITTEE_MEMBER: "INDEPENDENT_NON_EXECUTIVE",
  OBSERVER: "SHAREHOLDER_REPRESENTATIVE",
};

export async function analyzeBoardComposition(
  principal: Principal,
  bodyId: string,
  asOf = new Date().toISOString().slice(0, 10),
): Promise<BoardCompositionAnalysis> {
  const body = await readGoverningBody(principal, bodyId);

  // Load active adopted charter terms
  const [charter] = await db
    .select()
    .from(governanceCharters)
    .where(and(eq(governanceCharters.bodyId, body.id), inArray(governanceCharters.status, ["ADOPTED", "APPROVED"])))
    .orderBy(desc(governanceCharters.version))
    .limit(1);

  const [terms] = charter
    ? await db.select().from(governanceCharterTerms).where(eq(governanceCharterTerms.id, charter.id))
    : [];

  const allMembers = await db
    .select({
      id: governanceMembers.id,
      bodyId: governanceMembers.bodyId,
      partyId: governanceMembers.partyId,
      seatRole: governanceMembers.seatRole,
      votingRights: governanceMembers.votingRights,
      appointedOn: governanceMembers.appointedOn,
      retiredOn: governanceMembers.retiredOn,
      lifecycleStatus: governanceMembers.lifecycleStatus,
      displayName: parties.displayName,
    })
    .from(governanceMembers)
    .innerJoin(parties, eq(parties.id, governanceMembers.partyId))
    .where(eq(governanceMembers.bodyId, body.id));

  const activeMembers = allMembers.filter(
    (m) =>
      m.lifecycleStatus === "ACTIVE" &&
      m.appointedOn <= asOf &&
      (!m.retiredOn || m.retiredOn >= asOf),
  );

  const votingMembers = activeMembers.filter((m) => m.votingRights);

  // Expiration within 90 days
  const asOfTime = new Date(asOf).getTime();
  const ninetyDaysLater = new Date(asOfTime + 90 * 86400000).toISOString().slice(0, 10);
  const expiringWithin90Days = activeMembers.filter(
    (m) => m.retiredOn && m.retiredOn >= asOf && m.retiredOn <= ninetyDaysLater,
  ).length;

  // Domain coverage analysis
  const domainCoverage: Record<CompetencyDomain, number> = {
    GOVERNANCE_LEADERSHIP: 0,
    FINANCIAL_AUDIT: 0,
    LEGAL_REGULATORY: 0,
    INDUSTRY_SECTOR: 0,
    RISK_INTERNAL_CONTROLS: 0,
    TECHNOLOGY_SECURITY: 0,
    ESG_SUSTAINABILITY: 0,
    STRATEGY_SCALE: 0,
  };

  let independentCount = 0;
  for (const member of activeMembers) {
    const defaultCompetencies = ROLE_DEFAULT_COMPETENCIES[member.seatRole] ?? ["INDUSTRY_SECTOR"];
    for (const d of defaultCompetencies) {
      domainCoverage[d] = (domainCoverage[d] || 0) + 1;
    }
    const ind = ROLE_DEFAULT_INDEPENDENCE[member.seatRole] ?? "EXECUTIVE_DIRECTOR";
    if (ind === "INDEPENDENT_NON_EXECUTIVE") independentCount++;
  }

  const coveredDomains = COMPETENCY_DOMAINS.filter((d) => domainCoverage[d] > 0);
  const competencyGaps = COMPETENCY_DOMAINS.filter((d) => domainCoverage[d] === 0);
  const competencyCoverageRatio = Number((coveredDomains.length / COMPETENCY_DOMAINS.length).toFixed(2));
  const independenceRatio = activeMembers.length > 0 ? Number((independentCount / activeMembers.length).toFixed(2)) : 0;

  // Charter composition assessment
  const compositionAssessment = terms
    ? assessComposition(terms.rules, allMembers, asOf)
    : { satisfied: true, violations: [] as string[], votingMembers: votingMembers.length };

  const requiredSeatCount = terms?.rules?.minimumVotingMembers ?? body.quorumMinimum;
  const vacancies = Math.max(0, requiredSeatCount - votingMembers.length);

  // Succession plans for key leadership seats
  const successionReadiness: SuccessionPlan[] = [
    {
      targetSeatRole: "CHAIR",
      primaryCandidatePartyId: activeMembers.find((m) => m.seatRole === "VICE_CHAIR")?.partyId,
      backupCandidatePartyId: activeMembers.find((m) => m.seatRole === "SECRETARY")?.partyId,
      readinessTimeline: activeMembers.some((m) => m.seatRole === "VICE_CHAIR") ? "SHORT_TERM_6M" : "MEDIUM_TERM_18M",
      developmentRequirements: ["Board leadership transition module", "Stakeholder & shareholder alignment"],
      trainingModules: ["Corporate Governance Advanced Leadership", "Crisis Communication & Management"],
      notes: "Succession plan is justified guidance only; appointment requires independent nomination and resolution vote.",
    },
    {
      targetSeatRole: "SECRETARY",
      primaryCandidatePartyId: activeMembers.find((m) => m.seatRole === "MEMBER" && m.votingRights)?.partyId,
      readinessTimeline: "SHORT_TERM_6M",
      developmentRequirements: ["Statutory compliance & board minute integrity", "Corporate filings & notifications"],
      trainingModules: ["Charter Administration", "Governance Recordkeeping Standards"],
      notes: "Ensures administrative continuity without automated appointments.",
    },
    {
      targetSeatRole: "TREASURER",
      primaryCandidatePartyId: activeMembers.find((m) => m.seatRole === "INDEPENDENT_MEMBER")?.partyId,
      readinessTimeline: "MEDIUM_TERM_18M",
      developmentRequirements: ["IFRS statutory audit review", "Group treasury and capital allocation oversight"],
      trainingModules: ["Audit Committee Financial Literacy", "Enterprise Risk & Capital Controls"],
      notes: "Audit literacy requirement informs candidate selection.",
    },
  ];

  return {
    bodyId: body.id,
    bodyCode: body.code,
    asOfDate: asOf,
    totalSeats: activeMembers.length + vacancies,
    activeMembers: activeMembers.length,
    votingMembers: votingMembers.length,
    vacancies,
    expiringWithin90Days,
    independenceRatio,
    competencyCoverageRatio,
    domainCoverage,
    competencyGaps,
    compositionSatisfied: compositionAssessment.satisfied,
    violations: compositionAssessment.violations,
    successionReadiness,
  };
}

export function evaluateCandidateCompetencyFit(
  candidateEvidence: MemberCompetencyEvidence[],
  requiredDomains: CompetencyDomain[],
) {
  const verifiedDomains = new Set(candidateEvidence.map((e) => e.domain));
  const matched = requiredDomains.filter((d) => verifiedDomains.has(d));
  const missing = requiredDomains.filter((d) => !verifiedDomains.has(d));
  const fitScore = requiredDomains.length > 0 ? Number((matched.length / requiredDomains.length).toFixed(2)) : 1;

  return {
    fitScore,
    matchedDomains: matched,
    missingDomains: missing,
    suitable: fitScore >= 0.5,
    recommendedTraining: missing.map((m) => `Professional development in ${m.replace("_", " ")}`),
  };
}
