/**
 * BEYU Foundation OS — formation assessment engine (pure, deterministic).
 *
 * "START A FOUNDATION" intake → structured assessment. The engine compares the
 * foundation vehicle against jurisdiction-plausible alternatives and produces
 * checklists (registration, governance, funding, tax, compliance, professional
 * review), an owner map and a timeline. It is PROCESS GUIDANCE and LEGAL
 * INFORMATION — never legal advice — and always requires professional review
 * before formation proceeds.
 */

export type FormationIntake = {
  mission: string;
  activities: string[];
  beneficiaryScope: string;
  geographicScope: string;
  fundingModel: string;
  initialCapitalMinor?: number;
  endowmentTargetMinor?: number;
  governanceModel: string;
  jurisdictionCode: string;
  proposedVehicle: string;
  taxObjectives: string[];
  donorModel: string;
  grantmakingModel: string;
  internationalActivities: boolean;
  expectedWorkforce: number;
  relatedEntities: string[];
};

export type VehicleOption = {
  vehicle: string;
  suitability: "RECOMMENDED" | "VIABLE" | "POOR_FIT" | "NOT_APPLICABLE";
  rationale: string;
};

export type FormationAssessment = {
  readiness: "READY_FOR_REVIEW" | "NEEDS_MORE_INFORMATION" | "NOT_RECOMMENDED";
  summary: string;
  options: VehicleOption[];
  registrationRoadmap: string[];
  documentChecklist: string[];
  governanceChecklist: string[];
  fundingChecklist: string[];
  taxReviewChecklist: string[];
  complianceChecklist: string[];
  professionalReviewChecklist: string[];
  timelineWeeks: Array<{ phase: string; weeks: number; owner: string }>;
  risks: string[];
  openQuestions: string[];
  disclaimer: string;
};

export const FORMATION_DISCLAIMER =
  "LEGAL INFORMATION ONLY — this assessment is process guidance generated from the information you supplied. " +
  "It is not legal advice and not tax advice. Formation must not proceed until qualified counsel in the " +
  "relevant jurisdiction has reviewed and approved the structure, documents and filings.";

const VEHICLES = [
  "FOUNDATION",
  "CHARITABLE_TRUST",
  "NONPROFIT_COMPANY",
  "COMPANY_LIMITED_BY_GUARANTEE",
  "NGO",
  "PUBLIC_BENEFIT_ORGANIZATION",
  "SOCIAL_ENTERPRISE",
] as const;

function scoreVehicle(intake: FormationIntake, vehicle: (typeof VEHICLES)[number]): VehicleOption {
  const grantmaking = /grant/i.test(intake.grantmakingModel);
  const operating = /operat/i.test(intake.grantmakingModel) || intake.activities.length >= 3;
  const endowed = (intake.endowmentTargetMinor ?? 0) > 0;
  const memberBased = /member|community|association/i.test(intake.governanceModel + intake.donorModel);
  switch (vehicle) {
    case "FOUNDATION":
      if (intake.proposedVehicle === "FOUNDATION" && (endowed || grantmaking)) {
        return { vehicle, suitability: "RECOMMENDED", rationale: "Endowed and/or grantmaking intent with a dedicated governance model fits a foundation vehicle." };
      }
      return { vehicle, suitability: "VIABLE", rationale: "Plausible where the jurisdiction recognises foundations; confirm availability and minimum capital with counsel." };
    case "CHARITABLE_TRUST":
      return endowed && !operating
        ? { vehicle, suitability: "VIABLE", rationale: "Endowment stewardship without direct operations can suit a trust; trusteeship duties are strict." }
        : { vehicle, suitability: "POOR_FIT", rationale: "Operating activities and broad programs fit poorly in a pure trust wrapper." };
    case "NONPROFIT_COMPANY":
    case "COMPANY_LIMITED_BY_GUARANTEE":
      return operating
        ? { vehicle, suitability: "VIABLE", rationale: "Operating programs with staff and contracts often fit a nonprofit company form." }
        : { vehicle, suitability: "POOR_FIT", rationale: "A pure grantmaking endowment rarely needs a company wrapper." };
    case "NGO":
    case "PUBLIC_BENEFIT_ORGANIZATION":
      return /public|benefit|relief|aid|develop/i.test(intake.mission + intake.activities.join(" "))
        ? { vehicle, suitability: "VIABLE", rationale: "Public-benefit programming may qualify for NGO/PBO status where the jurisdiction offers it." }
        : { vehicle, suitability: "POOR_FIT", rationale: "No clear public-benefit programming signal in the stated mission." };
    case "SOCIAL_ENTERPRISE":
      return /enterprise|revenue|trading|business/i.test(intake.fundingModel)
        ? { vehicle, suitability: "VIABLE", rationale: "Earned-revenue funding suggests a social-enterprise analysis alongside nonprofit options." }
        : { vehicle, suitability: "NOT_APPLICABLE", rationale: "No earned-revenue signal; a nonprofit analysis is more appropriate." };
    default:
      return { vehicle, suitability: "NOT_APPLICABLE", rationale: "Unrecognised vehicle." };
  }
}

