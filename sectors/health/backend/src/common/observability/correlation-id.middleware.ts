import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";
import { AsyncLocalStorage } from "async_hooks";

/** Request-scoped metadata stored in ALS for correlation/logging. */
export interface RequestContext {
  correlationId: string;
  requestId: string;
  startedAt: number;
  method: string;
  path: string;
  ip: string;
  userAgent?: string;
}

export const requestStorage = new AsyncLocalStorage<RequestContext>();

export const CORRELATION_ID_HEADER = "x-correlation-id";
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Assigns a correlation id (reuses the client-provided value if present, else
 * a fresh UUIDv4) and stores it in AsyncLocalStorage so logging, audit and
 * downstream calls can attach it without threading it through every function
 * signature. The id is also echoed on the response so callers can correlate
 * support requests.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId =
      String(req.header(CORRELATION_ID_HEADER) ?? "") || randomUUID();
    const requestId =
      String(req.header(REQUEST_ID_HEADER) ?? "") || randomUUID();
    const ctx: RequestContext = {
      correlationId,
      requestId,
      startedAt: Date.now(),
      method: req.method,
      path: req.originalUrl ?? req.url,
      ip: req.ip ?? "unknown",
      userAgent: req.header("user-agent"),
    };
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    res.setHeader(REQUEST_ID_HEADER, requestId);
    requestStorage.run(ctx, () => next());
  }
}

/** Helper used by services/audit to read the current correlation id. */
export function currentCorrelationId(): string {
  return requestStorage.getStore()?.correlationId ?? "no-context";
}
