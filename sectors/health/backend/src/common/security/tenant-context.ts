import { Injectable, Scope } from "@nestjs/common";
import { AsyncLocalStorage } from "async_hooks";

/**
 * The authenticated actor context attached to every request. Populated by the
 * JwtAuthGuard after a valid token is verified. Guards and services read from
 * this context to enforce tenant isolation and authorization.
 */
export interface ActorContext {
  /** Global BEYU user id (from JWT `sub`). Canonical identity. */
  userId: string;
  /** Alias for canonical GlobalUserID — equals userId. Optional for backward compatibility with test fixtures. */
  globalUserId?: string;
  /** Email / login identifier. */
  email: string;
  /** Canonical role id (see permissions.ts). */
  role: string;
  /** Effective permission grants beyond the role (break-glass, explicit grants). */
  permissions: string[];
  /** Tenant (facility/organization unit) the user is acting within. */
  tenantId: string;
  /** Owning organization of the tenant. */
  organizationId?: string;
  /** Canonical country code (ISO-3166 alpha-2 / repository convention). */
  countryCode?: string | null;
  /** Canonical owning legal-entity code, when applicable. */
  entityCode?: string | null;
  /** Professional licence number (do NOT fabricate; null if not yet verified). */
  licenceNumber?: string | null;
  /** Licensing authority that issued the licence (e.g. MCT, TNMC, Pharmacy Council). */
  licensingAuthority?: string | null;
  /** Practitioner registry id in health.practitioners, if registered. */
  practitionerId?: string | null;
  /** Authorized scope of practice codes. */
  scopeOfPractice?: string[];
  /** Canonical facility the actor is operating at for this request. */
  facilityId?: string | null;
  /** Ward within facility. */
  ward?: string | null;
  /** Department within facility. */
  department?: string | null;
  /** Room / bay. */
  room?: string | null;
  /** Service point (e.g. triage, registration, pharmacy-dispense). */
  servicePoint?: string | null;
  /** IANA timezone in effect for this request (e.g. Africa/Dar_es_Salaam). */
  timezone?: string | null;
  /** Current session id (for audit traceability). */
  sessionId?: string | null;
}

/**
 * Shared async storage. The authenticated actor is established per request by
 * the global AuthContextMiddleware via `run(...)` (NOT `enterWith`), so the
 * context is scoped to the request's async chain and can never leak into other
 * requests or async work. Downstream guards and services read the context.
 */
export const tenantStorage = new AsyncLocalStorage<ActorContext | null>();

@Injectable({ scope: Scope.DEFAULT })
export class TenantContext {
  /** The current actor context, or null when unauthenticated. */
  current(): ActorContext | null {
    return tenantStorage.getStore() ?? null;
  }

  /** Throw-safe accessor. */
  require(): ActorContext {
    const ctx = this.current();
    if (!ctx) {
      throw new Error("AUTH_REQUIRED");
    }
    return ctx;
  }

  /** Current tenant id. */
  tenantId(): string {
    return this.require().tenantId;
  }

  /**
   * Run `fn` with `actor` established for the current request's async chain.
   * Async operations created during `fn` (including downstream middleware,
   * guards, and handlers scheduled via `next()`) inherit the actor. After
   * `fn` completes the store is cleared — no leakage to other requests.
   * This is the recommended entry point (avoids the leak-prone `enterWith`).
   */
  run<T>(actor: ActorContext, fn: () => T): T {
    return tenantStorage.run(actor, fn);
  }

  /**
   * Set the actor for the current async context (used by guards/specs).
   * Prefer `run` where possible; `enterWith` persists for the current async
   * resource and its continuations and must not be used to span requests.
   */
  enterWith(actor: ActorContext): void {
    tenantStorage.enterWith(actor);
  }
}
