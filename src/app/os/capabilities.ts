import type { PermissionCode } from "@/lib/constants";
import type { IconName } from "@/components/icons";
import { can, type Principal } from "@/lib/authz";

/**
 * Canonical BEYU OS frontend information architecture — ONE catalogue.
 *
 * WHY THIS MODULE EXISTS
 *   The sidebar navigation (app/os/layout.tsx), the mobile module bar and the
 *   Executive Control Centre capability map must present the SAME architecture.
 *   Before this module existed, the nav catalogue was private to the layout,
 *   which meant any second discovery surface would have had to duplicate it —
 *   and two copies of an authority-adjacent catalogue inevitably drift. This
 *   module is the single definition both surfaces derive from.
 *
 * WHAT IT IS NOT
 *   It is NOT an authorization layer. `visible(principal, item)` is the same
 *   presentation-only computation the layout always performed: it runs the
 *   kernel's `can()` primitive against the SAME permission the destination
 *   page passes to `requireAccess()`, so the UI can never advertise what the
 *   backend would deny — and it grants nothing. Every destination re-verifies
 *   the principal, tenant, entity scope, clearance and permission server-side
 *   (requireAccess / requirePrincipal + RLS); a hidden URL typed by hand still
 *   receives the real governed decision.
 *
 * STRUCTURE (canonical IA)
 *   EXECUTIVE            — control-centre surfaces of the one control plane
 *   SHARED CAPABILITIES  — capabilities implemented ONCE inside BEYU OS and
 *                          consumed by every Sector OS through governed
 *                          APIs/events. They are NOT "OSs" (Constitution
 *                          Art. 2 — no Identity OS, no Risk OS…).
 *   SECTOR OS            — the specialized operating systems BEYU OS governs:
 *                          Health (federated), Finance, Agriculture, and the
 *                          Foundation OS (nonprofit sister architecture —
 *                          never a Sector LLC).
 *   FAMILY OFFICE        — the registered SHARED_FAMILY_OFFICE capability set
 *                          (HIGHLY_RESTRICTED) kept as its own group because
 *                          of its classification tier.
 */

/** How a destination's VISIBILITY (not authority) is decided. */
export type CapabilityVisibility =
  /** Any authenticated principal (e.g. the control centre, own notifications). */
  | { kind: "open" }
  /** Exact permission the destination page passes to requireAccess(). */
  | { kind: "permission"; permission: PermissionCode }
  /** Any of the listed permissions (the page applies the same union). */
  | { kind: "any"; permissions: PermissionCode[] }
  /** Health OS federation: resolved via the canonical identity link check. */
  | { kind: "health-federation" };

export type CapabilityItem = {
  href: string;
  label: string;
  description: string;
  icon: IconName;
  visibility: CapabilityVisibility;
};

export type CapabilityGroup = {
  id: string;
  title: string;
  items: CapabilityItem[];
};

