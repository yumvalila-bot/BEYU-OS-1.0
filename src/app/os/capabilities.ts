import type { PermissionCode } from "@/lib/constants";
import type { IconName } from "@/components/icons";
import { can, type Principal } from "@/lib/authz";
import {
  FINANCE_OS_READ_PERMISSIONS,
  FOUNDATION_OS_READ_PERMISSIONS,
} from "@/lib/operating-systems";

/**
 * Canonical BEYU OS frontend information architecture — ONE catalogue.
 *
 * The responsive navigation and the Executive Control Centre capability map
 * both derive from this module. It is intentionally a discovery catalogue, not
 * an authorization layer: each destination still resolves the principal and
 * re-runs RBAC, ABAC, tenant/entity scope and RLS on the server.
 *
 * The first three groups express the constitutional hierarchy directly:
 *   EXECUTIVE            — control surfaces of the one BEYU control plane;
 *   SHARED CAPABILITIES  — implemented once in BEYU OS, never separate OSs;
 *   SECTOR OS            — Finance, Health, Agriculture, Foundation and Ujenzi below it.
 *
 * The remaining workspace groups preserve useful, already-implemented focused
 * views without promoting those views into duplicate operating systems.
 */

/** How a destination's VISIBILITY (never its authority) is decided. */
export type CapabilityVisibility =
  /** Any authenticated BEYU principal (for example the control centre). */
  | { kind: "open" }
  /** Exact permission the destination page passes to requireAccess(). */
  | { kind: "permission"; permission: PermissionCode }
  /** Any listed permission; the destination applies the identical union. */
  | { kind: "any"; permissions: PermissionCode[] }
  /** Health OS federation, resolved from its canonical identity link. */
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

const OWNERSHIP_READ: PermissionCode[] = [
  "organization:ownership.read",
  "equity:cap-table.read",
];

const ORGANISATION_OWNERSHIP_READ: PermissionCode[] = [
  "organization:entity.read",
  ...OWNERSHIP_READ,
];

const RISK_COMPLIANCE_READ: PermissionCode[] = [
  "risk:register.read",
  "compliance:obligation.read",
];

const AUDIT_EVENTS_READ: PermissionCode[] = ["audit:log.read", "audit:event.read"];

const REGISTRY_READ: PermissionCode[] = [
  "platform:registry.read",
  "identity:user.read",
  "organization:entity.read",
  "organization:ownership.read",
  "equity:cap-table.read",
  "governance:resolution.read",
  "governance:policy.read",
  "documents:registry.read",
  "audit:log.read",
  "audit:event.read",
  "foundation:registry.read",
  "contracts:read",
  "government:integration.read",
  "blockchain:read",
  "finance:payments.read",
];

