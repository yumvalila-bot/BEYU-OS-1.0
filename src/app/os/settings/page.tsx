import Link from "next/link";
import { Badge } from "@/components/brand";
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { DevicePreferences } from "@/components/device-preferences";
import { Icon, type IconName } from "@/components/icons";
import { can, type Principal } from "@/lib/authz";
import type { PermissionCode } from "@/lib/constants";
import { NOELIA_DISPLAY_IDENTITY } from "@/lib/noelia/appearance";
import { requirePrincipal } from "@/lib/guard";
import { SignOutButton } from "../sign-out-button";

export const dynamic = "force-dynamic";

type GovernedDestination = {
  href: string;
  label: string;
  description: string;
  icon: IconName;
  permission: PermissionCode;
};

const ADMINISTRATION_DESTINATIONS: GovernedDestination[] = [
  {
    href: "/os/registry",
    label: "OS & source-of-truth registry",
    description:
      "Inspect constitutional domain ownership and activation evidence.",
    icon: "registry",
    permission: "platform:registry.read",
  },
  {
    href: "/os/identity",
    label: "Identity & access plane",
    description:
      "Inspect canonical GlobalUserIDs, role grants, sessions and break-glass records.",
    icon: "identity",
    permission: "identity:user.read",
  },
  {
    href: "/os/administration",
    label: "Administration — users",
    description:
      "Governed registration and lifecycle of user identities: register, activate, suspend, deactivate, remove.",
    icon: "identity",
    permission: "identity:user.read",
  },
  {
    href: "/os/administration/tenants",
    label: "Administration — tenants",
    description:
      "Canonical tenant registry under governance: register, transition, archive, dependency-checked removal.",
    icon: "org",
    permission: "organization:entity.read",
  },
  {
    href: "/os/administration/delegations",
    label: "Administration — delegations",
    description:
      "Bounded, time-limited, revocable delegations of administrative authority.",
    icon: "command",
    permission: "identity:delegation.manage",
  },
  {
    href: "/os/constitution",
    label: "Constitution & policy",
    description: "Open the governed constitutional and policy register.",
    icon: "constitution",
    permission: "governance:policy.read",
  },
  {
    href: "/os/audit",
    label: "Audit ledger",
    description:
      "Inspect the append-only evidence surface within your authorized scope.",
    icon: "audit",
    permission: "audit:log.read",
  },
];

function ContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2.5">
      <div className="beyu-kicker beyu-muted">{label}</div>
      <div className="mt-1 break-words text-[12.5px] font-semibold">
        {value}
      </div>
    </div>
  );
}