export const CAPABILITY_IA: CapabilityGroup[] = [
  {
    id: "executive",
    title: "Executive",
    items: [
      {
        href: "/os",
        label: "Executive Control Centre",
        description: "The main command surface: governed enterprise status, filtered to the principal's granted capabilities.",
        icon: "command",
        visibility: { kind: "open" },
      },
      {
        href: "/os/registry",
        label: "OS & Source-of-Truth Registry",
        description: "Which system owns which domain of truth: registered OSs, source-of-truth matrix, ADRs, integrations and data assets.",
        icon: "registry",
        visibility: { kind: "permission", permission: "platform:registry.read" },
      },
      {
        href: "/os/organization",
        label: "Organisation & Ownership",
        description: "Trust → holding → country holdings → sector companies: legal entities, ownership records and jurisdictions.",
        icon: "hierarchy",
        visibility: { kind: "permission", permission: "organization:entity.read" },
      },
    ],
  },
  {
    id: "shared",
    title: "Shared capabilities",
    items: [
      {
        href: "/os/identity",
        label: "Identity",
        description: "One canonical GlobalUserID per party: users, roles, role assignments, sessions and break-glass grants.",
        icon: "identity",
        visibility: { kind: "permission", permission: "identity:user.read" },
      },
      {
        href: "/os/organization",
        label: "Organisation",
        description: "The shared organisation capability: entities, org units, countries and ownership truth consumed by every OS.",
        icon: "org",
        visibility: { kind: "permission", permission: "organization:entity.read" },
      },
      {
        href: "/os/governance",
        label: "Governance",
        description: "Governance bodies, resolutions and voting — every material decision records its authority.",
        icon: "governance",
        visibility: { kind: "permission", permission: "governance:resolution.read" },
      },
      {
        href: "/os/constitution",
        label: "Constitution & Policy",
        description: "The constitutional articles, policies and amendments that bound every capability and OS.",
        icon: "constitution",
        visibility: { kind: "permission", permission: "governance:policy.read" },
      },
      {
        href: "/os/compliance",
        label: "Compliance",
        description: "Compliance obligations and assessments — explicit states, never inferred, never claimed as certification.",
        icon: "compliance",
        visibility: { kind: "permission", permission: "compliance:obligation.read" },
      },
      {
        href: "/os/risk",
        label: "Risk",
        description: "The enterprise risk register and control library: identification → assessment → treatment → monitoring.",
        icon: "risk",
        visibility: { kind: "permission", permission: "risk:register.read" },
      },
      {
        href: "/os/audit",
        label: "Audit",
        description: "The append-only, hash-chained audit ledger with integrity self-test and the AI decision register.",
        icon: "audit",
        visibility: { kind: "permission", permission: "audit:log.read" },
      },
      {
        href: "/os/documents",
        label: "Documents",
        description: "Document & knowledge registry: provenance, checksums, effective dating, retention and legal hold.",
        icon: "documents",
        visibility: { kind: "permission", permission: "documents:registry.read" },
      },
      {
        href: "/os/workflow",
        label: "Workflow",
        description: "Governed workflow definitions, live instances, approvals & tasks, and HIVE agentic workflows with human approval.",
        icon: "workflow",
        visibility: { kind: "any", permissions: ["platform:dashboard.read", "ai:workflow.run", "ai:workflow.approve"] },
      },
      {
        href: "/os/notifications",
        label: "Notifications",
        description: "IN_APP/system alert stream for the tenant: subjects, urgency, channels and delivery state.",
        icon: "bell",
        visibility: { kind: "open" },
      },
      {
        href: "/os/events",
        label: "Events",
        description: "The immutable enterprise event stream: CloudEvents-aligned, versioned, hash-chained domain events.",
        icon: "events",
        visibility: { kind: "permission", permission: "audit:event.read" },
      },
      {
        href: "/os/security",
        label: "Security",
        description: "Security posture: session risk, MFA coverage, lockouts, service principals and the high-risk permission catalogue.",
        icon: "security",
        visibility: { kind: "permission", permission: "identity:user.read" },
      },
      {
        href: "/os/legal",
        label: "Legal & Liability",
        description: "Legal matters, obligations and exposure — no AI-generated legal conclusion is binding without human legal governance.",
        icon: "legal",
        visibility: { kind: "permission", permission: "legal:matter.read" },
      },
      {
        href: "/os/assurance",
        label: "Assurance Overview",
        description: "Risk, compliance and legal in one assurance view, plus anomaly intelligence and continuity/DR evidence.",
        icon: "assurance",
        visibility: { kind: "permission", permission: "risk:register.read" },
      },
      {
        href: "/os/tax",
        label: "Tax Governance",
        description: "Tax strategy intelligence inside Finance OS: positions from lawful planning to prohibited evasion, jurisdiction-gated.",
        icon: "tax",
        visibility: { kind: "permission", permission: "finance:tax.read" },
      },
      {
        href: "/os/hcm",
        label: "HCM",
        description: "One employee master, one workforce lifecycle — the single source of truth sector OSs consume; never duplicated.",
        icon: "hcm",
        visibility: { kind: "permission", permission: "hcm:employee.read" },
      },
      {
        href: "/os/noelia",
        label: "Noelia / HIVE",
        description: "The single governed AI identity on the HIVE runtime: advisory, source-citing, human-reviewed, fully audited.",
        icon: "hive",
        visibility: { kind: "permission", permission: "ai:noelia.query" },
      },
    ],
  },
  {
    id: "sector",
    title: "Sector OS",
    items: [
      {
        href: "/health",
        label: "Health OS",
        description: "Federated healthcare operations (EHR, clinical workflows, pharmacy, laboratory, claims) under canonical BEYU identity.",
        icon: "health",
        visibility: { kind: "health-federation" },
      },
      {
        href: "/os/finance",
        label: "Finance OS",
        description: "The authoritative domain for financial consequences: general ledger, chart of accounts and period control.",
        icon: "finance",
        visibility: { kind: "permission", permission: "finance:ledger.read" },
      },
      {
        href: "/os/capital",
        label: "Capital & Treasury",
        description: "Finance OS capital pipeline and consolidated treasury positions across entities and currencies.",
        icon: "capital",
        visibility: { kind: "permission", permission: "finance:capital.read" },
      },
      {
        href: "/os/waterfall",
        label: "Waterfall Engine",
        description: "Governed distribution waterfall: tiered application of cash with checksums and board authority.",
        icon: "waterfall",
        visibility: { kind: "permission", permission: "finance:waterfall.read" },
      },
      {
        href: "/os/agriculture",
        label: "Agriculture OS",
        description: "Agricultural operations: farms, fields, crop cycles, harvests, livestock, traceability and export compliance.",
        icon: "agriculture",
        visibility: { kind: "permission", permission: "agriculture:data.read" },
      },
      {
        href: "/os/foundation",
        label: "Foundation OS",
        description: "The nonprofit sister architecture: registry, formation, grants, programs, safeguarding and impact under BEYU governance.",
        icon: "foundation",
        visibility: { kind: "permission", permission: "foundation:registry.read" },
      },
    ],
  },
  {
    id: "family-office",
    title: "Family office",
    items: [
      {
        href: "/os/family",
        label: "Family Office",
        description: "Family governance, lineage, beneficiaries and vault — HIGHLY_RESTRICTED, named grants and MFA.",
        icon: "family",
        visibility: { kind: "permission", permission: "family:member.read" },
      },
      {
        href: "/os/family/capital",
        label: "Family Capital & Wealth",
        description: "Family Office capital position, investment theses, obligations and generational planning.",
        icon: "capital",
        visibility: { kind: "permission", permission: "familyoffice:capital.read" },
      },
      {
        href: "/os/family/protection",
        label: "Family Protection & Insurance",
        description: "Governed life-insurance protection: policies, premium obligations, beneficiary designations and claims ledger.",
        icon: "protection",
        visibility: { kind: "permission", permission: "familyoffice:protection.read" },
      },
    ],
  },
];

/**
 * Presentation-only visibility for the synchronous permission kinds.
 * `health-federation` items return false here; callers that support them
 * resolve the canonical identity link asynchronously and re-include the item.
 */
export function visible(principal: Principal, item: CapabilityItem): boolean {
  const v = item.visibility;
  switch (v.kind) {
    case "open":
      return true;
    case "permission":
      return can(principal, v.permission).allowed;
    case "any":
      return v.permissions.some((p) => can(principal, p).allowed);
    case "health-federation":
      return false;
  }
}
