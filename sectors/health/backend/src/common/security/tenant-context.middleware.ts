import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { tenantStorage } from "./tenant-context";

/**
 * Establishes an AsyncLocalStorage store for each request so that an
 * authenticated actor can be entered (via JwtAuthGuard -> enterWith) and read
 * by any downstream guard/service without passing the request object around.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    tenantStorage.run(null, () => {
      next();
    });
  }
}
