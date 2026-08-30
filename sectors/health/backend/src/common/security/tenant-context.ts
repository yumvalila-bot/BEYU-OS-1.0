import { Injectable, Scope } from "@nestjs/common";
import { AsyncLocalStorage } from "async_hooks";

/**
 * The authenticated actor context attached to every request. Populated by the
 * JwtAuthGuard after a valid token is verified. Guards and services read from
 * this context to enforce tenant isolation and authorization.
 */
export interface ActorContext {
  /** Global BEYU user id (from JWT `sub`). */
  userId: string;
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
  /** Professional licence number, when applicable. */
  licenceNumber?: string | null;
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
