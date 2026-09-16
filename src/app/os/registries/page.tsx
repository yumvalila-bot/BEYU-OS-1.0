import { CapabilityDirectory, type CapabilityDirectoryItem } from "@/components/capability-directory";
import { Denied } from "@/components/brand";
import { can, type Principal } from "@/lib/authz";
import { requirePrincipal } from "@/lib/guard";
import type { PermissionCode } from "@/lib/constants";

export const dynamic = "force-dynamic";

type RegistryDestination = CapabilityDirectoryItem & {
  permissions: PermissionCode[];
};

const REGISTRIES: RegistryDestination[] = [
  {
    href: "/os/registry",
    name: "OS, Source-of-Truth & Capability Registries",
    description:
      "Registered systems, data authority, capability activation posture, architecture decisions, integrations and governed data assets.",
    icon: "registry",
    permissions: ["platform:registry.read"],
  },
  {
    href: "/os/identity",
    name: "Identity & Access Registry",
    description: "Canonical users, parties, roles, assignments, sessions and time-bound emergency grants.",
    icon: "identity",
    permissions: ["identity:user.read"],
  },
  {
    href: "/os/organization",
    name: "Organisation Registry",
    description: "Effective-dated legal entities, organisation topology, tenant boundaries and jurisdictions.",
    icon: "org",
    permissions: ["organization:entity.read"],
  },
  {
    href: "/os/ownership",
    name: "Ownership & Capitalization Registry",
    description:
      "Canonical ownership records and separately governed instrument-level share, vesting and ESOP facts.",
    icon: "ownership",
    permissions: ["organization:ownership.read", "equity:cap-table.read"],
  },
  {
    href: "/os/governance",
    name: "Governance & Decision Registry",
    description: "Governance bodies, resolutions, votes, decision authority and approval provenance.",
    icon: "governance",
    permissions: ["governance:resolution.read"],
  },
  {
    href: "/os/constitution",
    name: "Policy Registry",
    description: "In-force constitutional articles and effective-dated policies with ratification authority.",
    icon: "constitution",
    permissions: ["governance:policy.read"],
  },
  {
    href: "/os/documents",
    name: "Documents & Knowledge Registry",
    description: "Controlled files, evidence metadata, authoritative knowledge, retention and legal holds.",
    icon: "documents",
    permissions: ["documents:registry.read"],
  },
  {
    href: "/os/audit-events",
    name: "Audit & Event Registries",
    description: "Append-only audit history and immutable enterprise events, partitioned by their distinct grants.",
    icon: "audit",
    permissions: ["audit:log.read", "audit:event.read"],
  },
  {
    href: "/os/foundation/registry",
    name: "Foundation Registry",
    description: "Foundation legal forms, jurisdictions, formation state and lifecycle records.",
    icon: "foundation",
    permissions: ["foundation:registry.read"],
  },
  {
    href: "/os/contracts",
    name: "Contract Register",
    description: "Governed contract lifecycle records, authority gates, obligations and execution evidence.",
    icon: "contracts",
    permissions: ["contracts:read"],
  },
  {
    href: "/os/government-integrations",
    name: "Government Integration Registry",
    description: "Verified agency interface posture and governed submission records without fabricated live claims.",
    icon: "government",
    permissions: ["government:integration.read"],
  },
  {
    href: "/os/blockchain",
    name: "Smart-contract & Evidence Registry",
    description: "Smart-contract provenance, evidence anchors and read-only reconciliation findings.",
    icon: "blockchain",
    permissions: ["blockchain:read"],
  },
  {
    href: "/os/finance/payments",
    name: "Payment Provider Registry",
    description: "Separate provider integration facts, transactions, settlements and reconciliation posture.",
    icon: "payments",
    permissions: ["finance:payments.read"],
  },
];

function isAvailable(principal: Principal, destination: RegistryDestination): boolean {
  return destination.permissions.some((permission) => can(principal, permission).allowed);
}

/** A directory over existing registries — no competing registry is created. */
export default async function RegistriesPage() {
  const principal = await requirePrincipal();
  const available = REGISTRIES.filter((registry) => isAvailable(principal, registry));

  if (available.length === 0) {
    return (
      <Denied
        reason="No registry read grant is active for this principal."
        capability="a governed registry read permission"
      />
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Shared capability · registries</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Governed registry directory</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          This directory connects the registries that already own BEYU truth. It creates no new store and
          reveals only destinations covered by the current principal&rsquo;s server-resolved grants. Every
          destination repeats authorization and scope enforcement before reading data.
        </p>
      </header>

      <CapabilityDirectory
        items={available.map(({ permissions: _permissions, ...item }) => item)}
        emptyMessage="No registry is within your current grants."
      />
    </div>
  );
}