export const CAPABILITY_IA: CapabilityGroup[] = [
  {
    id: "executive",
    title: "Executive",
    items: [
      {
        href: "/os",
        label: "Executive Control Centre",
        description: "The main command surface: governed enterprise status filtered to the principal's granted capabilities.",
        icon: "command",
        visibility: { kind: "open" },
      },
      {
        href: "/os/registry",
        label: "OS & Source-of-Truth Registry",
        description: "Registered operating systems, authoritative data owners, architecture decisions, integrations, data assets and feature flags.",
        icon: "registry",
        visibility: {
          kind: "permission",
          permission: "platform:registry.read",
        },
      },
      {
        href: "/os/organization-ownership",
        label: "Organisation & Ownership",
        description: "The governed route into the trust, holding, country, operating-company and ownership structure.",
        icon: "hierarchy",
        visibility: { kind: "any", permissions: ORGANISATION_OWNERSHIP_READ },
      },
    ],
  },
  {
    id: "shared",
    title: "Shared capabilities",
    items: [
      {
        href: "/os/identity",
        label: "Identity & Access",
        description: "Canonical GlobalUserID, users, roles, assignments, sessions, MFA posture and governed break-glass access.",
        icon: "identity",
        visibility: { kind: "permission", permission: "identity:user.read" },
      },
      {
        href: "/os/organization",
        label: "Organisation",
        description: "Legal entities, organisation topology, countries and jurisdictions consumed by every operating system.",
        icon: "org",
        visibility: {
          kind: "permission",
          permission: "organization:entity.read",
        },
      },
      {
        href: "/os/ownership",
        label: "Ownership",
        description: "Authoritative ownership records and the governed, instrument-level capitalization view — never a second cap table.",
        icon: "ownership",
        visibility: { kind: "any", permissions: OWNERSHIP_READ },
      },
      {
        href: "/os/governance",
        label: "Governance",
        description: "Governance bodies, authority, resolutions, votes and decision records with human accountability.",
        icon: "governance",
        visibility: {
          kind: "permission",
          permission: "governance:resolution.read",
        },
      },
      {
        href: "/os/assurance",
        label: "Risk & Compliance",
        description: "Permission-partitioned risk, controls, obligations, evidence, exceptions and remediation assurance.",
        icon: "assurance",
        visibility: { kind: "any", permissions: RISK_COMPLIANCE_READ },
      },
      {
        href: "/os/hcm",
        label: "HCM",
        description: "One employee master and one workforce lifecycle, consumed by Sector OSs through governed contracts.",
        icon: "hcm",
        visibility: { kind: "permission", permission: "hcm:employee.read" },
      },
      {
        href: "/os/documents",
        label: "Documents & Knowledge",
        description: "Controlled documents, metadata, evidence, authoritative knowledge, retention and legal holds.",
        icon: "documents",
        visibility: {
          kind: "permission",
          permission: "documents:registry.read",
        },
      },
      {
        href: "/os/audit-events",
        label: "Audit & Events",
        description: "Governed access to the append-only audit ledger and immutable enterprise event stream.",
        icon: "audit",
        visibility: { kind: "any", permissions: AUDIT_EVENTS_READ },
      },
      {
        href: "/os/registries",
        label: "Registries",
        description: "A permission-aware directory of the existing OS, identity, organisation, ownership, governance and document registries.",
        icon: "registry",
        visibility: { kind: "any", permissions: REGISTRY_READ },
      },
      {
        href: "/os/viz",
        label: "Holograph — Spatial Visualization & Twins",
        description:
          "Holograph — the shared spatial visualization and digital-twin capability: governed 1D–8D+ scenes, a 3D/asset registry with provenance and integrity, hardware-independent device and renderer abstractions with a 2D fallback, governed interactions (denials included) and the governed Family Office spatial view — over each Sector OS's own authorized data. Never an OS; never a second copy of sector truth; CAP_POSTING remains LOCKED.",
        icon: "dimensional",
        visibility: { kind: "any", permissions: ["viz:scene.read", "viz:registry.read"] },
      },
      {
        href: "/os/family",
        label: "Family Office",
        description: "Family governance, lineage, beneficiaries, wealth and protection inside BEYU OS under highly restricted grants.",
        icon: "family",
        visibility: { kind: "permission", permission: "family:member.read" },
      },
      {
        href: "/os/noelia",
        label: "Noelia / HIVE",
        description: "The single governed BEYU AI identity and its policy-bound tool and workflow runtime; advisory, never self-authorizing.",
        icon: "hive",
        visibility: { kind: "permission", permission: "ai:noelia.query" },
      },
    ],
  },
  {
    id: "sector",
    title: "Sector operating systems",
    items: [
      {
        href: "/os/finance",
        label: "Finance OS",
        description: "The authoritative domain for financial consequences: ledger, periods, treasury, tax and reconciliation.",
        icon: "finance",
        visibility: { kind: "any", permissions: FINANCE_OS_READ_PERMISSIONS },
      },
      {
        // Canonical route: `/os/health`. The link is presentational only — it
        // carries no OS authorization, and the route re-runs the canonical
        // session + Health federation gate server-side on every request.
        href: "/os/health",
        label: "Health OS",
        description: "Federated healthcare operations under canonical BEYU identity and a separately re-verified Health authorization boundary.",
        icon: "health",
        visibility: { kind: "health-federation" },
      },
      {
        href: "/os/agriculture",
        label: "Agriculture OS",
        description: "Farms, crops, livestock, traceability and export operations under BEYU governance and Finance boundaries.",
        icon: "agriculture",
        visibility: { kind: "permission", permission: "agriculture:data.read" },
      },
      {
        href: "/os/foundation",
        label: "Foundation OS",
        description: "Foundation formation, grants, programs, safeguarding and impact under shared BEYU controls.",
        icon: "foundation",
        visibility: {
          kind: "any",
          permissions: FOUNDATION_OS_READ_PERMISSIONS,
        },
      },
      {
        href: "/os/ujenzi",
        label: "Ujenzi OS",
        description: "Construction operations: projects, sites, BOQ and cost control, procurement, materials, equipment, quality, HSE, variations, claims, payment certificates and handover under BEYU governance and Finance boundaries.",
        icon: "ujenzi",
        visibility: { kind: "permission", permission: "ujenzi:data.read" },
      },
    ],
  },
  {
    id: "administration",
    title: "Administration",
    items: [
      {
        href: "/os/administration",
        label: "Users & Identities",
        description:
          "Governed registration and lifecycle of user identities: register, activate, suspend, deactivate and remove, with audit attribution.",
        icon: "identity",
        visibility: { kind: "permission", permission: "identity:user.read" },
      },
      {
        href: "/os/administration/tenants",
        label: "Tenants",
        description:
          "The canonical tenant registry under governance: register tenants, transition lifecycle status, archive; removal is dependency-checked.",
        icon: "org",
        visibility: { kind: "permission", permission: "organization:entity.read" },
      },
      {
        href: "/os/administration/memberships",
        label: "Memberships",
        description:
          "User ↔ tenant membership through the canonical assignment model: assign presence, revoke it, and see every scoped grant.",
        icon: "hierarchy",
        visibility: { kind: "permission", permission: "identity:user.read" },
      },
      {
        href: "/os/administration/roles",
        label: "Roles & Capabilities",
        description:
          "The constitutional role catalogue and governed grant/revoke of scoped role assignments (MFA step-up, audited).",
        icon: "governance",
        visibility: { kind: "permission", permission: "identity:user.read" },
      },
      {
        href: "/os/administration/delegations",
        label: "Authority Delegations",
        description:
          "Bounded, time-limited, revocable delegations of administrative capability — never more authority than the delegator holds.",
        icon: "command",
        visibility: { kind: "permission", permission: "identity:delegation.manage" },
      },
      {
        href: "/os/administration/audit",
        label: "Administrative Audit",
        description:
          "The immutable, hash-chained audit trail of every administrative action — grants, transitions, delegations and refusals.",
        icon: "audit",
        visibility: { kind: "permission", permission: "audit:log.read" },
      },
    ],
  },
  {
    id: "system",
    title: "System",
    items: [
      {
        href: "/os/settings",
        label: "Settings",
        description: "Account context, security and notification destinations, device appearance, accessibility and permission-gated administration.",
        icon: "settings",
        visibility: { kind: "open" },
      },
    ],
  },
  {
    id: "shared-workspaces",
    title: "Shared capability workspaces",
    items: [
      {
        href: "/os/constitution",
        label: "Constitution & Policy",
        description: "Constitutional articles, policies and amendments that bind every capability and OS.",
        icon: "constitution",
        visibility: {
          kind: "permission",
          permission: "governance:policy.read",
        },
      },
      {
        href: "/os/risk",
        label: "Risk Register",
        description: "Focused enterprise risk and control-library workspace.",
        icon: "risk",
        visibility: { kind: "permission", permission: "risk:register.read" },
      },
      {
        href: "/os/compliance",
        label: "Compliance Obligations",
        description: "Focused obligations, assessment evidence and remediation workspace.",
        icon: "compliance",
        visibility: {
          kind: "permission",
          permission: "compliance:obligation.read",
        },
      },
      {
        href: "/os/audit",
        label: "Audit Ledger",
        description: "Hash-chained audit records, integrity verification and accountable AI decisions.",
        icon: "audit",
        visibility: { kind: "permission", permission: "audit:log.read" },
      },
      {
        href: "/os/events",
        label: "Event Stream",
        description: "CloudEvents-aligned, versioned and hash-chained operational and governance events.",
        icon: "events",
        visibility: { kind: "permission", permission: "audit:event.read" },
      },
      {
        href: "/os/workflow",
        label: "Workflows & Approvals",
        description: "Governed definitions, instances, approvals, tasks and human-gated HIVE workflows.",
        icon: "workflow",
        visibility: {
          kind: "any",
          permissions: ["platform:dashboard.read", "ai:workflow.run", "ai:workflow.approve"],
        },
      },
      {
        href: "/os/notifications",
        label: "Notifications",
        description: "The current tenant's governed in-application alert and delivery stream.",
        icon: "bell",
        visibility: { kind: "open" },
      },
      {
        href: "/os/security",
        label: "Security Posture",
        description: "Session risk, MFA coverage, lockouts, service principals and high-risk permissions.",
        icon: "security",
        visibility: { kind: "permission", permission: "identity:user.read" },
      },
      {
        href: "/os/noelia/governance",
        label: "AI Governance & Assurance",
        description: "Noelia identity, model, provider, evaluation, risk, incident, kill-switch and compliance evidence.",
        icon: "hive",
        visibility: {
          kind: "any",
          permissions: [
            "ai:model.registry.read",
            "ai:provider.registry.read",
            "ai:identity.read",
            "ai:evaluation.read",
            "ai:risk.register.read",
            "ai:compliance.read",
            "ai:compliance.metrics",
            "ai:incident.manage",
            "ai:killswitch.manage",
          ],
        },
      },
      {
        href: "/os/legal",
        label: "Legal & Liability",
        description: "Legal matters, obligations and exposure with human legal authority preserved.",
        icon: "legal",
        visibility: { kind: "permission", permission: "legal:matter.read" },
      },
      {
        href: "/os/contracts",
        label: "Contract Lifecycle",
        description: "Governed contract register, review gates, obligations, disputes, execution evidence and amendments.",
        icon: "contracts",
        visibility: { kind: "permission", permission: "contracts:read" },
      },
      {
        href: "/os/government-integrations",
        label: "Government Integrations",
        description: "Canonical government-agency registry and governed submission gateway shared by Sector OSs.",
        icon: "government",
        visibility: { kind: "permission", permission: "government:integration.read" },
      },
      {
        href: "/os/blockchain",
        label: "Blockchain Registry & Evidence",
        description: "Governed smart-contract provenance, evidence anchors and non-authoritative reconciliation.",
        icon: "blockchain",
        visibility: { kind: "permission", permission: "blockchain:read" },
      },
    ],
  },
  {
    id: "agriculture-domains",
    title: "Agriculture OS domains",
    items: [
      {
        href: "/os/agriculture/capabilities",
        label: "Agriculture Capability Surface",
        description: "Implemented land, crop, livestock, aquaculture, environment, work, inventory, quality, project, commercial, traceability and export domains.",
        icon: "agriculture",
        visibility: { kind: "permission", permission: "agriculture:data.read" },
      },
    ],
  },
  {
    id: "finance-domains",
    title: "Finance OS domains",
    items: [
      {
        href: "/os/capital",
        label: "Capital & Treasury",
        description: "Finance OS capital pipeline and consolidated treasury positions.",
        icon: "capital",
        visibility: { kind: "permission", permission: "finance:capital.read" },
      },
      {
        href: "/os/waterfall",
        label: "Waterfall Engine",
        description: "Governed, deterministic distribution waterfall with board authority checks.",
        icon: "waterfall",
        visibility: {
          kind: "permission",
          permission: "finance:waterfall.read",
        },
      },
      {
        href: "/os/tax",
        label: "Tax Governance",
        description: "Jurisdiction-gated tax strategy intelligence inside Finance OS.",
        icon: "tax",
        visibility: { kind: "permission", permission: "finance:tax.read" },
      },
      {
        href: "/os/finance/payments",
        label: "Payments & Settlements",
        description: "Payment-provider evidence, transaction verification, matching, exceptions, settlement and accounting handoff.",
        icon: "payments",
        visibility: { kind: "permission", permission: "finance:payments.read" },
      },
    ],
  },
  {
    id: "family-office-domains",
    title: "Family Office domains",
    items: [
      {
        href: "/os/family/capital",
        label: "Family Capital & Wealth",
        description: "Family capital position, investment theses, obligations and generational planning.",
        icon: "capital",
        visibility: {
          kind: "permission",
          permission: "familyoffice:capital.read",
        },
      },
      {
        href: "/os/family/protection",
        label: "Family Protection & Insurance",
        description: "Policies, premium obligations, beneficiary designations and the claims ledger.",
        icon: "protection",
        visibility: {
          kind: "permission",
          permission: "familyoffice:protection.read",
        },
      },
    ],
  },
];

/**
 * Presentation-only visibility for synchronous permission kinds.
 * Health federation is asynchronous and therefore resolved by each caller.
 */
export function visible(principal: Principal, item: CapabilityItem): boolean {
  switch (item.visibility.kind) {
    case "open":
      return true;
    case "permission":
      return can(principal, item.visibility.permission).allowed;
    case "any":
      return item.visibility.permissions.some((permission) => can(principal, permission).allowed);
    case "health-federation":
      return false;
  }
}
