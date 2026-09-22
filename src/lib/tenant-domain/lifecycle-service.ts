/**
 * GOVERNED TENANT-DOMAIN LIFECYCLE — the ONLY way a hostname→tenant binding is
 * created, verified, activated, suspended, retired or reassigned.
 *
 * WHAT THIS SERVICE IS
 *   The write half of the governed tenant-domain registry (read half:
 *   `./registry.ts`, resolution: `./resolver.ts`). It is an extension of the
 *   EXISTING administrative governance capability — the same `can()` primitive,
 *   the same tenant/delegation scope assertions, the same audit ledger and
 *   enterprise-event stream, the same governed-refusal envelope — not a second
 *   authorization model and not a second admin surface.
 *
 * WHY EVERY WRITE RUNS ON THE ADMIN BOUNDARY
 *   `beyu_runtime` holds SELECT only on `tenant_domains` (migration 0063 and
 *   `scripts/setup-db-role.ts`). The hostname binding GOVERNS the runtime: if the
 *   runtime credential could re-point or erase it, a compromised runtime could
 *   move a public address between tenants. So mutations go through the existing
 *   admin-DSN boundary (`src/db/admin.ts`) — exactly like `role_assignments`
 *   writes (F-01) — with the audit ledger record and the enterprise event
 *   appended INSIDE the same database transaction as the mutation. A mutation
 *   that is not audited does not commit.
 *
 * CONSTITUTIONAL GUARANTEES
 *   • Registering a domain NEVER creates a tenant, never activates one, never
 *     grants a permission and never makes a name resolve. The row starts CREATED
 *     + UNVERIFIED; the resolver refuses every non-ACTIVE or unproven name.
 *   • Hostname uniqueness is global and enforced by the database, so a slug can
 *     never be claimed twice, by the same tenant or by another, and no hostname
 *     can belong to two OSs at once (cross-OS collision).
 *   • A name only becomes reachable after DNS control has been PROVEN (live TXT
 *     lookup against a stored challenge hash) and a separate, audited activation
 *     act. A tenant SUSPENDED/DEACTIVATED/ARCHIVED/REVOKED tenant cannot resolve
 *     even with an ACTIVE domain, and a domain cannot be activated for a tenant
 *     that is not ACTIVE.
 *   • A SHARED CAPABILITY's base domain (e.g. `familyoffice.beyuos.co.tz`) is a
 *     constitutional record: it is created with the capability (migration/seed)
 *     and is NOT runtime-registerable, verifiable, transitionable or reassignable.
 *     A runtime endpoint that could mint namespaces would be a second OS/capability
 *     registry in disguise, and it could promote a capability into an OS.
 *   • Tenants may be hosted under a Sector OS namespace or under a shared
 *     capability's namespace; both go through the SAME gates, and the namespace
 *     base must correspond to the canonical registry kind.
 *   • Deactivation is not deletion: there is NO delete path — not here, and not
 *     in the runtime grants. Retiring a domain is a terminal STATUS that keeps
 *     the row (and its audit trail) forever, so a retired name cannot be
 *     silently reused and a deleted tenant cannot be resurrected by re-adding
 *     its hostname.
 *   • Reassignment is a two-key act: it is HIGH-RISK (MFA step-up through the
 *     canonical guard), it is impossible while a domain is ACTIVE (suspend
 *     first), and it always returns the domain to CREATED + UNVERIFIED with a
 *     FRESH challenge, so a re-pointed name must prove DNS control again before
 *     it can resolve.
 */
import { and, eq, inArray } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { db } from "@/db";
import { countries, legalEntities, osRegistry, tenantDomains, tenants } from "@/db/schema";
import { AdminGovernanceError } from "@/lib/admin/governance-service";
import { assertDelegationScope, DelegationScopeError } from "@/lib/admin/delegation";
import { can, type Principal } from "@/lib/authz";
import {
  publishEventTx,
  recordAudit,
  recordAuditTx,
  type AuditInput,
  type EventInput,
  type Tx,
} from "@/lib/audit";
import { newId, ID_PREFIX } from "@/lib/ids";
import { assertWithinScope } from "@/lib/tenant-scope";
import type { PermissionCode } from "@/lib/constants";
import { getDomainInScope } from "./registry";
import {
  challengeValueHash,
  dnsChallengeRecordName,
  generateChallenge,
  verifyDnsTxtChallenge,
  type DnsTxtResolver,
} from "./dns-verification";
import { isReservedLabel, isWithinNamespace, normalizeHostname, tenantSlugForCode } from "./hostname";

export const TENANT_DOMAIN_GOVERNANCE_VERSION = "tenant-domain-governance-1.0.0";

