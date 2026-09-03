/**
 * Canonical identity federation (BEYU OS ⇄ Health OS).
 *
 * THE invariant this service enforces: a Health OS account can only exist
 * and act as a linked projection of ONE canonical BEYU identity. The sector
 * never mints canonical GlobalUserIds of its own outside the explicitly
 * labelled test harness.
 *
 * Three modes (evaluated per call, fail-closed):
 *
 *   LIVE          BEYU_IDENTITY_ENDPOINT + credential configured → real
 *                 canonical provisioning/lookup via the internal service
 *                 API (signed service tokens; outbox-gated; audited).
 *
 *   TEST_HARNESS  BEYU_IDENTITY_TEST_HARNESS=true AND NODE_ENV≠production →
 *                 synthetic canonical reference via the REAL bridge link
 *                 machinery (exercises link-once/conflict semantics without
 *                 a control plane). Refused in production by boot validation
 *                 and structurally by mode() below.
 *
 *   BLOCKED       anything else → registration cannot complete (503), new
 *                 logins of unlinked users are denied. Existing linked
 *                 sessions keep working with sector-local enforcement
 *                 (control-plane-degraded mode is documented, not silent).
 *
 * Revocation propagation: when LIVE, login and refresh re-check the
 * canonical lifecycle status; a SUSPENDED/TERMINATED canonical identity is
 * denied even if the sector account is locally "active". A control-plane
 * OUTAGE during login FAILS CLOSED for NEW sessions (503) — the degraded
 * mode never silently downgrades identity assurance.
 */

import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DB_CONNECTION, type DbConnection } from "./db-connection";
import { BeyuIdentityBridge, type CanonicalUserLink } from "./beyu-bridge";
import {
  IdentityAdapter,
  type CanonicalIdentity,
} from "../../integrations/beyu/shared/identity.adapter";

export type FederationMode = "LIVE" | "TEST_HARNESS" | "BLOCKED";

export const IDENTITY_TEST_HARNESS_ENV = "BEYU_IDENTITY_TEST_HARNESS";

@Injectable()
export class IdentityFederationService {
  private readonly logger = new Logger(IdentityFederationService.name);

  constructor(
    @Inject(DB_CONNECTION) private readonly conn: DbConnection,
    private readonly bridge: BeyuIdentityBridge,
    private readonly identity: IdentityAdapter,
    private readonly cfg: ConfigService,
  ) {}

  /** Current federation mode. TEST_HARNESS is structurally impossible in
   *  production even if boot validation were bypassed. */
  mode(): FederationMode {
    if (this.identity.getState() !== "NOT_CONFIGURED") return "LIVE";
    const harness = this.cfg.get<string>(IDENTITY_TEST_HARNESS_ENV);
    if (harness === "true" && process.env.NODE_ENV !== "production") {
      return "TEST_HARNESS";
    }
    return "BLOCKED";
  }

  /**
   * Establish the canonical link at REGISTRATION time (link-once).
   * Throws (fail-closed) when the canonical identity cannot be established;
   * the caller compensates by deleting the just-created sector user so a
   * retry is not permanently blocked by "email already exists".
   */
  async linkOnRegister(args: {
    globalUserId: string;
    email: string;
    displayName: string;
    tenantCode: string | null;
    tenantId: string | null;
  }): Promise<CanonicalUserLink> {
    const mode = this.mode();

    if (mode === "LIVE") {
      const tenantCode = args.tenantCode ?? this.defaultTenantCode();
      try {
        const canonical = await this.identity.registerCanonical({
          email: args.email,
          displayName: args.displayName,
          tenantCode,
          sectorUserId: args.globalUserId,
          tenantId: args.tenantId,
        });
        return await this.bridge.linkUser({
          globalUserId: args.globalUserId,
          beyuUserId: canonical.globalUserId,
          beyuPartyId: canonical.partyId,
          linkedBy: "health-os-federation",
        });
      } catch (e) {
        this.logger.error(
          `canonical registration failed for ${args.email}: ${(e as Error).message}`,
        );
        // Fail closed — no canonical identity, no sector account.
        throw new ServiceUnavailableException("CANONICAL_IDENTITY_UNAVAILABLE");
      }
    }

    if (mode === "TEST_HARNESS") {
      // Synthetic canonical reference through the REAL link machinery:
      // link-once, conflict detection and the acting gate all stay enforced.
      const synthetic = `BEYU-TEST-${args.globalUserId}`;
      return await this.bridge.linkUser({
        globalUserId: args.globalUserId,
        beyuUserId: synthetic,
        linkedBy: "health-os-test-harness",
      });
    }

    // BLOCKED: production (or any deployment) without the control plane
    // cannot onboard identities. Fail closed.
    throw new ServiceUnavailableException("CANONICAL_IDENTITY_REQUIRED");
  }

  /** Login/refresh gate: the sector user MUST hold a canonical link. */
  async requireLinkedIdentity(
    globalUserId: string,
  ): Promise<CanonicalUserLink> {
    return this.bridge.requireCanonicalLink(globalUserId);
  }

