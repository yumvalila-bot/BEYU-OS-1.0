import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import {
  DbConnection,
  DB_CONNECTION,
} from "../../modules/identity/db-connection";
import { timingSafeEqual, randomToken } from "../crypto/crypto";
import { IS_PUBLIC_KEY } from "./public.decorator";

/**
 * Global CSRF double-submit-token guard.
 *
 *  - SAFE_METHODS (GET/HEAD/OPTIONS) always allowed.
 *  - POST/PUT/PATCH/DELETE require:
 *      * X-CSRF-Token (or X-XSRF-Token) header, AND
 *      * matching __Host-csrf cookie value, AND
 *      * server-side bcrypt hash bound to session+user+tenant and non-expired, AND
 *      * same-origin Origin / non-cross-site Sec-Fetch-Site.
 *  - Requests with Authorization: Bearer are CSRF-immune and exempt.
 *  - @Public() decorated routes (e.g. login) opt out.
 *
 * Tokens are issued by POST /auth/csrf-token. We set the __Host-csrf cookie
 * with Secure; SameSite=Strict; Path=/ in production.
 */

export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSRF_TOKEN_HEADER = "x-csrf-token";
export const CSRF_COOKIE_NAME = "__Host-csrf";
export const CSRF_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2h
// Unified @Public() decorator and key — shared with the global JwtAuthGuard so
// one decorator exempts a route from BOTH authentication and CSRF.
export { IS_PUBLIC_KEY, Public } from "./public.decorator";

@Injectable()
export class CsrfDoubleSubmitGuard implements CanActivate {
  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const method = req.method?.toUpperCase() ?? "GET";

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    if (SAFE_METHODS.has(method)) return true;

    const auth = req.headers?.authorization;
    if (auth && /^Bearer\s+/i.test(auth)) return true;

    this.assertSameOrigin(req);

    const cookieToken: string | undefined = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken: string | undefined =
      req.headers?.[CSRF_TOKEN_HEADER] ?? req.headers?.["x-xsrf-token"];
    if (!cookieToken || !headerToken) {
      await this.logFailure(req, "missing_token");
      throw new ForbiddenException("CSRF_TOKEN_MISSING");
    }
    if (!timingSafeEqual(String(cookieToken), String(headerToken))) {
      await this.logFailure(req, "token_mismatch");
      throw new ForbiddenException("CSRF_TOKEN_INVALID");
    }
    const dot = String(cookieToken).indexOf(".");
    if (dot < 0) {
      await this.logFailure(req, "malformed_token");
      throw new ForbiddenException("CSRF_TOKEN_INVALID");
    }
    const tokenId = String(cookieToken).slice(0, dot);
    const rows = await this.db.query<any>(
      `SELECT token_hash, user_id, session_id, tenant_id, expires_at, used_at, revoked_at
         FROM health.csrf_tokens
        WHERE token_id=$1::uuid`,
      [tokenId],
    );
    const t = rows[0];
    if (!t) {
      await this.logFailure(req, "unknown_token");
      throw new ForbiddenException("CSRF_TOKEN_INVALID");
    }
    if (t.used_at || t.revoked_at) {
      await this.logFailure(req, "token_revoked");
      throw new ForbiddenException("CSRF_TOKEN_REVOKED");
    }
    if (new Date(t.expires_at).getTime() < Date.now()) {
      await this.logFailure(req, "token_expired");
      throw new ForbiddenException("CSRF_TOKEN_EXPIRED");
    }
    if (
      req.user?.sessionId &&
      t.session_id &&
      String(t.session_id) !== String(req.user.sessionId)
    ) {
      await this.logFailure(req, "session_crossover");
      throw new ForbiddenException("CSRF_SESSION_CROSSOVER");
    }
    if (
      req.user?.userId &&
      t.user_id &&
      String(t.user_id) !== String(req.user.userId)
    ) {
      await this.logFailure(req, "user_crossover");
      throw new ForbiddenException("CSRF_USER_CROSSOVER");
    }
    if (
      req.user?.tenantId &&
      t.tenant_id &&
      String(t.tenant_id) !== String(req.user.tenantId)
    ) {
      await this.logFailure(req, "tenant_crossover");
      throw new ForbiddenException("CSRF_TENANT_CROSSOVER");
    }
    const ok = await bcrypt.compare(
      String(cookieToken).slice(dot + 1),
      t.token_hash,
    );
    if (!ok) {
      await this.logFailure(req, "hash_mismatch");
      throw new ForbiddenException("CSRF_TOKEN_INVALID");
    }
    return true;
  }

  private assertSameOrigin(req: any): void {
    const origin = req.headers?.origin as string | undefined;
    const secFetchSite = req.headers?.["sec-fetch-site"] as string | undefined;
    if (secFetchSite && secFetchSite.toLowerCase() === "cross-site") {
      throw new ForbiddenException("CSRF_CROSS_SITE");
    }
    const allowed = this.allowedOrigins();
    if (!origin) {
      throw new ForbiddenException("CSRF_NO_ORIGIN");
    }
    if (!allowed.has(origin.replace(/\/$/, ""))) {
      throw new ForbiddenException("CSRF_ORIGIN_FORBIDDEN");
    }
  }

  private allowedOrigins(): Set<string> {
    const configured =
      this.config.get<string>("CSRF_ALLOWED_ORIGINS") ??
      this.config.get<string>("CORS_ORIGIN") ??
      "";
    const origins = configured
      .split(",")
      .map((o) => o.trim().replace(/\/$/, ""))
      .filter(Boolean);
    return new Set(origins);
  }

  private async logFailure(req: any, reason: string): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO health.rate_limit_events
            (tenant_id, key_type, key_value, endpoint, window_label, limit_count, current_count, action, metadata)
         VALUES (CASE WHEN $1::uuid IS NULL THEN NULL ELSE $1::uuid END,
                 'ip',$2,$3,'csrf',1,1,'blocked',$4::jsonb)`,
        [
          req.user?.tenantId ?? null,
          String(req.ip ?? "unknown"),
          req.path ?? req.url,
          JSON.stringify({ reason, method: req.method }),
        ],
      );
    } catch {
      // audit failure must not mask rejection
    }
  }
}

/** Issue a bound CSRF token and persist its bcrypt hash. */
export async function issueCsrfToken(
  db: DbConnection,
  args: {
    tenantId: string;
    userId: string;
    sessionId: string;
    boundIp?: string | null;
    ttlMs?: number;
  },
): Promise<{ tokenId: string; token: string }> {
  const tokenId = randomUUID();
  const rand = randomToken(32);
  const token = `${tokenId}.${rand}`;
  const hash = await bcrypt.hash(rand, 10);
  await db.query(
    `INSERT INTO health.csrf_tokens
        (token_id, tenant_id, user_id, session_id, token_hash, issued_at, expires_at, bound_ip)
     VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,now(),now() + ($6::double precision / 1000 || ' seconds')::interval,$7::inet)`,
    [
      tokenId,
      args.tenantId,
      args.userId,
      args.sessionId,
      hash,
      args.ttlMs ?? CSRF_TOKEN_TTL_MS,
      args.boundIp ?? null,
    ],
  );
  return { tokenId, token };
}

export async function revokeCsrfTokensForSession(
  db: DbConnection,
  sessionId: string,
): Promise<void> {
  await db.query(
    `UPDATE health.csrf_tokens SET revoked_at=now() WHERE session_id=$1 AND revoked_at IS NULL`,
    [sessionId],
  );
}
