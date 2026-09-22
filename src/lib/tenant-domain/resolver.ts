/**
 * TENANT-DOMAIN RESOLUTION — the ONE canonical mechanism that turns a hostname
 * into (at most) a NARROWER tenant context.
 *
 * FLOW (Phase 2)
 *   1. normalise the raw host (`normalizeHostname`)              — pure
 *   2. look the EXACT hostname up in the governed registry        — RLS-filtered
 *   3. require: ACTIVE lifecycle · sufficient verification · known
 *      canonical OS (os_registry) · ACTIVE tenant · country/entity agreement
 *      · membership in the OS tenant namespace
 *   4. return the resolved tenant context — and nothing else. Session
 *      authentication, identity federation, RBAC/ABAC, the policy engine,
 *      step-up MFA, delegation and RLS all still run afterwards, unchanged.
 *
 * WHAT THIS MODULE CANNOT DO — BY CONSTRUCTION
 *   • It cannot grant access. There is no return value that means "allowed":
 *     either a context is returned that only ever RESTRICTS what the existing
 *     chain will then evaluate, or the request is refused.
 *   • It cannot invent a tenant. The tenant id always comes from a registry row
 *     that the database made visible under the caller's own RLS policy.
 *   • It cannot fall back to a default tenant. Inside a registered OS namespace
 *     that is a hard invariant: an unregistered `X.health.beyuos.co.tz` is a
 *     REFUSAL, never "the OS base tenant" and never another tenant.
 *   • It cannot infer roles, capabilities or permissions from a name. A hostname
 *     is not a credential, not a role and not a permission.
 *   • It cannot trust the Host header. The header is attacker-controlled input;
 *     here it may only ever cause ADDITIONAL refusal (see `hostnameRestriction`).
 *
 * OS BASE AND CAPABILITY BASE (Family Office and the other shared capabilities)
 *   BEYU OS has five SECTOR OSs and a set of SHARED CAPABILITIES implemented once
 *   inside it (Family Office, HCM, Governance, Risk/Compliance, Audit/Events,
 *   Workflow, Security, Noelia/HIVE). Both kinds of namespace have a governed base
 *   domain: `health.beyuos.co.tz` (OS_BASE → the canonical `HEALTH_OS`) and
 *   `familyoffice.beyuos.co.tz` (CAPABILITY_BASE → the canonical
 *   `SHARED_FAMILY_OFFICE`, whose `os_registry.kind` is `SHARED_CAPABILITY`).
 *
 *   The resolver treats the two base types uniformly — a PLATFORM NAMESPACE BASE
 *   is a namespace marker, never a tenant — and enforces the correspondence in
 *   BOTH directions: an OS_BASE row must resolve to a `SECTOR_OS` registry entry
 *   and a CAPABILITY_BASE row to a `SHARED_CAPABILITY` one. That single rule is
 *   what keeps Family Office a shared capability: it can never present itself as
 *   a Sector OS through the domain registry, and a Sector OS can never be
 *   demoted to a capability. `os_registry.kind` remains the ONE source of truth
 *   for OS identity; the domain type only says which kind of namespace a hostname
 *   belongs to.
 *
 * NOT-APPLICABLE IS NOT A DEFAULT TENANT
 *   A host that belongs to no registered namespace and matches no registered row
 *   (the deployment platform's own `*.vercel.app` domain, `localhost`, an IP
 *   literal, a preview URL) yields `NOT_APPLICABLE`: no tenant context is derived
 *   and the platform behaves exactly as it did before this module existed — the
 *   control plane, with every authorization check still in force. No request is
 *   ever routed to a tenant by falling back; a tenant context exists only when a
 *   governed row proves it.
 */
import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { legalEntities, osRegistry, tenants, tenantDomains } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { tenantScopeIds, withTenantDatabaseContext } from "@/lib/tenant-scope";
import { isWithinNamespace, normalizeHostname } from "./hostname";
import type { TenantDomainRecord } from "./registry";
import { selectDomainByHostname } from "./registry";

export type TenantDomainDenialReason =
  | "MALFORMED_HOST"
  | "IP_HOST"
  | "SINGLE_LABEL_HOST"
  | "UNKNOWN_TENANT_HOST"
  | "DOMAIN_NOT_ACTIVE"
  | "DOMAIN_NOT_VERIFIED"
  | "DOMAIN_NOT_IN_OS_NAMESPACE"
  | "TENANT_NOT_OPERATIONAL"
  | "TENANT_OUT_OF_SCOPE"
  | "OS_NOT_RECOGNISED"
  | "OS_NOT_IN_NAMESPACE"
  | "CAPABILITY_NOT_RECOGNISED"
  | "ENTITY_NOT_IN_TENANT"
  | "COUNTRY_MISMATCH";