/** The immutable, audited domain lifecycle actions of this capability. */
export const TENANT_DOMAIN_AUDIT_ACTIONS = [
  "DOMAIN_REGISTERED",
  "DOMAIN_VERIFIED",
  "DOMAIN_VERIFICATION_FAILED",
  "DOMAIN_ACTIVATED",
  "DOMAIN_SUSPENDED",
  "DOMAIN_RETIRED",
  "DOMAIN_REASSIGNED",
] as const;

type AdminTx = Parameters<Parameters<typeof adminDb.transaction>[0]>[0];

/* ------------------------------------------------------------------ */
/* Shared governed-mutation scaffolding                                */
/* ------------------------------------------------------------------ */

function requireCapability(actor: Principal, permission: PermissionCode, action: string): void {
  const decision = can(actor, permission);
  if (!decision.allowed) {
    throw new AdminGovernanceError("FORBIDDEN", decision.reason, 403);
  }
}

/** Canonical tenant scope + delegation scope, both fail-closed. */
async function requireActionScope(
  actor: Principal,
  permission: PermissionCode,
  target: { tenantId: string; legalEntityId?: string | null; countryCode?: string | null },
): Promise<void> {
  try {
    await assertWithinScope(actor, target.tenantId);
  } catch {
    throw new AdminGovernanceError(
      "TENANT_OUT_OF_SCOPE",
      `Tenant ${target.tenantId} is outside the acting principal's resolved tenant scope.`,
      403,
    );
  }
  try {
    await assertDelegationScope(actor, permission, target);
  } catch (err) {
    if (err instanceof DelegationScopeError) {
      throw new AdminGovernanceError("DELEGATION_SCOPE_EXCEEDED", err.message, 403);
    }
    throw err;
  }
}

function domainAudit(
  actor: Principal,
  action: string,
  objectId: string,
  reason: string,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
  permission: PermissionCode,
  traceId: string,
  tenantId?: string | null,
): AuditInput {
  return {
    tenantId: tenantId ?? actor.tenantId,
    actorUserId: actor.userId,
    action,
    objectType: "TENANT_DOMAIN",
    objectId,
    outcome: "SUCCESS",
    reason,
    authority: permission,
    oldValue,
    newValue,
    traceId,
    policyVersion: TENANT_DOMAIN_GOVERNANCE_VERSION,
  };
}

function domainEvent(
  actor: Principal,
  type: string,
  subjectId: string,
  payload: Record<string, unknown>,
  permission: PermissionCode,
  traceId: string,
  tenantId?: string | null,
): EventInput {
  return {
    type,
    source: "beyu-os/tenant-domain-registry",
    domain: "ORGANIZATION",
    operation: type,
    destinationDomain: null,
    tenantId: tenantId ?? actor.tenantId,
    legalEntityId: null,
    subjectType: "TENANT_DOMAIN",
    subjectId,
    actorUserId: actor.userId,
    classification: "CONFIDENTIAL",
    payload,
    traceId,
    correlationId: traceId,
    causationId: null,
    authorityContext: {
      authorityId: null,
      decisionId: null,
      capabilityCode: null,
      permissionCode: permission,
      policyVersion: TENANT_DOMAIN_GOVERNANCE_VERSION,
    },
    policyVersion: TENANT_DOMAIN_GOVERNANCE_VERSION,
  };
}

async function auditRefusal(
  actor: Principal,
  action: string,
  objectId: string,
  reason: string,
  traceId: string,
): Promise<void> {
  await recordAudit({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    action,
    objectType: "TENANT_DOMAIN",
    objectId,
    outcome: "DENIED",
    reason,
    traceId,
    policyVersion: TENANT_DOMAIN_GOVERNANCE_VERSION,
  }).catch(() => undefined);
}

/**
 * One governed mutation: the write, its audit record and its enterprise event
 * commit together on the administrative boundary, or not at all.
 */
async function committedMutation<T>(
  mutate: (tx: Tx) => Promise<T>,
  audit: AuditInput,
  event: EventInput,
): Promise<T> {
  try {
    return await adminDb.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      const outcome = await mutate(tx);
      await recordAuditTx(tx, audit);
      await publishEventTx(tx, event);
      return outcome;
    });
  } catch (err) {
    // The unique hostname index is the real authority for global uniqueness: if a
    // concurrent act claimed the same hostname between the pre-check and the
    // insert, the database refuses it and the governed refusal is reported
    // instead of a 500. Nothing is partially applied — the transaction rolled back.
    if ((err as { code?: string }).code === "23505") {
      throw new AdminGovernanceError(
        "HOSTNAME_ALREADY_REGISTERED",
        "That hostname is already registered to another tenant domain; a hostname belongs to exactly one tenant.",
        409,
      );
    }
    throw err;
  }
}