export function assessFormation(intake: FormationIntake): FormationAssessment {
  void memberCheck(intake);
  const openQuestions: string[] = [];
  if (!intake.mission.trim()) openQuestions.push("Mission statement is missing — formation cannot be assessed without a stated purpose.");
  if (intake.activities.length === 0) openQuestions.push("No activities listed — enumerate the foundation's intended activities.");
  if (!intake.jurisdictionCode.trim()) openQuestions.push("Jurisdiction is missing — vehicle availability is jurisdiction-specific.");
  if (!intake.fundingModel.trim()) openQuestions.push("Funding model is missing — state how the foundation will be capitalised and sustained.");
  if (intake.internationalActivities && intake.relatedEntities.length === 0) {
    openQuestions.push("International activities declared but no related entities listed — map cross-border flows before proceeding.");
  }

  const options = VEHICLES.map((v) => scoreVehicle(intake, v));
  const recommended = options.find((o) => o.suitability === "RECOMMENDED");
  const viable = options.filter((o) => o.suitability === "VIABLE");

  const risks: string[] = [];
  if (intake.internationalActivities) risks.push("Cross-border funding triggers additional licensing, reporting and sanctions-screening duties.");
  if ((intake.initialCapitalMinor ?? 0) <= 0) risks.push("No initial capital stated — under-capitalised foundations stall at registration or first audit.");
  if (intake.expectedWorkforce > 0 && intake.expectedWorkforce < 3) risks.push("A workforce below three concentrates segregation-of-duties risk.");
  if (intake.taxObjectives.length > 0) risks.push("Tax objectives require jurisdiction counsel confirmation; no exemption may be assumed.");
  risks.push("Founder control concentration must be reviewed against fiduciary and related-party rules.");

  const readiness =
    openQuestions.length >= 3
      ? "NEEDS_MORE_INFORMATION"
      : recommended || viable.length > 0
        ? "READY_FOR_REVIEW"
        : "NOT_RECOMMENDED";

  return {
    readiness,
    summary:
      readiness === "READY_FOR_REVIEW"
        ? `A foundation vehicle is ${recommended ? "recommended" : "plausible"} in ${intake.jurisdictionCode}; ${viable.length} alternative(s) merit comparison. Professional review is mandatory before formation.`
        : readiness === "NEEDS_MORE_INFORMATION"
          ? "The intake is incomplete; resolve the open questions before any vehicle decision."
          : "No suitable vehicle emerged from the supplied facts; restructure the concept with counsel before proceeding.",
    options,
    registrationRoadmap: [
      "Confirm vehicle availability and minimum requirements in the jurisdiction with counsel",
      "Reserve/approve the foundation name with the registration authority",
      "Draft constituent documents (deed/articles, bylaws, governance charter)",
      "Constitute the founding board and record appointments",
      "Open formation case evidence file and lodge the registration application",
      "Obtain registration certificate and tax registration; record tax status as UNDER_REVIEW",
      "Activate governance (first board meeting, resolutions, bank mandate)",
    ],
    documentChecklist: [
      "Founder KYC and source-of-funds evidence",
      "Draft deed/articles of incorporation",
      "Bylaws and governance charter",
      "Board consent letters and conflict declarations",
      "Registered-office evidence",
      "Capital/endowment commitment letters",
    ],
    governanceChecklist: [
      "Board composition meets the jurisdiction minimum",
      "Fiduciary duties acknowledged in writing",
      "Conflict-of-interest policy adopted",
      "Authority matrix and signing powers recorded",
      "Meeting cadence and quorum rules adopted",
    ],
    fundingChecklist: [
      "Initial capital committed and traceable",
      "Endowment vs operating capital separated",
      "Restricted-fund policy drafted",
      "Donor acceptance and due-diligence policy drafted",
    ],
    taxReviewChecklist: [
      "Applicable tax rule identified with authority, source and effective date",
      "Exemption eligibility assessed — never assumed",
      "Donor deductibility position documented per jurisdiction",
      "Withholding/VAT position on cross-border flows reviewed",
    ],
    complianceChecklist: [
      "Registration authority filings mapped to the compliance registry",
      "First-year filing calendar generated with owners",
      "Regulatory-change watch subscribed for the jurisdiction",
      "Audit and reporting obligations assigned",
    ],
    professionalReviewChecklist: [
      "Jurisdiction counsel: structure opinion",
      "Tax adviser: exemption and donor-benefit opinion",
      "Governance reviewer: board and charter adequacy",
      "Compliance reviewer: filing and reporting calendar",
    ],
    timelineWeeks: [
      { phase: "Feasibility & intake completion", weeks: 2, owner: "FOUNDATION_OFFICER" },
      { phase: "Structure & jurisdiction review", weeks: 3, owner: "FOUNDATION_OFFICER" },
      { phase: "Legal review & document drafting", weeks: 4, owner: "External counsel" },
      { phase: "Tax review", weeks: 3, owner: "Tax adviser" },
      { phase: "Governance activation", weeks: 2, owner: "FOUNDATION_DIRECTOR" },
      { phase: "Registration & tax status", weeks: 6, owner: "FOUNDATION_OFFICER" },
    ],
    risks,
    openQuestions,
    disclaimer: FORMATION_DISCLAIMER,
  };
}

function memberCheck(intake: FormationIntake): boolean {
  return /member|community|association/i.test(intake.governanceModel + intake.donorModel);
}
