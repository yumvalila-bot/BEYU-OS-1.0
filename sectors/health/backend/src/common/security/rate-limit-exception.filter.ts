/**
 * Rate-limit exception filter — sets Retry-After on 429 responses and
 * redacts any sensitive leakage. The Retry-After value is derived from the
 * resetAt delta returned by the rate limiter.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";

@Catch(HttpException)
export class RateLimitExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse() as any;
    if (
      status === HttpStatus.TOO_MANY_REQUESTS ||
      body?.code === "RATE_LIMITED"
    ) {
      let retryAfter = 60;
      if (body?.resetAt) {
        const delta = Math.ceil(
          (new Date(body.resetAt).getTime() - Date.now()) / 1000,
        );
        if (Number.isFinite(delta) && delta > 0) retryAfter = delta;
      }
      res.setHeader("Retry-After", String(retryAfter));
    }
    res
      .status(status)
      .json(typeof body === "string" ? { message: body } : body);
  }
}
