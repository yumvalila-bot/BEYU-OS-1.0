import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import { DomainError } from "./domain.error";
import { currentCorrelationId } from "../observability/correlation-id.middleware";

const HTTP_BY_CODE: Record<string, number> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  TENANT_VIOLATION: HttpStatus.FORBIDDEN,
  VALIDATION: HttpStatus.BAD_REQUEST,
  INVALID_STATE: HttpStatus.CONFLICT,
  IDEMPOTENCY_REPLAY: HttpStatus.CONFLICT,
  EXTERNAL_UNAVAILABLE: HttpStatus.BAD_GATEWAY,
  POLICY_REQUIRES_HUMAN: HttpStatus.UNPROCESSABLE_ENTITY,
};

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest();

    if (exception instanceof DomainError) {
      const status = HTTP_BY_CODE[exception.code] ?? 400;
      const body = {
        ok: false,
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
        correlationId: currentCorrelationId(),
      };
      if (status >= 500) {
        this.logger.error(
          {
            err: exception,
            method: req.method,
            path: req.url,
            correlationId: body.correlationId,
          },
          exception.stack,
        );
      } else {
        this.logger.warn({
          code: exception.code,
          message: exception.message,
          method: req.method,
          path: req.url,
          correlationId: body.correlationId,
        });
      }
      res.status(status).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const payloadObj =
        typeof payload === "string" ? { message: payload } : (payload as Record<string, unknown>);
      // If a DomainError code was attached (e.g. VALIDATION from the ValidationPipe
      // factory), preserve it; otherwise label as HTTP_ERROR.
      const code = typeof payloadObj.code === "string" ? payloadObj.code : "HTTP_ERROR";
      const { code: _omit, message, details, ...rest } = payloadObj;
      res.status(status).json({
        ok: false,
        error: {
          code,
          message: typeof message === "string" ? message : exception.message,
          details: details as Record<string, unknown> | undefined,
          ...(Object.keys(rest).length > 0 ? { meta: rest } : {}),
        },
        correlationId: currentCorrelationId(),
      });
      return;
    }

    // Unexpected error — never leak stack; log with correlation id.
    const err = exception instanceof Error ? exception : new Error(String(exception));
    const correlationId = currentCorrelationId();
    this.logger.error(
      { err, method: req.method, path: req.url, correlationId },
      err.stack,
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
      correlationId,
    });
  }
}
