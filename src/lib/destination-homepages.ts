/**
 * PUBLIC HOMEPAGE CONTENT — the ONE registry of destination *public* copy.
 *
 * WHAT THIS IS
 *   The public, anonymous-facing marketing content of the seven canonical
 *   destination hosts (`health.`, `finance.`, `agriculture.`, `ujenzi.`,
 *   `foundation.`, `familyoffice.`, `noelia.`). It is keyed by the EXISTING
 *   catalogue code (`src/lib/operating-system-catalog.ts`) and carries no
 *   identity facts at all: the destination's name, registry code, class,
 *   global status, accent and headline are read from the ONE catalogue entry
 *   the host resolved. This module adds only the copy the catalogue does not
 *   already own.
 *
 * WHAT THIS IS NOT
 *   • Not a destination registry, hostname table or second catalogue. There is
 *     no `subdomain`, no `href`, no host and no status in this file.
 *   • Not an authorization input. Nothing here is read by any gate, and no
 *     entry can grant, imply or widen access. The public homepage is served to
 *     an ANONYMOUS visitor only; the destination route re-runs its own
 *     server-side authorization on every request regardless of what a visitor
 *     read here.
 *   • Not a claim of capability readiness. A destination can be `ACTIVE` while
 *     an individual capability remains independently governed; the copy below
 *     describes the governed remit, and each page states its honest limits.
 *
 * CONSTITUTIONAL ACCURACY (enforced by tests/architecture and reviewed copy)
 *   • Finance OS is operational financial truth; BEYU FINANCE is never described
 *     as a licensed commercial bank, and CAP_POSTING stays separately governed.
 *   • Foundation is a nonprofit SISTER ORGANIZATION — never a subsidiary or OS.
 *   • Family Office is a shared capability with exactly SIX canonical
 *     categories, and never modelled as an operating system.
 *   • NOELIA is ONE governed intelligence layer on HIVE — never a per-OS AI
 *     identity, and never able to approve or execute material actions alone.
 */

/** Destination codes that have a public homepage (every canonical destination except BEYU). */
export type PublicHomepageCode =
  | "HEALTH"
  | "FINANCE"
  | "AGRICULTURE"
  | "UJENZI"
  | "FOUNDATION"
  | "FAMILY_OFFICE"
  | "NOELIA_AI";

/** One institutionally named area of a destination's remit. */
export type PublicHomepageArea = {
  /** Short institutional name, e.g. "Clinical care". */
  readonly title: string;
  /** One honest sentence describing the governed remit. */
  readonly detail: string;
};

/** A public content section, rendered with a real in-page anchor. */
export type PublicHomepageSection = {
  /** Anchor id. Unique within the page; used by the page's own navigation. */
  readonly id: string;
  /** Section heading. */
  readonly title: string;
  /** Section introduction. */
  readonly intro: string;
  /** The areas this section presents. */
  readonly areas: readonly PublicHomepageArea[];
};

export type DestinationPublicHomepage = {
  /** The hero's second line: the destination's public purpose. */
  readonly promise: string;
  /** The institutional mission statement (the `about` block). */
  readonly mission: string;
  /** Ordered public content sections (each with its own anchor id). */
  readonly sections: readonly PublicHomepageSection[];
  /**
   * Honest public limits. Rendered verbatim in the governance block: these are
   * the statements that keep the public page from over-claiming.
   */
  readonly notices: readonly string[];
};

/**
 * The seven destination public homepages.
 *
 * Ordering matches the catalogue (`SECTOR_OPERATING_SYSTEMS`, then Foundation,
 * then the shared surfaces) so every surface that lists destinations keeps one
 * order.
 */