function SettingsLink({
  href,
  icon,
  label,
  description,
}: {
  href: string;
  icon: IconName;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-20 items-start gap-3 rounded-xl border border-[color:var(--beyu-line)] p-3.5 transition hover:border-[#d4a017]/60 hover:bg-[#d4a017]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a017]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0b1f4d] text-[#f0d36f]">
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold group-hover:text-[#9a7813]">
          {label} →
        </span>
        <span className="mt-1 block text-[11px] leading-relaxed beyu-muted">
          {description}
        </span>
      </span>
    </Link>
  );
}

function administrationFor(principal: Principal) {
  return ADMINISTRATION_DESTINATIONS.filter(
    (destination) => can(principal, destination.permission).allowed,
  );
}

/**
 * One protected settings directory for BEYU OS.
 *
 * Account, security and administration destinations remain authoritative in
 * their existing domains and re-authorize on every deep link. Only harmless
 * presentation preferences are editable here, stored locally in the browser.
 */
export default async function SettingsPage() {
  const principal = await requirePrincipal();
  const administration = administrationFor(principal);
  const canReadIdentity = can(principal, "identity:user.read").allowed;
  const canQueryNoelia = can(principal, "ai:noelia.query").allowed;

  const sections = [
    { href: "#general", label: "General" },
    { href: "#appearance", label: "Appearance" },
    { href: "#noelia", label: "Noelia" },
    { href: "#account", label: "Account" },
    { href: "#security", label: "Security" },
    { href: "#notifications", label: "Notifications" },
    { href: "#accessibility", label: "Accessibility" },
    ...(administration.length > 0
      ? [{ href: "#administration", label: "System / Administration" }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-2xl border border-[#d4a017]/35 bg-white p-2 shadow-sm">
          <BeyuOsLogo size={58} decorative />
        </div>
        <div>
          <div className="beyu-kicker text-[#b08d1c]">
            System · protected settings
          </div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">
            Settings
          </h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Your current BEYU OS context, real account and security
            destinations, and browser-local presentation preferences.
            Administrative surfaces appear only when your active grants allow
            them.
          </p>
          <p className="mt-2 text-[11px] font-semibold tracking-wide text-[#9a7813]">
            Bridging Care. Building Trust.
          </p>
        </div>
      </header>

      <nav
        aria-label="Settings sections"
        className="beyu-panel flex gap-1 overflow-x-auto p-2 beyu-scroll"
      >
        {sections.map((section) => (
          <a
            key={section.href}
            href={section.href}
            className="shrink-0 rounded-lg px-3 py-2 text-[11.5px] font-semibold hover:bg-[#d4a017]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a017]"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <section
        id="general"
        aria-labelledby="general-heading"
        className="beyu-panel scroll-mt-24 p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="beyu-kicker text-[#b08d1c]">General</div>
            <h2 id="general-heading" className="mt-1 text-[15px] font-semibold">
              Active governed context
            </h2>
            <p className="mt-1 max-w-3xl text-[11.5px] beyu-muted">
              Context is resolved from the authenticated server session. It
              cannot be changed by a browser-only control.
            </p>
          </div>
          <Badge tone="navy">BEYU OS</Badge>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <ContextItem label="Tenant" value={principal.tenantCode} />
          <ContextItem label="Tenant type" value={principal.tenantType} />
          <ContextItem label="Clearance ceiling" value={principal.clearance} />
          <ContextItem
            label="Legal-entity scope"
            value={
              principal.entityScope.length === 0
                ? "Tenant scope"
                : `${principal.entityScope.length} named entity grant${principal.entityScope.length === 1 ? "" : "s"}`
            }
          />
        </div>
        <p className="mt-3 text-[10.5px] beyu-muted">
          To work in another authorized operating-system context, use the OS
          launcher. Every destination rechecks identity, tenant, entity, role,
          permission and classification on the server.
        </p>
      </section>

      <DevicePreferences />

      <section
        id="noelia"
        aria-labelledby="noelia-heading"
        className="beyu-panel scroll-mt-24 p-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0b1f4d] text-[#f0d36f]">
              <Icon name="hive" className="h-5 w-5" />
            </span>
            <div>
              <div className="beyu-kicker text-[#b08d1c]">Noelia</div>
              <h2
                id="noelia-heading"
                className="mt-1 text-[15px] font-semibold"
              >
                {NOELIA_DISPLAY_IDENTITY.name} — {NOELIA_DISPLAY_IDENTITY.subtitle}
              </h2>
              <p className="mt-0.5 text-[11px] font-medium tracking-wide text-[#9a7813]">
                {NOELIA_DISPLAY_IDENTITY.motto}
              </p>
              <p className="mt-1 max-w-2xl text-[11.5px] beyu-muted">
                The single governed BEYU AI identity. Appearance and
                personalization (avatar, presence, motion, greeting, position,
                notifications) are configured in the Noelia assistant panel in
                the OS header — browser-local, presentation only, never an
                authorization input.{" "}
                {canQueryNoelia
                  ? "Her assistant and audit trail are one page away."
                  : "Her assistant appears once your grants include ai:noelia.query; the server remains authoritative."}
              </p>
            </div>
          </div>
          <Link
            href="/os/noelia"
            className="shrink-0 rounded-lg bg-[#0b1f4d] px-3.5 py-2.5 text-[11.5px] font-semibold text-white hover:bg-[#102b61] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017]"
          >
            Open Noelia →
          </Link>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section
          id="account"
          aria-labelledby="account-heading"
          className="beyu-panel scroll-mt-24 p-5"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0b1f4d] text-[#f0d36f]">
              <Icon name="identity" className="h-5 w-5" />
            </span>
            <div>
              <div className="beyu-kicker text-[#b08d1c]">Account</div>
              <h2
                id="account-heading"
                className="mt-1 text-[15px] font-semibold"
              >
                Canonical identity
              </h2>
            </div>
          </div>
          <dl className="mt-4 space-y-2.5 text-[12px]">
            <div>
              <dt className="beyu-kicker beyu-muted">Display name</dt>
              <dd className="mt-0.5 font-semibold">{principal.displayName}</dd>
            </div>
            <div>
              <dt className="beyu-kicker beyu-muted">Email</dt>
              <dd className="mt-0.5 break-all font-semibold">
                {principal.email}
              </dd>
            </div>
            <div>
              <dt className="beyu-kicker beyu-muted">GlobalUserID</dt>
              <dd className="mt-0.5 break-all font-mono text-[11px]">
                {principal.userId}
              </dd>
            </div>
            <div>
              <dt className="beyu-kicker beyu-muted">Active roles</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {principal.roles.length > 0 ? (
                  principal.roles.map((role) => (
                    <Badge key={role} tone="slate">
                      {role}
                    </Badge>
                  ))
                ) : (
                  <span className="beyu-muted">No effective roles</span>
                )}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {canReadIdentity && (
              <Link
                href="/os/identity"
                className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 text-[11.5px] font-semibold hover:border-[#d4a017]/60"
              >
                Open identity &amp; access →
              </Link>
            )}
            <SignOutButton className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 text-[11.5px] font-semibold transition hover:border-[#d4a017]/60 disabled:cursor-not-allowed disabled:opacity-60" />
          </div>
        </section>

        <section
          id="security"
          aria-labelledby="security-heading"
          className="beyu-panel scroll-mt-24 p-5"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0b1f4d] text-[#f0d36f]">
              <Icon name="security" className="h-5 w-5" />
            </span>
            <div>
              <div className="beyu-kicker text-[#b08d1c]">Security</div>
              <h2
                id="security-heading"
                className="mt-1 text-[15px] font-semibold"
              >
                Current session posture
              </h2>
              <p className="mt-1 text-[11.5px] beyu-muted">
                Observed from the server session; no credential or secret
                material is shown.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ContextItem
              label="MFA"
              value={principal.mfaSatisfied ? "Satisfied" : "Not satisfied"}
            />
            <ContextItem
              label="Session risk score"
              value={String(principal.riskScore)}
            />
          </div>
          <p className="mt-3 text-[11px] beyu-muted">
            High-risk actions always require the authorization engine&rsquo;s
            MFA step-up, regardless of navigation visibility.
          </p>
          {canReadIdentity && (
            <Link
              href="/os/security"
              className="mt-4 inline-flex rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 text-[11.5px] font-semibold hover:border-[#d4a017]/60"
            >
              Open authorized security posture →
            </Link>
          )}
        </section>
      </div>

      <section
        id="notifications"
        aria-labelledby="notifications-heading"
        className="beyu-panel scroll-mt-24 p-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0b1f4d] text-[#f0d36f]">
              <Icon name="bell" className="h-5 w-5" />
            </span>
            <div>
              <div className="beyu-kicker text-[#b08d1c]">Notifications</div>
              <h2
                id="notifications-heading"
                className="mt-1 text-[15px] font-semibold"
              >
                Governed alert stream
              </h2>
              <p className="mt-1 max-w-2xl text-[11.5px] beyu-muted">
                Open the existing recipient-, tenant- and classification-scoped
                stream. No unsupported delivery controls are advertised here.
              </p>
            </div>
          </div>
          <Link
            href="/os/notifications"
            className="shrink-0 rounded-lg bg-[#0b1f4d] px-3.5 py-2.5 text-[11.5px] font-semibold text-white hover:bg-[#102b61]"
          >
            Open notifications →
          </Link>
        </div>
      </section>

      {administration.length > 0 && (
        <section
          id="administration"
          aria-labelledby="administration-heading"
          className="beyu-panel scroll-mt-24 p-5"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0b1f4d] text-[#f0d36f]">
              <Icon name="settings" className="h-5 w-5" />
            </span>
            <div>
              <div className="beyu-kicker text-[#b08d1c]">
                System / Administration
              </div>
              <h2
                id="administration-heading"
                className="mt-1 text-[15px] font-semibold"
              >
                Authorized governed destinations
              </h2>
              <p className="mt-1 max-w-3xl text-[11.5px] beyu-muted">
                Only destinations covered by your active grants are listed.
                Settings does not duplicate their controls, and each deep link
                makes a fresh server-side authorization decision.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {administration.map((destination) => (
              <SettingsLink key={destination.href} {...destination} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
