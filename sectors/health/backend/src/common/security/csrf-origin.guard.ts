import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Defense-in-depth CSRF protection for cookie-based endpoints.
 *
 * The refresh token lives in an httpOnly, SameSite=Lax cookie and is consumed
 * by POST endpoints (refresh / restore / logout). SameSite=Lax already stops
 * the cookie from being attached to cross-site POST requests; this guard adds
 * an independent Origin / Sec-Fetch-Site check so a browser-initiated request
 * from an unapproved origin (or one marked cross-site) is rejected outright.
 *
 * Allowed origins come from CSRF_ALLOWED_ORIGINS (comma-separated) or fall back
 * to CORS_ORIGIN. In production CSRF_ALLOWED_ORIGINS must be an explicit,
 * non-wildcard list. Requests with NO Origin / Sec-Fetch-Site header (native /
 * server-to-server clients) are allowed — those carry the refresh token in the
 * body, not the cookie, so they are not CSRF-relevant.
 */
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const origin = req.headers?.["origin"] as string | undefined;
    const secFetchSite = req.headers?.["sec-fetch-site"] as string | undefined;

    // Cross-site browser request — reject regardless of Origin parsing.
    if (secFetchSite && secFetchSite.toLowerCase() === "cross-site") {
      throw new ForbiddenException("CSRF: cross-site request rejected");
    }

    // No Origin + no cross-site marker: not a browser cross-origin request.
    if (!origin) {
      return true;
    }

    if (!this.isAllowed(origin)) {
      throw new ForbiddenException("CSRF: disallowed Origin");
    }
    return true;
  }

  private isAllowed(origin: string): boolean {
    const configured =
      this.config.get<string>("CSRF_ALLOWED_ORIGINS") ??
      this.config.get<string>("CORS_ORIGIN", "");
    if (!configured) return false;
    const allowed = configured
      .split(",")
      .map((o) => o.trim().replace(/\/$/, ""))
      .filter(Boolean);
    // Refuse a wildcard allow-list — it defeats the purpose of the check.
    if (allowed.includes("*")) return false;
    return allowed.includes(origin.replace(/\/$/, ""));
  }
}