export const DESTINATION_PUBLIC_HOMEPAGES: Readonly<Record<PublicHomepageCode, DestinationPublicHomepage>> = {
  HEALTH: {
    promise: "Federated care operations under canonical BEYU identity.",
    mission:
      "Health OS is the governed operating system for healthcare delivery across the BEYU ecosystem: clinical operations, hospital administration, diagnostics, pharmacy, patient services and the institutional interfaces that connect care to payers and regulators. Care data is the highest classification tier in BEYU, so every capability is tenant-isolated, least-privilege and fully audited.",
    sections: [
      {
        id: "care",
        title: "Clinical care",
        intro:
          "Care delivery is recorded where it happens, under the identity of the clinician who delivered it, and never in a shared or generic identity.",
        areas: [
          { title: "Patient services", detail: "Registration, encounters, appointments and the patient journey under governed consent." },
          { title: "Clinical records", detail: "Encounter documentation with attribution, amendment history and classification controls." },
          { title: "Care coordination", detail: "Referrals, handovers and multi-disciplinary work ordered through governed workflow." },
          { title: "Safeguarding", detail: "Consent, access justification and audit trails for the most restricted health information." },
        ],
      },
      {
        id: "operations",
        title: "Hospital & facility operations",
        intro:
          "Operational truth for facilities, staff and stock — governed by the same kernel as the rest of the ecosystem, separated by tenant and entity.",
        areas: [
          { title: "Facilities & wards", detail: "Sites, departments, beds and service capacity as governed operational records." },
          { title: "Workforce & rosters", detail: "Clinical staffing and duty rosters through the shared HCM employee master." },
          { title: "Diagnostics & pharmacy", detail: "Laboratory orders, results, prescriptions and dispensing under controlled access." },
          { title: "Inventory & supply", detail: "Medical stock, consumables and equipment with movement-level audit." },
        ],
      },
      {
        id: "institutional",
        title: "Payer & institutional interfaces",
        intro:
          "Governed exchange with the institutions a health provider answers to — each interface independently authorized and audited.",
        areas: [
          { title: "Payers & claims", detail: "Coverage, claims and settlement interfaces with governed financial truth in Finance OS." },
          { title: "Regulators & reporting", detail: "Statutory returns and inspection evidence produced from governed records." },
          { title: "Referral networks", detail: "Inter-provider exchange limited to an active, authorized care relationship." },
          { title: "Health federation", detail: "Canonical BEYU identity is federated into Health OS server-side on every request." },
        ],
      },
      {
        id: "governance",
        title: "Healthcare governance",
        intro:
          "Health OS is governed, not merely hosted: authority, consent and evidence are structural properties of the platform.",
        areas: [
          { title: "Access governance", detail: "RBAC and ABAC over tenant, entity, country, classification and care relationship." },
          { title: "Separation of duties", detail: "Clinical, administrative and financial authority are held by different grants." },
          { title: "Evidence & audit", detail: "Hash-chained audit for every consequential health action." },
          { title: "Availability", detail: "Federation and authorization failures fail closed, with an honest availability state." },
        ],
      },
    ],
    notices: [
      "The public homepage presents Health OS's governed remit; it grants no access to any clinical record.",
      "Patient and clinical data are never exposed on a public surface. Access is decided server-side after sign-in.",
      "Health OS authorization is federated from canonical BEYU identity through an active, governed identity link.",
    ],
  },

  FINANCE: {
    promise: "The canonical financial authority of the BEYU ecosystem.",
    mission:
      "Finance OS owns operational financial truth: the ledger, accounting periods, treasury, budgeting, reporting and financial controls for the BEYU ecosystem. It is the system of record for financial events and it keeps financial history immutable — balances are never overwritten, they are corrected by governed entries.",
    sections: [
      {
        id: "operations",
        title: "Accounting & financial operations",
        intro:
          "One ledger of record, one chart of accounts and one governed posting path — under the same constitution as the rest of BEYU.",
        areas: [
          { title: "General ledger", detail: "Journals, accounts and periods with DB-enforced balance invariants." },
          { title: "Receivables & payables", detail: "Invoicing, settlement and counterparty balances reconciled to the ledger." },
          { title: "Consolidation", detail: "Multi-company consolidation through MCM under governed intercompany rules." },
          { title: "Fixed assets", detail: "Asset registers, depreciation and disposal recorded as governed events." },
        ],
      },
      {
        id: "treasury",
        title: "Treasury & capital",
        intro:
          "Liquidity, banking relationships and capital structure are governed capabilities, not ad-hoc spreadsheets.",
        areas: [
          { title: "Liquidity & cash", detail: "Positions, forecasts and liquidity policy evaluated against governed limits." },
          { title: "Banking & payments", detail: "Payment instructions routed through governed payment providers and reconciliation." },
          { title: "Capital structure", detail: "Equity, debt and waterfall mechanics under the constitutional capital rules." },
          { title: "Strategic capital", detail: "Capital governance remains with BEYU OS; operational financial truth stays here." },
        ],
      },
      {
        id: "reporting",
        title: "Budgeting & financial reporting",
        intro:
          "Planning and reporting are derived from the same governed records that carry operational truth, so a report can always be traced to its evidence.",
        areas: [
          { title: "Budgets & forecasts", detail: "Budget versions, commitments and variance against actuals." },
          { title: "Management reporting", detail: "Statements and management packs produced from governed ledger data." },
          { title: "Statutory reporting", detail: "Jurisdiction-aware returns and tax reporting through governed rules." },
          { title: "Decision evidence", detail: "Every report cites the periods, entities and policies it was produced under." },
        ],
      },
      {
        id: "controls",
        title: "Financial controls",
        intro:
          "Finance OS is built to be controlled: segregation of duties, approval thresholds and an immutable audit chain are structural.",
        areas: [
          { title: "Approval authority", detail: "Thresholds and delegated authority enforced server-side, never in the browser." },
          { title: "Segregation of duties", detail: "Preparation and approval cannot be held by one grant." },
          { title: "Reconciliation", detail: "Payments, providers and ledger reconciled with recorded exceptions." },
          { title: "Audit trail", detail: "Hash-chained, attributable evidence for every consequential financial action." },
        ],
      },
    ],
    notices: [
      "BEYU FINANCE is an institutional finance operating system. It is not a licensed commercial bank and does not present itself as one.",
      "Financial posting is a separately governed capability: an ACTIVE Finance OS does not enable posting, and CAP_POSTING remains locked and fail-closed.",
      "The public homepage presents Finance OS's governed remit; it grants no access to any financial record.",
    ],
  },

  AGRICULTURE: {
    promise: "Production, traceability and distribution under BEYU governance.",
    mission:
      "Agriculture OS is the governed operating system for agricultural production and its value chain: land and farms, crop cycles and livestock, inputs and inventory, harvests and storage, and the traceability and distribution that carry product to market and across borders.",
    sections: [
      {
        id: "production",
        title: "Agricultural production",
        intro:
          "Production is recorded as it happens — per field, per cycle, per animal — so yield, cost and compliance all trace to the same evidence.",
        areas: [
          { title: "Land & fields", detail: "Parcels, field zones and soil records as governed spatial assets." },
          { title: "Crop cycles", detail: "Planting, inputs, observations and harvests against a governed cycle." },
          { title: "Livestock", detail: "Herd and animal records, health events and production yields." },
          { title: "Aquaculture & trees", detail: "Ponds, stockings and plantings managed on the same governed model." },
        ],
      },
      {
        id: "farm-management",
        title: "Farm & estate management",
        intro:
          "Farms are managed as governed operating units with their own plans, budgets, equipment and workforce.",
        areas: [
          { title: "Farm plans & budgets", detail: "Seasonal plans, project budgets and milestones against actuals." },
          { title: "Field tasks", detail: "Work orders, assignments and completion evidence from the field." },
          { title: "Equipment & service", detail: "Machinery, maintenance and utilisation recorded per asset." },
          { title: "Environment & weather", detail: "Irrigation, water quality and environmental readings held as evidence." },
        ],
      },
      {
        id: "supply-chain",
        title: "Inputs, inventory & supply chain",
        intro:
          "From input procurement to warehouse movement, stock is a governed record with lot-level provenance.",
        areas: [
          { title: "Inputs & suppliers", detail: "Seed, fertiliser, feed and veterinary inputs with supplier records." },
          { title: "Inventory & lots", detail: "Lots, movements and storage records with quantity and provenance." },
          { title: "Warehouses", detail: "Storage capacity, conditions and stock reconciliation." },
          { title: "Procurement", detail: "Requisitions, purchase orders and approvals under finance controls." },
        ],
      },
      {
        id: "traceability",
        title: "Traceability & distribution",
        intro:
          "Traceability is the point of the platform: a batch can be followed from field to buyer, and export compliance is evidenced rather than asserted.",
        areas: [
          { title: "Batch traceability", detail: "Trace batches and links across production, storage and shipment." },
          { title: "Export compliance", detail: "Requirements, checks, permits and holds recorded against each order." },
          { title: "Orders & shipments", detail: "Buyers, allocations, shipments and delivery milestones." },
          { title: "Certification", detail: "Certificates, inspections and corrective actions retained as evidence." },
        ],
      },
    ],
    notices: [
      "The public homepage presents Agriculture OS's governed remit; it grants no access to any production or trade record.",
      "Traceability and export compliance evidence are produced from governed records, not from unverified assertions.",
      "An ACTIVE Agriculture OS does not certify every capability: each governed module keeps its own readiness state.",
    ],
  },

  UJENZI: {
    promise: "The governed engineering and construction operating system.",
    mission:
      "Ujenzi OS governs construction and engineering delivery end to end: projects and sites, bills of quantities, procurement and materials, cost control, quality and safety, variations and claims, payment certification and handover — with every consequential decision attributable.",
    sections: [
      {
        id: "delivery",
        title: "Construction & engineering delivery",
        intro:
          "Projects are delivered against a governed baseline: versioned scope, phased milestones and recorded site reality.",
        areas: [
          { title: "Projects & sites", detail: "Project registers, sites, phases and milestones as governed records." },
          { title: "Bills of quantities", detail: "Governed BOQ versions and items, with approval before use." },
          { title: "Site operations", detail: "Site diaries, daily records and field evidence attached to the project." },
          { title: "Handover", detail: "Punch items, completion evidence and structured handover." },
        ],
      },
      {
        id: "commercial",
        title: "Cost control & commercial management",
        intro:
          "Commercial truth is derived from governed records, so a claim or a certificate can always be traced to its evidence.",
        areas: [
          { title: "Cost records", detail: "Committed and actual cost against budget, by phase and work package." },
          { title: "Variations", detail: "Variation orders with governed decision and effect on contract value." },
          { title: "Claims", detail: "Claims captured with supporting evidence and approval history." },
          { title: "Payment certificates", detail: "Valuation and certification under separation of duties." },
        ],
      },
      {
        id: "procurement",
        title: "Procurement, materials & equipment",
        intro:
          "Supply is governed: requisitions and purchase orders follow approval authority, and materials and plant are tracked as assets.",
        areas: [
          { title: "Requisitions & orders", detail: "Requisitions, purchase orders and approvals under finance controls." },
          { title: "Materials", detail: "Material registers, movements and reconciliation to site consumption." },
          { title: "Equipment", detail: "Plant allocation, utilisation and maintenance per asset." },
          { title: "Subcontractors", detail: "Engagement, obligations and performance recorded against the project." },
        ],
      },
      {
        id: "quality-safety",
        title: "Quality, safety & governance",
        intro:
          "Quality and safety are enforced as governed process, not paperwork appended at the end of a project.",
        areas: [
          { title: "Quality & inspections", detail: "Inspection requests, results and non-conformance closure." },
          { title: "HSE", detail: "Hazards, incidents, toolbox talks and corrective actions." },
          { title: "Evidence & audit", detail: "Hash-chained audit for every consequential engineering decision." },
          { title: "Governed limits", detail: "BIM, engineering calculations and government links keep their own governed state." },
        ],
      },
    ],
    notices: [
      "The public homepage presents Ujenzi OS's governed remit; it grants no access to any project, contract or commercial record.",
      "An ACTIVE Ujenzi OS does not certify every capability: BIM, engineering calculations and government integrations remain independently governed.",
      "Payment certification and variation decisions require governed human approval — no automated authority is implied.",
    ],
  },

  FOUNDATION: {
    promise: "A nonprofit sister organization, governed alongside the BEYU ecosystem.",
    mission:
      "The BEYU Foundation is a separate nonprofit sister organization — not a subsidiary, not a sector company and not an operating system. It runs programs, partnerships, philanthropy and community impact under its own governed scope, with safeguarding, accountability and reporting held to the same institutional standard as the rest of BEYU.",
    sections: [
      {
        id: "mission",
        title: "Nonprofit mission",
        intro:
          "The Foundation exists to convert institutional capability into durable public benefit, with an explicit mandate and a governed boundary around it.",
        areas: [
          { title: "Charter & mandate", detail: "Formation, structures and governing documents recorded as institution." },
          { title: "Programs", detail: "Programmes with defined objectives, budgets and beneficiaries." },
          { title: "Community impact", detail: "Impact measured against stated outcomes, not asserted." },
          { title: "Independence", detail: "A separate sister organization with its own governance and accountability." },
        ],
      },
      {
        id: "stewardship",
        title: "Funds, grants & philanthropy",
        intro:
          "Money given for public benefit is stewarded under the same financial controls as institutional capital.",
        areas: [
          { title: "Donors & funds", detail: "Donor records, restricted and unrestricted funds with governed balances." },
          { title: "Grants", detail: "Grant awards, milestones and disbursement under approval authority." },
          { title: "Philanthropy", detail: "Philanthropic programmes with stated purpose and reporting." },
          { title: "Procurement", detail: "Foundation procurement under governed thresholds." },
        ],
      },
      {
        id: "accountability",
        title: "Safeguarding & accountability",
        intro:
          "Beneficiaries are the most sensitive population the ecosystem serves; safeguarding is therefore a first-class governed capability.",
        areas: [
          { title: "Safeguarding", detail: "Safeguarding cases, escalation and duty-of-care obligations." },
          { title: "Beneficiaries", detail: "Beneficiary records protected by classification and consent." },
          { title: "Governance", detail: "Boards, resolutions and delegated authority for the Foundation." },
          { title: "Transparency", detail: "Reporting and impact disclosure produced from governed records." },
        ],
      },
    ],
    notices: [
      "The BEYU Foundation is a nonprofit sister organization. It is not a subsidiary, a sector company or a Sector OS.",
      "Confidential beneficiary and safeguarding information is never exposed on a public surface.",
      "The public homepage presents the Foundation's mission and programmes; it grants no access to any Foundation record.",
    ],
  },

  FAMILY_OFFICE: {
    promise: "Multigenerational family governance and stewardship, inside BEYU OS.",
    mission:
      "The BEYU Family Office is a shared institutional capability — never an operating system — for multigenerational family governance, wealth stewardship and protection. It works through the Family Constitution, the Family Assembly and Council, and the trust structures that carry the family's intent across generations.",
    sections: [
      {
        id: "categories",
        title: "The six canonical categories",
        intro:
          "Family Office work is organised into exactly six categories. They are constitutionally closed: no seventh category is invented and none is folded into another.",
        areas: [
          { title: "1 · Business Development", detail: "Enterprise development and family business interests under governed oversight." },
          { title: "2 · Wealth Management", detail: "Investment policy, portfolio governance and performance stewardship." },
          { title: "3 · Wealth Planning", detail: "Structuring, succession and the orderly transfer of wealth across generations." },
          { title: "4 · Family Governance", detail: "Constitution, Assembly, Council and the rules the family governs itself by." },
          { title: "5 · Lifestyle Management", detail: "Family lifestyle, residences and personal arrangements under confidentiality." },
          { title: "6 · Philanthropy", detail: "Family giving and philanthropic vehicles with stated purpose and reporting." },
        ],
      },
      {
        id: "governance",
        title: "Multigenerational governance",
        intro:
          "The family governs itself through written instruments and recorded decisions, so intent survives the generation that wrote it.",
        areas: [
          { title: "Family Constitution", detail: "The founding instrument: values, rights, obligations and amendment process." },
          { title: "Family Assembly", detail: "The convened body of the family, with defined membership and resolutions." },
          { title: "Family Council", detail: "The delegated body that acts between Assemblies under recorded authority." },
          { title: "Decision journal", detail: "A durable, attributable record of consequential family decisions." },
        ],
      },
      {
        id: "stewardship",
        title: "Trust & succession stewardship",
        intro:
          "Trust structures and succession are governed by recorded authority, with confidential family information restricted to those entitled to it.",
        areas: [
          { title: "Trust governance", detail: "Trustee authority, obligations and constitutional decision surfaces." },
          { title: "Succession planning", detail: "Generational transfer plans with governed approval and review." },
          { title: "Wealth & capital", detail: "Generational wealth, liquidity and capital requests under committee oversight." },
          { title: "Protection", detail: "Family protection policies, assessments and claims held confidentially." },
        ],
      },
    ],
    notices: [
      "Family Office is a shared capability inside BEYU OS. There is no separate family-office operating system, and none is created by this site.",
      "Confidential family information is protected by classification and highly restricted grants; none of it appears on a public surface.",
      "Family Office access requires a governed grant; reaching this hostname grants nothing.",
    ],
  },

  NOELIA_AI: {
    promise: "One governed intelligence layer — Intelligence · Governance · Care.",
    mission:
      "NOELIA_AI is the single governed intelligence identity of the BEYU ecosystem, running on the HIVE runtime. There is one NOELIA: not a per-sector AI persona, not a separate assistant per operating system, and never an authority. NOELIA assists, explains, drafts and prepares — under policy, permission and human oversight.",
    sections: [
      {
        id: "identity",
        title: "One identity — Queen Bee",
        intro:
          "NOELIA is the governing intelligence of the hive: a single identity that orchestrates governed capabilities rather than multiplying personas.",
        areas: [
          { title: "Single identity", detail: "One NOELIA across every operating system and capability — never sector-specific." },
          { title: "Queen Bee", detail: "Coordinates the governed hive of capabilities without holding their authority." },
          { title: "Intelligence · Governance · Care", detail: "Insight is always read through governance and care for the people it affects." },
          { title: "HIVE runtime", detail: "The governed execution substrate for NOELIA's tools and workflows." },
        ],
      },
      {
        id: "governed-intelligence",
        title: "Governed intelligence",
        intro:
          "Every NOELIA request is resolved against the requesting identity's real permissions before any tool is reached.",
        areas: [
          { title: "Permission-aware assistance", detail: "Answers and tools are limited to what the requesting identity may already see." },
          { title: "Policy-bound", detail: "Data classification, tenant scope and policy are evaluated before execution." },
          { title: "Audited end to end", detail: "Prompts, tools, outputs and approvals are attributable in the audit chain." },
          { title: "Memory with consent", detail: "Memory is opt-in, scoped and revocable — never a hidden record of a person." },
        ],
      },
      {
        id: "oversight",
        title: "Human oversight",
        intro:
          "NOELIA is advisory by design. Consequential actions remain human decisions, and NOELIA cannot manufacture that decision.",
        areas: [
          { title: "Advisory by design", detail: "NOELIA prepares and recommends; it does not decide." },
          { title: "Material-action approval", detail: "Material actions require explicit human authorization through governed workflow." },
          { title: "Institutional decision support", detail: "Briefs, analyses and drafts built on records the identity may access." },
          { title: "No autonomous execution", detail: "NOELIA cannot autonomously approve or execute a material action." },
        ],
      },
    ],
    notices: [
      "NOELIA cannot autonomously approve or execute material actions. Human accountability is not delegated to the AI.",
      "NOELIA is one governed identity on HIVE: there is no sector-specific NOELIA and no per-operating-system AI identity.",
      "The public homepage describes NOELIA's governed remit; it grants no access to NOELIA or to any institutional record.",
    ],
  },
};

/** The public homepage content for a destination code, or null for the control plane. */
export function publicHomepageFor(code: string): DestinationPublicHomepage | null {
  return (DESTINATION_PUBLIC_HOMEPAGES as Record<string, DestinationPublicHomepage | undefined>)[code] ?? null;
}

/** Every public homepage code, in catalogue order. */
export const PUBLIC_HOMEPAGE_CODES: readonly PublicHomepageCode[] = [
  "HEALTH",
  "FINANCE",
  "AGRICULTURE",
  "UJENZI",
  "FOUNDATION",
  "FAMILY_OFFICE",
  "NOELIA_AI",
] as const;