/** Governed facts about the tenant a hostname resolved to. No authorities. */
export type ResolvedTenantDomainContext = {
  hostname: string;
  domainId: string;
  tenantId: string;
  tenantCode: string;
  /**
   * canonical `os_registry.code` the domain is bound to — either a SECTOR_OS
   * (e.g. HEALTH_OS) or a SHARED_CAPABILITY (e.g. SHARED_FAMILY_OFFICE). The
   * registry `kind` remains the authority on which it is.
   */
  os: string;
  domainType: TenantDomainRecord["domainType"];
  verificationState: TenantDomainRecord["verificationState"];
  entityId: string | null;
  countryCode: string | null;
  /** the platform base domain this name lives under, when it is a subdomain. */
  namespace: string | null;
};

export type TenantDomainResolution =
  /**
   * The host belongs to no registered tenant domain. No tenant context is
   * derived; the caller keeps its existing behaviour (the control plane).
   */
  | {
      kind: "NOT_APPLICABLE";
      hostname: string | null;
      reason: "NO_HOST" | "MALFORMED" | "IP_LITERAL" | "SINGLE_LABEL" | "LOCAL" | "UNREGISTERED";
    }
  /**
   * The host is a registered ACTIVE OS base domain (e.g. `health.beyuos.co.tz`):
   * it identifies the SECTOR OS namespace, never a tenant. No tenant context.
   */
  | { kind: "OS_BASE"; hostname: string; os: string }
  /**
   * The host is a registered ACTIVE shared-capability base domain (e.g.
   * `familyoffice.beyuos.co.tz`): it identifies the CAPABILITY namespace, never a
   * tenant and never an operating system. No tenant context, no authority.
   */
  | { kind: "CAPABILITY_BASE"; hostname: string; capability: string }
  /** A governed tenant domain. This is the ONLY result carrying tenant context. */
  | { kind: "TENANT"; context: ResolvedTenantDomainContext }
  /** Fail closed. The caller must refuse; it must not fall back to anything. */
  | { kind: "DENIED"; hostname: string | null; reason: TenantDomainDenialReason };

/**
 * Canonical codes whose namespaces this platform can serve domains for, and the
 * registry kind each base-domain type MUST resolve to.
 *
 * `os_registry` is the authoritative source of OS/capability identity. A governed
 * domain can only ever be bound to a code the registry declares ACTIVE and of the
 * kind that matches the domain type — so a DRAFT entry (MINING_OS), an AI runtime
 * (HIVE_RUNTIME), the control plane (BEYU_OS), an unknown code, or a
 * capability/OS kind mismatch all fail closed.
 */
export const PLATFORM_BASE_DOMAIN_TYPES = ["OS_BASE", "CAPABILITY_BASE"] as const;
export type PlatformBaseDomainType = (typeof PLATFORM_BASE_DOMAIN_TYPES)[number];

/** The registry kind a base-domain type must correspond to. */
export const REGISTRY_KIND_FOR_BASE_DOMAIN: Record<PlatformBaseDomainType, string> = {
  OS_BASE: "SECTOR_OS",
  CAPABILITY_BASE: "SHARED_CAPABILITY",
};

/**
 * The ACTIVE `os_registry` entry for a code, restricted to the kinds that may
 * own a governed namespace. The caller checks the returned `kind` against the
 * concrete base-domain type, so the OS/capability correspondence is enforced
 * rather than assumed.
 */
type RegistryAuthorityRow = { code: string; kind: string; lifecycle: string };