/** Guarded update: exactly one row must change, or the act is refused. */
async function updateDomainRow(
  tx: Tx,
  values: Partial<typeof tenantDomains.$inferInsert>,
  where: ReturnType<typeof and>,
  domainId: string,
): Promise<void> {
  const updated = await tx.update(tenantDomains).set(values).where(where).returning({ id: tenantDomains.id });
  if (updated.length !== 1) {
    throw new AdminGovernanceError(
      "DOMAIN_CHANGED",
      `Tenant domain ${domainId} changed while this governed act was in progress; nothing was applied.`,
      409,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Lookups shared by the lifecycle acts                                */
/* ------------------------------------------------------------------ */

type DomainRow = typeof tenantDomains.$inferSelect;

/**
 * Load a domain THROUGH THE RUNTIME, RLS-SCOPED PATH FIRST.
 *
 * The privileged reads that follow (and the write itself) are only justified once
 * the row has been proven visible inside the actor's canonical tenant scope. A
 * domain belonging to another tenant is invisible here and therefore reported
 * exactly like a domain that does not exist — no oracle, and no privileged read
 * triggered by an id the actor cannot see.
 */
async function loadDomainInScope(actor: Principal, domainId: string): Promise<DomainRow> {
  const scoped = await getDomainInScope(actor, domainId);
  if (!scoped) {
    throw new AdminGovernanceError("DOMAIN_NOT_FOUND", `Tenant domain ${domainId} was not found.`, 404);
  }
  const [row] = await adminDb.select().from(tenantDomains).where(eq(tenantDomains.id, domainId)).limit(1);
  if (!row) throw new AdminGovernanceError("DOMAIN_NOT_FOUND", `Tenant domain ${domainId} was not found.`, 404);
  return row;
}

type TenantRow = typeof tenants.$inferSelect;

async function loadTenant(tenantId: string): Promise<TenantRow> {
  const [row] = await adminDb.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!row) throw new AdminGovernanceError("TENANT_NOT_FOUND", `Tenant ${tenantId} was not found.`, 404);
  if (row.status !== "ACTIVE") {
    throw new AdminGovernanceError(
      "TENANT_NOT_OPERATIONAL",
      `Tenant ${row.code} is ${row.status}; a tenant domain may only belong to an ACTIVE tenant.`,
      409,
    );
  }
  return row;
}

/**
 * The canonical OS/capability identity gate.
 *
 * `os_registry` remains the ONE source of truth: a governed domain may only be
 * bound to an ACTIVE `SECTOR_OS` (Finance, Health, Agriculture, Foundation,
 * Ujenzi) or an ACTIVE `SHARED_CAPABILITY` (Family Office, HCM, Governance,
 * Risk/Compliance, Audit/Events, Workflow, Security, Noelia/HIVE). The returned
 * `kind` decides which base-domain type the namespace must have, so a capability
 * can never be given an OS base and an OS can never be given a capability base.
 */
async function requireGovernedOS(code: string): Promise<{ code: string; kind: string }> {
  const [row] = await adminDb
    .select({ code: osRegistry.code, kind: osRegistry.kind })
    .from(osRegistry)
    .where(
      and(
        eq(osRegistry.code, code),
        inArray(osRegistry.kind, ["SECTOR_OS", "SHARED_CAPABILITY"]),
        eq(osRegistry.lifecycle, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!row) {
    throw new AdminGovernanceError(
      "OS_NOT_RECOGNISED",
      `${code} is not an ACTIVE SECTOR_OS or SHARED_CAPABILITY in the canonical OS registry.`,
      422,
    );
  }
  return row;
}

/** The base-domain type the canonical registry kind requires for a namespace. */
function baseTypeForRegistryKind(kind: string): "OS_BASE" | "CAPABILITY_BASE" {
  return kind === "SHARED_CAPABILITY" ? "CAPABILITY_BASE" : "OS_BASE";
}

/**
 * The ACTIVE platform namespace base for an OS or shared capability — the
 * namespace a tenant subdomain needs. The base row's type must correspond to the
 * registry kind, so `mwanza.health.beyuos.co.tz` needs the Health OS base and a
 * capability tenant host needs the capability's own base.
 */
async function requirePlatformBaseDomain(code: string): Promise<{ hostname: string }> {
  const authority = await requireGovernedOS(code);
  const expectedType = baseTypeForRegistryKind(authority.kind);
  const [base] = await adminDb
    .select({ hostname: tenantDomains.hostname })
    .from(tenantDomains)
    .where(
      and(
        eq(tenantDomains.os, code),
        eq(tenantDomains.domainType, expectedType),
        eq(tenantDomains.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!base) {
    throw new AdminGovernanceError(
      "OS_BASE_DOMAIN_NOT_FOUND",
      `No ACTIVE ${expectedType} namespace base is registered for ${code}; a tenant subdomain cannot be created before its namespace exists.`,
      409,
    );
  }
  return base;
}

async function requireCountry(countryCode: string): Promise<void> {
  const [row] = await adminDb
    .select({ code: countries.code })
    .from(countries)
    .where(eq(countries.code, countryCode))
    .limit(1);
  if (!row) {
    throw new AdminGovernanceError(
      "COUNTRY_NOT_FOUND",
      `Country ${countryCode} is not in the canonical country registry.`,
      404,
    );
  }
}

async function requireEntityOfTenant(entityId: string, tenantId: string): Promise<void> {
  const [row] = await adminDb
    .select({ id: legalEntities.id, tenantId: legalEntities.tenantId, status: legalEntities.status })
    .from(legalEntities)
    .where(eq(legalEntities.id, entityId))
    .limit(1);
  if (!row || row.tenantId !== tenantId) {
    throw new AdminGovernanceError(
      "ENTITY_NOT_IN_TENANT",
      `Legal entity ${entityId} does not belong to tenant ${tenantId}.`,
      422,
    );
  }
  if (row.status !== "ACTIVE") {
    throw new AdminGovernanceError(
      "ENTITY_NOT_OPERATIONAL",
      `Legal entity ${entityId} is ${row.status}; a tenant domain may only reference an ACTIVE entity.`,
      409,
    );
  }
}

/** Global hostname uniqueness — the database index is the authority; this is the governed refusal. */
async function requireHostnameAvailable(hostname: string, exceptDomainId?: string): Promise<void> {
  const rows = await adminDb
    .select({ id: tenantDomains.id, tenantId: tenantDomains.tenantId, hostname: tenantDomains.hostname })
    .from(tenantDomains)
    .where(eq(tenantDomains.hostname, hostname))
    .limit(2);
  const clash = rows.find((row) => row.id !== exceptDomainId);
  if (clash) {
    throw new AdminGovernanceError(
      "HOSTNAME_ALREADY_REGISTERED",
      `Hostname ${hostname} is already registered to another tenant domain (${clash.id}); a hostname belongs to exactly one tenant.`,
      409,
    );
  }
}

/* ------------------------------------------------------------------ */
/* REGISTRATION                                                        */
/* ------------------------------------------------------------------ */

export type RegisterTenantDomainInput = {
  tenantId: string;
  /** canonical os_registry code — e.g. HEALTH_OS */
  os: string;
  domainType: "TENANT_SUBDOMAIN" | "CUSTOM_DOMAIN";
  /** subdomain label for TENANT_SUBDOMAIN (defaults to the canonical tenant slug). */
  label?: string | null;
  /** the full hostname for CUSTOM_DOMAIN. Never accepted for a subdomain. */
  hostname?: string | null;
  entityId?: string | null;
  countryCode?: string | null;
  reason: string;
};

export type RegisteredTenantDomain = {
  domainId: string;
  hostname: string;
  status: string;
  verificationState: string;
  verificationMethod: string;
  /** the DNS record the operator must publish; the challenge itself is not returned twice. */
  challengeRecordName: string;
  challengeRecordValue: string;
};

/**
 * Register a hostname for an EXISTING operational tenant.
 *
 * Order of proof (all fail-closed):
 *   canonical permission → tenant scope + delegation scope → OS is an ACTIVE
 *   SECTOR_OS → tenant exists and is ACTIVE → country/entity agree → the OS
 *   namespace exists → the hostname is well-formed, not reserved, not already
 *   taken → the row is created CREATED + UNVERIFIED with a challenge hash.
 *
 * The tenant is NEVER created here. If the caller wants a new tenant, that is
 * `organization:tenant.register` — a different capability, a different act.
 */
export async function registerTenantDomain(
  actor: Principal,
  input: RegisterTenantDomainInput,
  traceId: string,
): Promise<RegisteredTenantDomain> {
  const permission = "organization:tenantdomain.register" as const;
  requireCapability(actor, permission, "admin.tenantdomain.register");

  if ((input.domainType as string) === "OS_BASE" || (input.domainType as string) === "CAPABILITY_BASE") {
    // Platform namespace bases define the namespace of an operating system or of
    // a shared capability. They are constitutional records created WITH the OS or
    // capability itself (migration/seed), never through a runtime API: a runtime
    // endpoint that could mint namespaces would be a second OS/capability registry
    // in disguise — and would let a caller promote a capability into an OS.
    throw new AdminGovernanceError(
      "PLATFORM_BASE_NOT_RUNTIME_REGISTERABLE",
      "Platform base domains (OS and shared capability) are part of the canonical registry and are created with the OS or capability, not at runtime.",
      422,
    );
  }

  const tenant = await loadTenant(input.tenantId);
  await requireActionScope(actor, permission, {
    tenantId: tenant.id,
    legalEntityId: input.entityId ?? null,
    countryCode: input.countryCode ?? tenant.countryCode ?? null,
  });

  await requireGovernedOS(input.os);

  const countryCode = input.countryCode ?? tenant.countryCode ?? null;
  if (countryCode) await requireCountry(countryCode);
  if (input.entityId) await requireEntityOfTenant(input.entityId, tenant.id);

  let hostname: string;
  if (input.domainType === "TENANT_SUBDOMAIN") {
    const base = await requirePlatformBaseDomain(input.os);
    const label = (input.label ?? tenantSlugForCode(tenant.code))?.trim().toLowerCase() ?? "";
    if (!label) {
      throw new AdminGovernanceError(
        "SLUG_UNRESOLVABLE",
        `Tenant code ${tenant.code} does not yield a usable hostname label; supply an explicit label.`,
        422,
      );
    }
    if (isReservedLabel(label)) {
      throw new AdminGovernanceError("SLUG_RESERVED", `Hostname label ${label} is reserved.`, 422);
    }
    const candidate = normalizeHostname(`${label}.${base.hostname}`);
    if (!candidate.ok || candidate.scope !== "HOSTNAME") {
      throw new AdminGovernanceError(
        "HOSTNAME_MALFORMED",
        "The derived tenant hostname is not a valid DNS hostname.",
        422,
      );
    }
    if (!isWithinNamespace(candidate.hostname, base.hostname)) {
      throw new AdminGovernanceError(
        "HOSTNAME_NOT_IN_OS_NAMESPACE",
        `Hostname ${candidate.hostname} is not inside the ${input.os} namespace ${base.hostname}.`,
        422,
      );
    }
    hostname = candidate.hostname;
  } else {
    // CUSTOM_DOMAIN — a name the tenant controls elsewhere. It is registered as
    // UNVERIFIED and cannot resolve until DNS control is proven. A name inside a
    // BEYU OS namespace is refused: it must be registered as a tenant subdomain
    // against that namespace instead, so a custom row can never shadow one.
    const candidate = normalizeHostname(input.hostname ?? null);
    if (!candidate.ok || candidate.scope !== "HOSTNAME") {
      throw new AdminGovernanceError(
        "HOSTNAME_MALFORMED",
        "A custom domain must be a valid, fully qualified DNS hostname.",
        422,
      );
    }
    hostname = candidate.hostname;
    const bases = await adminDb
      .select({ hostname: tenantDomains.hostname, os: tenantDomains.os })
      .from(tenantDomains)
      .where(
        and(
          inArray(tenantDomains.domainType, ["OS_BASE", "CAPABILITY_BASE"]),
          eq(tenantDomains.status, "ACTIVE"),
        ),
      );
    const shadowed = bases.find((base) => isWithinNamespace(hostname, base.hostname));
    if (shadowed) {
      throw new AdminGovernanceError(
        "HOSTNAME_IN_OS_NAMESPACE",
        `Hostname ${hostname} is inside the ${shadowed.os} namespace ${shadowed.hostname} and must be registered as a tenant subdomain of that OS.`,
        422,
      );
    }
  }

  await requireHostnameAvailable(hostname);

  const challenge = generateChallenge();
  const domainId = newId(ID_PREFIX.tenantDomain);

  await committedMutation(
    async (tx) => {
      await tx.insert(tenantDomains).values({
        id: domainId,
        tenantId: tenant.id,
        os: input.os,
        entityId: input.entityId ?? null,
        countryCode,
        hostname,
        domainType: input.domainType,
        status: "CREATED",
        verificationState: "UNVERIFIED",
        verificationMethod: "DNS_TXT",
        verificationTokenHash: challengeValueHash(`beyu-domain-verification=${challenge}`),
        registeredBy: actor.userId,
        classification: "CONFIDENTIAL",
      });
      return { domainId };
    },
    // The audit record names the HOSTNAME and the owning tenant — never the
    // challenge value: the ledger is read by auditors and the challenge is a
    // live verification secret until it is consumed.
    domainAudit(
      actor,
      "DOMAIN_REGISTERED",
      domainId,
      input.reason,
      null,
      {
        hostname,
        tenantId: tenant.id,
        tenantCode: tenant.code,
        os: input.os,
        domainType: input.domainType,
        status: "CREATED",
        verificationState: "UNVERIFIED",
      },
      permission,
      traceId,
    ),
    domainEvent(
      actor,
      "DOMAIN_REGISTERED",
      domainId,
      { hostname, tenantId: tenant.id, os: input.os, domainType: input.domainType },
      permission,
      traceId,
    ),
  );

  return {
    domainId,
    hostname,
    status: "CREATED",
    verificationState: "UNVERIFIED",
    verificationMethod: "DNS_TXT",
    challengeRecordName: dnsChallengeRecordName(hostname),
    challengeRecordValue: `beyu-domain-verification=${challenge}`,
  };
}

/* ------------------------------------------------------------------ */
/* VERIFICATION (live DNS ownership proof)                             */
/* ------------------------------------------------------------------ */

export type VerifyTenantDomainResult = {
  domainId: string;
  hostname: string;
  verificationState: string;
  status: string;
  verifiedAt: string;
};

/**
 * Prove control of a registered hostname through a real DNS TXT lookup.
 *
 * Non-matches, missing records, resolver failures and timeouts are ALL refusals
 * with an audited `DOMAIN_VERIFICATION_FAILED`; the expected value never appears
 * in a response, an error message or a log line. `resolve` is injectable so the
 * positive path is deterministic in tests; production uses the real resolver.
 */
export async function verifyTenantDomain(
  actor: Principal,
  domainId: string,
  reason: string,
  traceId: string,
  resolve?: DnsTxtResolver,
): Promise<VerifyTenantDomainResult> {
  const permission = "organization:tenantdomain.verify" as const;
  requireCapability(actor, permission, "admin.tenantdomain.verify");

  const domain = await loadDomainInScope(actor, domainId);
  if (domain.domainType === "OS_BASE" || domain.domainType === "CAPABILITY_BASE") {
    throw new AdminGovernanceError(
      "PLATFORM_BASE_NOT_RUNTIME_VERIFIABLE",
      "Platform base domains (OS and shared capability) are recorded with the OS or capability itself; they are not verified through the runtime DNS challenge.",
      422,
    );
  }
  await requireActionScope(actor, permission, {
    tenantId: domain.tenantId,
    legalEntityId: domain.entityId,
    countryCode: domain.countryCode,
  });
  await loadTenant(domain.tenantId);

  if (!["CREATED", "MODIFIED", "VERIFIED"].includes(domain.status)) {
    throw new AdminGovernanceError(
      "DOMAIN_NOT_VERIFIABLE",
      `Tenant domain ${domain.hostname} is ${domain.status}; verification requires CREATED/MODIFIED/VERIFIED.`,
      409,
    );
  }
  if (!domain.verificationTokenHash) {
    throw new AdminGovernanceError(
      "DOMAIN_CHALLENGE_ABSENT",
      "This tenant domain has no outstanding challenge; re-register or reassign it to obtain one.",
      409,
    );
  }

  const outcome = await verifyDnsTxtChallenge(domain.hostname, domain.verificationTokenHash, resolve);
  if (!outcome.verified) {
    await auditRefusal(
      actor,
      "DOMAIN_VERIFICATION_FAILED",
      domain.id,
      `DNS_TXT:${outcome.reason}`,
      traceId,
    );
    // One uniform refusal: an unproven name is never partly trusted, and the
    // failure detail stays out of the response so the challenge cannot be probed.
    throw new AdminGovernanceError(
      "DOMAIN_VERIFICATION_FAILED",
      `DNS ownership of ${domain.hostname} could not be proven; the published challenge did not match.`,
      422,
    );
  }

  const verifiedAt = new Date();
  const nextStatus = domain.status === "CREATED" ? "VERIFIED" : domain.status;

  await committedMutation(
    async (tx) => {
      await updateDomainRow(
        tx,
        {
          verificationState: "VERIFIED",
          verifiedBy: actor.userId,
          verifiedAt,
          verificationTokenHash: null,
          verificationEvidence: `DNS_TXT:${dnsChallengeRecordName(domain.hostname)} matched the stored challenge hash`,
          status: nextStatus,
          updatedAt: new Date(),
        },
        eq(tenantDomains.id, domain.id),
        domain.id,
      );
      return { domainId: domain.id };
    },
    domainAudit(
      actor,
      "DOMAIN_VERIFIED",
      domain.id,
      reason,
      { verificationState: domain.verificationState, status: domain.status, verifiedAt: null },
      { verificationState: "VERIFIED", status: nextStatus, verifiedAt: verifiedAt.toISOString() },
      permission,
      traceId,
      domain.tenantId,
    ),
    domainEvent(
      actor,
      "DOMAIN_VERIFIED",
      domain.id,
      { hostname: domain.hostname, tenantId: domain.tenantId, method: "DNS_TXT" },
      permission,
      traceId,
      domain.tenantId,
    ),
  );

  return {
    domainId: domain.id,
    hostname: domain.hostname,
    verificationState: "VERIFIED",
    status: nextStatus,
    verifiedAt: verifiedAt.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* LIFECYCLE TRANSITIONS                                               */
/* ------------------------------------------------------------------ */

export type TenantDomainStatusAction = "activate" | "suspend" | "retire";

const DOMAIN_TRANSITIONS: Record<
  TenantDomainStatusAction,
  { from: string[]; to: "ACTIVE" | "SUSPENDED" | "ARCHIVED"; audit: string; requiresVerified: boolean }
> = {
  activate: {
    from: ["CREATED", "VERIFIED", "MODIFIED", "SUSPENDED"],
    to: "ACTIVE",
    audit: "DOMAIN_ACTIVATED",
    requiresVerified: true,
  },
  suspend: { from: ["ACTIVE", "MODIFIED", "VERIFIED"], to: "SUSPENDED", audit: "DOMAIN_SUSPENDED", requiresVerified: false },
  // Retirement is the terminal state. It is a STATUS, never a delete: the row
  // and its audit trail survive, so a retired name cannot be silently reused and
  // the historical binding stays attributable.
  retire: {
    from: ["CREATED", "VERIFIED", "MODIFIED", "ACTIVE", "SUSPENDED", "REVOKED", "DEACTIVATED"],
    to: "ARCHIVED",
    audit: "DOMAIN_RETIRED",
    requiresVerified: false,
  },
};

/**
 * Move a tenant domain through its lifecycle.
 *
 * Activation requires a VERIFIED domain AND an ACTIVE tenant: a hostname never
 * becomes reachable on the strength of a registration alone, and a suspended
 * tenant never regains reachability by activating its domain. Suspension removes
 * reachability without touching the tenant's existence — the control plane keeps
 * working for that tenant; only the hostname stops resolving.
 */
export async function transitionTenantDomainStatus(
  actor: Principal,
  domainId: string,
  action: TenantDomainStatusAction,
  reason: string,
  traceId: string,
): Promise<{ domainId: string; status: string }> {
  const permission = "organization:tenantdomain.manage" as const;
  requireCapability(actor, permission, `admin.tenantdomain.${action}`);

  const domain = await loadDomainInScope(actor, domainId);
  if (domain.domainType === "OS_BASE" || domain.domainType === "CAPABILITY_BASE") {
    throw new AdminGovernanceError(
      "PLATFORM_BASE_NOT_RUNTIME_MANAGED",
      "Platform base domains (OS and shared capability) are part of the canonical registry and are not transitioned through the runtime lifecycle.",
      422,
    );
  }
  await requireActionScope(actor, permission, {
    tenantId: domain.tenantId,
    legalEntityId: domain.entityId,
    countryCode: domain.countryCode,
  });

  const transition = DOMAIN_TRANSITIONS[action];
  if (!transition.from.includes(domain.status)) {
    await auditRefusal(actor, transition.audit, domain.id, `INVALID_TRANSITION:${domain.status}`, traceId);
    throw new AdminGovernanceError(
      "INVALID_TRANSITION",
      `Tenant domain ${domain.hostname} is ${domain.status}; ${action} requires ${transition.from.join("/")}.`,
      409,
    );
  }
  if (transition.requiresVerified && domain.verificationState !== "VERIFIED") {
    await auditRefusal(actor, transition.audit, domain.id, `UNVERIFIED:${domain.verificationState}`, traceId);
    throw new AdminGovernanceError(
      "DOMAIN_NOT_VERIFIED",
      `Tenant domain ${domain.hostname} is ${domain.verificationState}; activation requires proven DNS ownership.`,
      409,
    );
  }
  if (transition.to === "ACTIVE") {
    // Reachability requires an operational tenant — checked at activation time,
    // not only at registration, so a tenant suspended after registration cannot
    // be made reachable by activating its domain.
    await loadTenant(domain.tenantId);
  }

  await committedMutation(
    async (tx) => {
      await updateDomainRow(
        tx,
        { status: transition.to, updatedAt: new Date() },
        eq(tenantDomains.id, domain.id),
        domain.id,
      );
      return { domainId: domain.id };
    },
    domainAudit(
      actor,
      transition.audit,
      domain.id,
      reason,
      { status: domain.status },
      { status: transition.to },
      permission,
      traceId,
      domain.tenantId,
    ),
    domainEvent(
      actor,
      transition.audit,
      domain.id,
      { hostname: domain.hostname, tenantId: domain.tenantId, status: transition.to },
      permission,
      traceId,
      domain.tenantId,
    ),
  );

  return { domainId: domain.id, status: transition.to };
}

/* ------------------------------------------------------------------ */
/* REASSIGNMENT (step-up, never while ACTIVE)                           */
/* ------------------------------------------------------------------ */

export type ReassignTenantDomainResult = {
  domainId: string;
  hostname: string;
  previousTenantId: string;
  tenantId: string;
  status: string;
  verificationState: string;
  challengeRecordName: string;
  challengeRecordValue: string;
};

/**
 * Move a hostname to a different tenant.
 *
 * This changes which tenant a public address belongs to, so it is deliberately
 * hard: HIGH-RISK with MFA step-up (declared in the canonical permission
 * catalogue, enforced by `guarded()`), impossible while the domain is ACTIVE
 * (suspend first — a live address never changes owner), scoped to BOTH tenants,
 * limited to the same OS, and always returned to CREATED + UNVERIFIED with a
 * fresh challenge, so the new binding must prove DNS control again before it
 * resolves. The whole act — including the previous binding — is audited.
 *
 * The previous tenant's standing is unchanged: reassignment moves a hostname, it
 * does not move data, roles, entities or authority.
 */
export async function reassignTenantDomain(
  actor: Principal,
  domainId: string,
  targetTenantId: string,
  reason: string,
  traceId: string,
): Promise<ReassignTenantDomainResult> {
  const permission = "organization:tenantdomain.reassign" as const;
  requireCapability(actor, permission, "admin.tenantdomain.reassign");

  const domain = await loadDomainInScope(actor, domainId);
  if (domain.domainType === "OS_BASE" || domain.domainType === "CAPABILITY_BASE") {
    throw new AdminGovernanceError(
      "PLATFORM_BASE_NOT_RUNTIME_MANAGED",
      "Platform base domains (OS and shared capability) are part of the canonical registry and cannot be reassigned at runtime.",
      422,
    );
  }
  if (domain.status === "ACTIVE") {
    await auditRefusal(actor, "DOMAIN_REASSIGNED", domain.id, "ACTIVE_DOMAIN_REASSIGNMENT_REFUSED", traceId);
    throw new AdminGovernanceError(
      "DOMAIN_ACTIVE",
      `Tenant domain ${domain.hostname} is ACTIVE; suspend it before reassigning, so a live address never changes owner in one step.`,
      409,
    );
  }
  if (domain.tenantId === targetTenantId) {
    throw new AdminGovernanceError(
      "DOMAIN_ALREADY_OWNED",
      `Tenant domain ${domain.hostname} already belongs to tenant ${targetTenantId}.`,
      409,
    );
  }

  // BOTH sides must be in scope: the source (evidence of the current binding) and
  // the destination. A principal may not move a name it cannot see, and may not
  // move one into a tenant it does not govern.
  await requireActionScope(actor, permission, {
    tenantId: domain.tenantId,
    legalEntityId: domain.entityId,
    countryCode: domain.countryCode,
  });
  const targetTenant = await loadTenant(targetTenantId);
  await requireActionScope(actor, permission, {
    tenantId: targetTenant.id,
    countryCode: targetTenant.countryCode ?? null,
  });
  await requireGovernedOS(domain.os);
  if (domain.domainType === "TENANT_SUBDOMAIN") {
    const base = await requirePlatformBaseDomain(domain.os);
    if (!isWithinNamespace(domain.hostname, base.hostname)) {
      throw new AdminGovernanceError(
        "HOSTNAME_NOT_IN_OS_NAMESPACE",
        `Hostname ${domain.hostname} is not inside the ${domain.os} namespace ${base.hostname}.`,
        422,
      );
    }
  }
  // One hostname, one owner — enforced globally by the unique index; this is the
  // governed refusal (and it also catches a race with a concurrent registration).
  await requireHostnameAvailable(domain.hostname, domain.id);

  const challenge = generateChallenge();
  const refreshed: { status: DomainRow["status"]; verificationState: DomainRow["verificationState"] } = {
    status: "CREATED",
    verificationState: "UNVERIFIED",
  };

  await committedMutation(
    async (tx) => {
      await updateDomainRow(
        tx,
        {
          tenantId: targetTenant.id,
          status: refreshed.status,
          verificationState: refreshed.verificationState,
          verificationMethod: "DNS_TXT",
          verificationTokenHash: challengeValueHash(`beyu-domain-verification=${challenge}`),
          verifiedBy: null,
          verifiedAt: null,
          verificationEvidence: null,
          updatedAt: new Date(),
        },
        // The current owner is part of the WHERE clause: a concurrent act that
        // moved the domain first makes this update write zero rows and the whole
        // governed act is refused rather than silently overwriting.
        and(eq(tenantDomains.id, domain.id), eq(tenantDomains.tenantId, domain.tenantId)),
        domain.id,
      );
      return { domainId: domain.id };
    },
    domainAudit(
      actor,
      "DOMAIN_REASSIGNED",
      domain.id,
      reason,
      {
        hostname: domain.hostname,
        tenantId: domain.tenantId,
        status: domain.status,
        verificationState: domain.verificationState,
      },
      {
        hostname: domain.hostname,
        tenantId: targetTenant.id,
        status: refreshed.status,
        verificationState: refreshed.verificationState,
      },
      permission,
      traceId,
      targetTenant.id,
    ),
    domainEvent(
      actor,
      "DOMAIN_REASSIGNED",
      domain.id,
      {
        hostname: domain.hostname,
        previousTenantId: domain.tenantId,
        tenantId: targetTenant.id,
        requiresReverification: true,
      },
      permission,
      traceId,
      targetTenant.id,
    ),
  );

  return {
    domainId: domain.id,
    hostname: domain.hostname,
    previousTenantId: domain.tenantId,
    tenantId: targetTenant.id,
    status: refreshed.status,
    verificationState: refreshed.verificationState,
    challengeRecordName: dnsChallengeRecordName(domain.hostname),
    challengeRecordValue: `beyu-domain-verification=${challenge}`,
  };
}