  /**
   * Canonical status re-check (LIVE only). Denies non-ACTIVE canonical
   * identities; a control-plane outage denies NEW sessions (fail-closed 503)
   * rather than silently downgrading identity assurance.
   */
  async assertCanonicalStatusActive(link: CanonicalUserLink): Promise<void> {
    if (this.mode() !== "LIVE") return;
    let canonical: CanonicalIdentity;
    try {
      canonical = await this.identity.lookupCanonical({
        globalUserId: link.beyuUserId,
        tenantId: null,
      });
    } catch (e) {
      this.logger.error(
        `canonical status check failed for ${link.beyuUserId}: ${(e as Error).message}`,
      );
      throw new ServiceUnavailableException("CANONICAL_IDENTITY_UNAVAILABLE");
    }
    if (canonical.status !== "ACTIVE" || canonical.partyStatus !== "ACTIVE") {
      throw new UnauthorizedException("CANONICAL_IDENTITY_NOT_ACTIVE");
    }
  }

  // ── Request-path revalidation (strict-TTL cached canonical status) ────────
  //
  // Revocation check strategy (documented in IDENTITY_FEDERATION.md):
  //   * authentication moments (login/refresh/restore) → ALWAYS a fresh
  //     uncached canonical lookup (assertCanonicalStatusActive);
  //   * every authenticated request → canonical status revalidated at most
  //     once per TTL (default 30s, hard cap 300s) per canonical identity;
  //   * sector-side security_version is checked on EVERY request (existing
  //     middleware behaviour — instant sector-level revocation);
  //   * during a control-plane outage, a bounded-stale cached status may
  //     carry READ requests for at most MAX_STALE (default 300s, hard cap
  //     900s) — the documented degraded-mode allowance; MUTATING requests
  //     and anything beyond MAX_STALE fail closed (503/401).
  // There is deliberately no long-lived cache: every entry is at most
  // TTL seconds old when trusted unconditionally.

  private statusCache = new Map<
    string,
    { status: string; partyStatus: string; fetchedAt: number }
  >();

  private ttlMs(): number {
    const raw = Number(this.cfg.get("BEYU_IDENTITY_STATUS_TTL_MS") ?? 30_000);
    const ttl = Number.isFinite(raw) && raw > 0 ? raw : 30_000;
    return Math.min(ttl, 300_000); // hard cap: never a long-lived cache
  }

  private maxStaleMs(): number {
    const raw = Number(
      this.cfg.get("BEYU_IDENTITY_STATUS_MAX_STALE_MS") ?? 300_000,
    );
    const ms = Number.isFinite(raw) && raw > 0 ? raw : 300_000;
    return Math.min(ms, 900_000); // hard cap: 15 minutes, ever
  }

  /** Test hook: drop the cache so the next check revalidates remotely. */
  invalidateStatusCache(): void {
    this.statusCache.clear();
  }

  /**
   * Per-request canonical status gate with strict TTL. `mutating` requests
   * never ride a stale entry across an outage (fail closed); reads may use
   * the bounded-stale entry within MAX_STALE (documented degraded mode).
   */
  async assertCanonicalStatusFresh(
    link: CanonicalUserLink,
    opts: { mutating: boolean },
  ): Promise<void> {
    if (this.mode() !== "LIVE") return; // harness/blocked: sector-local status + link only
    const ttl = this.ttlMs();
    const maxStale = this.maxStaleMs();
    const entry = this.statusCache.get(link.beyuUserId);
    const age = entry ? Date.now() - entry.fetchedAt : Number.POSITIVE_INFINITY;

    if (entry && age <= ttl) {
      // Fresh — but a non-ACTIVE cached status always denies (a revoked
      // identity must never pass on a cache hit).
      if (entry.status !== "ACTIVE" || entry.partyStatus !== "ACTIVE") {
        throw new UnauthorizedException("CANONICAL_IDENTITY_NOT_ACTIVE");
      }
      return;
    }

    try {
      const canonical = await this.identity.lookupCanonical({
        globalUserId: link.beyuUserId,
        tenantId: null,
      });
      this.statusCache.set(link.beyuUserId, {
        status: canonical.status,
        partyStatus: canonical.partyStatus,
        fetchedAt: Date.now(),
      });
      if (canonical.status !== "ACTIVE" || canonical.partyStatus !== "ACTIVE") {
        throw new UnauthorizedException("CANONICAL_IDENTITY_NOT_ACTIVE");
      }
      return;
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e; // definitive denial
      // Control-plane outage during revalidation:
      this.logger.error(
        `canonical status revalidation failed for ${link.beyuUserId}: ${(e as Error).message}`,
      );
      if (entry && age <= maxStale && !opts.mutating) {
        // Documented degraded-mode allowance for reads, bounded by MAX_STALE —
        // but NEVER for a non-ACTIVE cached status (stale revocation denies).
        if (entry.status !== "ACTIVE" || entry.partyStatus !== "ACTIVE") {
          throw new UnauthorizedException("CANONICAL_IDENTITY_NOT_ACTIVE");
        }
        return;
      }
      // Mutating requests, or staleness beyond MAX_STALE: fail closed.
      throw new ServiceUnavailableException("CANONICAL_IDENTITY_UNAVAILABLE");
    }
  }

  /** Middleware gate: a token without a canonical link cannot act. */
  async assertLinkedForRequest(globalUserId: string): Promise<void> {
    const link = await this.bridge.getLink(globalUserId);
    if (!link) {
      throw new UnauthorizedException("NO_CANONICAL_IDENTITY_LINK");
    }
  }

  private defaultTenantCode(): string {
    return this.cfg.get<string>("BEYU_IDENTITY_TENANT_CODE") ?? "BEYU-HEALTH";
  }
}

/** Re-exported for callers that handle the HTTP-facing exceptions. */
export { ForbiddenException };