async function activeRegistryAuthority(code: string): Promise<RegistryAuthorityRow | null> {
  const [row] = await db
    .select({ code: osRegistry.code, kind: osRegistry.kind, lifecycle: osRegistry.lifecycle })
    .from(osRegistry)
    .where(
      and(
        eq(osRegistry.code, code),
        inArray(osRegistry.kind, ["SECTOR_OS", "SHARED_CAPABILITY"]),
        eq(osRegistry.lifecycle, "ACTIVE"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The base-domain type that corresponds to a registry kind (inverse mapping). */
export function baseTypeForRegistryKind(kind: string): PlatformBaseDomainType | null {
  const entry = Object.entries(REGISTRY_KIND_FOR_BASE_DOMAIN).find(([, expected]) => expected === kind);
  return (entry?.[0] as PlatformBaseDomainType | undefined) ?? null;
}

/** True when `code` is an ACTIVE registry entry of exactly the expected kind. */
async function isRegistryAuthorityOfKind(code: string, kind: string): Promise<boolean> {
  const authority = await activeRegistryAuthority(code);
  return authority !== null && authority.kind === kind;
}

type TenantRow = { id: string; code: string; status: string; countryCode: string | null };

async function operationalTenant(tenantId: string): Promise<TenantRow | null> {
  const [row] = await db
    .select({ id: tenants.id, code: tenants.code, status: tenants.status, countryCode: tenants.countryCode })
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.status, "ACTIVE")))
    .limit(1);
  return row ?? null;
}

/**
 * Resolve a hostname for a principal.
 *
 * Every read runs inside the principal's canonical tenant context, so RLS is the
 * final boundary: a hostname owned by a tenant outside the caller's scope is
 * simply not there, and the refusal is therefore identical to "unknown". The
 * caller learns nothing about tenants it may not see.
 */
export async function resolveHostname(
  principal: Principal,
  rawHost: string | null | undefined,
): Promise<TenantDomainResolution> {
  const normalized = normalizeHostname(rawHost);
  if (!normalized.ok) {
    // A name that is not a DNS hostname at all is not a tenant-domain claim and
    // derives no tenant context. `resolveRequestHostname` (below) turns these
    // into refusals for actual requests.
    return {
      kind: "NOT_APPLICABLE",
      hostname: null,
      reason: normalized.reason === "ABSENT" ? "NO_HOST" : normalized.reason,
    };
  }
  if (normalized.scope === "LOCAL") {
    return { kind: "NOT_APPLICABLE", hostname: normalized.hostname, reason: "LOCAL" };
  }

  const hostname = normalized.hostname;
  const scopeIds = await tenantScopeIds(principal);
  if (scopeIds.length === 0) return { kind: "DENIED", hostname, reason: "TENANT_OUT_OF_SCOPE" };

  return withTenantDatabaseContext(principal, async () => {
    return resolveWithinContext(hostname, scopeIds);
  });
}

async function resolveWithinContext(hostname: string, scopeIds: string[]): Promise<TenantDomainResolution> {
  // Every ACTIVE PLATFORM NAMESPACE BASE (Sector OS base and shared-capability
  // base) visible to this principal. Used to decide whether an unresolvable name
  // is *inside* a governed namespace — which is a refusal, never a fallback — and
  // to prove the namespace a tenant subdomain claims to live in.
  const bases = await db
    .select({
      hostname: tenantDomains.hostname,
      os: tenantDomains.os,
      tenantId: tenantDomains.tenantId,
      domainType: tenantDomains.domainType,
    })
    .from(tenantDomains)
    .where(
      and(
        inArray(tenantDomains.domainType, [...PLATFORM_BASE_DOMAIN_TYPES]),
        eq(tenantDomains.status, "ACTIVE"),
      ),
    );
  const namespace = bases.find((base) => isWithinNamespace(hostname, base.hostname)) ?? null;

  const row = await selectDomainByHostname(hostname);

  // Not registered at all.
  if (!row) {
    if (namespace) {
      // Inside a governed namespace but no governed row proves which tenant: fail
      // closed. Never the base tenant, never another tenant, never a "default"
      // tenant — and never the capability's or the OS's own surface.
      return { kind: "DENIED", hostname, reason: "UNKNOWN_TENANT_HOST" };
    }
    return { kind: "NOT_APPLICABLE", hostname, reason: "UNREGISTERED" };
  }

  // A PLATFORM NAMESPACE BASE identifies a namespace, not a tenant. The type
  // decides WHICH identity must back it: an OS base must correspond to an ACTIVE
  // SECTOR_OS, a capability base to an ACTIVE SHARED_CAPABILITY. A mismatch is a
  // hard refusal in both directions, so neither can impersonate the other.
  if (row.domainType === "OS_BASE" || row.domainType === "CAPABILITY_BASE") {
    if (row.status !== "ACTIVE") return { kind: "DENIED", hostname, reason: "DOMAIN_NOT_ACTIVE" };
    const expectedKind = REGISTRY_KIND_FOR_BASE_DOMAIN[row.domainType];
    if (!(await isRegistryAuthorityOfKind(row.os, expectedKind))) {
      return {
        kind: "DENIED",
        hostname,
        reason: row.domainType === "OS_BASE" ? "OS_NOT_RECOGNISED" : "CAPABILITY_NOT_RECOGNISED",
      };
    }
    // A namespace marker carries NO tenant context and NO authority: it says
    // which governed namespace this host belongs to and nothing else.
    return row.domainType === "OS_BASE"
      ? { kind: "OS_BASE", hostname, os: row.os }
      : { kind: "CAPABILITY_BASE", hostname, capability: row.os };
  }

  // Lifecycle gate: only an ACTIVE domain may resolve. CREATED / VERIFIED /
  // MODIFIED / SUSPENDED / REVOKED / DEACTIVATED / ARCHIVED all fail closed, so
  // a deactivated or retired tenant name stops working immediately.
  if (row.status !== "ACTIVE") return { kind: "DENIED", hostname, reason: "DOMAIN_NOT_ACTIVE" };

  // Verification gate: DNS control must have been PROVEN for every
  // runtime-registered name. UNVERIFIED (challenge outstanding), DOCUMENTED
  // (recorded configuration only) and DISPUTED all fail closed — a name is never
  // accepted merely because it looks plausible. The only rows carrying
  // DOCUMENTED are OS base namespaces, which are handled above and never yield a
  // tenant context.
  if (row.verificationState !== "VERIFIED") {
    return { kind: "DENIED", hostname, reason: "DOMAIN_NOT_VERIFIED" };
  }

  // Namespace gate: a tenant subdomain must be a strict subdomain of the ACTIVE
  // platform base for the code it claims, so a row cannot be placed under a
  // namespace it does not belong to (a HEALTH_OS row under the Finance namespace,
  // or a Family Office tenant row under the Health namespace, are both refused).
  let resolvedNamespace: string | null = null;
  if (row.domainType === "TENANT_SUBDOMAIN") {
    if (!namespace || namespace.os !== row.os) {
      return { kind: "DENIED", hostname, reason: "DOMAIN_NOT_IN_OS_NAMESPACE" };
    }
    resolvedNamespace = namespace.hostname;
  }

  // Authority gate: the canonical registry must recognise the code as an ACTIVE
  // SECTOR_OS or SHARED_CAPABILITY (cross-OS AND cross-capability binding check).
  const authority = await activeRegistryAuthority(row.os);
  if (!authority) return { kind: "DENIED", hostname, reason: "OS_NOT_RECOGNISED" };
  // The registry kind decides which base TYPE the code's namespace must be.
  const expectedBaseType = baseTypeForRegistryKind(authority.kind);

  // Base-type gate: the code must actually own an ACTIVE base row of the type its
  // registry kind requires, and the name must sit inside THAT row's namespace. A
  // duplicated or mis-typed base row can therefore never stand in for the
  // canonical base — the match is deterministic whatever order rows return in —
  // and a tenant name can never borrow a capability namespace (or the reverse).
  const base = bases.find((entry) => entry.os === row.os && entry.domainType === expectedBaseType);
  if (!base) return { kind: "DENIED", hostname, reason: "OS_NOT_IN_NAMESPACE" };
  if (!isWithinNamespace(hostname, base.hostname)) {
    return { kind: "DENIED", hostname, reason: "DOMAIN_NOT_IN_OS_NAMESPACE" };
  }
  resolvedNamespace = base.hostname;

  // Tenant gate: the tenant must exist and be ACTIVE. A suspended, deactivated
  // or archived tenant stops resolving — and a deleted tenant cannot resolve
  // because the foreign key and the missing row both fail closed here.
  const tenant = await operationalTenant(row.tenantId);
  if (!tenant) return { kind: "DENIED", hostname, reason: "TENANT_NOT_OPERATIONAL" };

  // Tenant-scope gate: the resolved tenant must be inside the principal's own
  // canonical tenant scope (its own tenant, or its governed subtree). This is
  // the second half of the cross-tenant check — the first being that RLS would
  // not have shown the row at all.
  if (!scopeIds.includes(row.tenantId)) {
    return { kind: "DENIED", hostname, reason: "TENANT_OUT_OF_SCOPE" };
  }

  // Country gate: when the domain declares a country it must be the tenant's
  // country. A hostname can never widen a tenant's country scope.
  if (row.countryCode && tenant.countryCode && row.countryCode !== tenant.countryCode) {
    return { kind: "DENIED", hostname, reason: "COUNTRY_MISMATCH" };
  }

  // Entity gate: an entity-bound domain must reference an entity that exists,
  // is ACTIVE, and belongs to the SAME tenant. Entity scoping is preserved, not
  // replaced by the hostname.
  if (row.entityId) {
    const [entity] = await db
      .select({ id: legalEntities.id, tenantId: legalEntities.tenantId, status: legalEntities.status })
      .from(legalEntities)
      .where(and(eq(legalEntities.id, row.entityId), eq(legalEntities.status, "ACTIVE")))
      .limit(1);
    if (!entity || entity.tenantId !== row.tenantId) {
      return { kind: "DENIED", hostname, reason: "ENTITY_NOT_IN_TENANT" };
    }
  }

  return {
    kind: "TENANT",
    context: {
      hostname,
      domainId: row.id,
      tenantId: tenant.id,
      tenantCode: tenant.code,
      os: row.os,
      domainType: row.domainType,
      verificationState: row.verificationState,
      entityId: row.entityId,
      countryCode: row.countryCode ?? tenant.countryCode,
      namespace: resolvedNamespace,
    },
  };
}

/**
 * Resolve the hostname of an actual request.
 *
 * The `host` value comes from the HTTP `Host` header, which is attacker-
 * controlled. That is why the value can only ever cause ADDITIONAL refusal:
 * no code path turns a host into a permission, and `NOT_APPLICABLE` (the
 * platform's own deployment host, localhost, an IP, an unrelated domain) leaves
 * the pre-existing behaviour and checks completely untouched.
 */
export async function resolveRequestHostname(
  principal: Principal,
  hostHeader: string | null | undefined,
): Promise<TenantDomainResolution> {
  const resolution = await resolveHostname(principal, hostHeader);
  if (resolution.kind !== "NOT_APPLICABLE") return resolution;

  switch (resolution.reason) {
    // A loopback/appliance host is the platform's own execution surface (local
    // development, the embedded test harness, a health probe on 127.0.0.1). It
    // derives no tenant context, exactly like the pre-existing behaviour — and
    // because it derives none it cannot widen anything either.
    case "LOCAL":
    case "NO_HOST":
      return resolution;
    // Everything else is a Host value that cannot be a governed tenant domain:
    // a mangled/absolute-form target, an IP literal, a bare single label. There
    // is no tenant to resolve, so the request is REFUSED rather than quietly
    // falling through with a wider context than the (absent) evidence allows.
    case "MALFORMED":
      return { kind: "DENIED", hostname: null, reason: "MALFORMED_HOST" };
    case "IP_LITERAL":
      return { kind: "DENIED", hostname: null, reason: "IP_HOST" };
    case "SINGLE_LABEL":
      return { kind: "DENIED", hostname: null, reason: "SINGLE_LABEL_HOST" };
    default:
      return resolution;
  }
}

/**
 * TRUE when a resolution belongs to the governed namespace of `code` — either the
 * ACTIVE platform base of that code (OS_BASE / CAPABILITY_BASE), or a governed
 * tenant domain BOUND to that code.
 *
 * This is the ONE predicate a capability surface uses to prove that a request
 * arriving on a hostname is inside its own namespace. It is deliberately narrow:
 * a capability base, another OS's base, and a tenant host belonging to another OS
 * or capability all return false, so a hostname can never carry one surface's
 * identity into another's — cross-OS and cross-capability access fail closed.
 */
export function resolutionBelongsToNamespace(
  resolution: TenantDomainResolution,
  code: string,
): boolean {
  switch (resolution.kind) {
    case "OS_BASE":
      return resolution.os === code;
    case "CAPABILITY_BASE":
      return resolution.capability === code;
    case "TENANT":
      return resolution.context.os === code;
    default:
      return false;
  }
}

/**
 * TRUE when a resolution carries NO governed tenant-domain meaning at all: the
 * deployment platform's own host, localhost/loopback, a missing Host, or an
 * unrelated domain. These hosts are the pre-existing execution surfaces and are
 * left exactly as they were before the registry existed — they derive no tenant
 * context, so they cannot widen anything either.
 */
export function resolutionIsPlatformNeutral(resolution: TenantDomainResolution): boolean {
  return resolution.kind === "NOT_APPLICABLE";
}

/**
 * The uniform refusal for a denied hostname.
 *
 * Deliberately information-free: every denial reason (unknown name, unverified
 * name, inactive tenant, cross-tenant name, suspended domain, out-of-scope
 * tenant) produces the same response, so the surface cannot be used as an oracle
 * to enumerate which tenants or hostnames exist. Nothing is redirected and
 * nothing is rendered from tenant data.
 */
export function hostnameDenialResponse(): NextResponse {
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
