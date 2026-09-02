/**
 * Global TransactionInterceptor.
 *
 * For every non-@Public() mutating request (POST/PUT/PATCH/DELETE), this
 * interceptor:
 *   1. Auto-builds a TransactionEnvelope via TransactionEnvelopeBuilder.
 *   2. Binds it to TransactionContext ALS for the request lifecycle.
 *   3. Sets the `X-Transaction-ID` response header (correlationId of the
 *      envelope) so clients have a stable reference.
 *   4. After the handler resolves, captures the returned `id` field (when
 *      present) into envelope.resourceId.
 *
 * Safe methods (GET/HEAD/OPTIONS) and @Public() endpoints skip envelope
 * creation so they do not fail closed on missing actor (e.g. login).
 *
 * Missing actor on a governed mutating request fails closed with 401
 * (auth guard fires first) or 500 NO_GLOBAL_USER_ID if auth is miswired.
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, tap } from "rxjs";
import { Request, Response } from "express";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { TransactionContext } from "./transaction-context.middleware";
import { TransactionEnvelopeBuilder } from "../../integrations/beyu/shared/transaction-envelope";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class TransactionInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly txCtx: TransactionContext,
    private readonly builder: TransactionEnvelopeBuilder,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const isPublic =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? false;
    const method = req.method?.toUpperCase() ?? "GET";

    if (isPublic || SAFE_METHODS.has(method)) {
      return next.handle();
    }

    const handler = ctx.getHandler();
    const controller = ctx.getClass();
    const action = `${controller.name}.${handler.name}`;
    // resourceType defaults to path segment — services can override via
    // TransactionContext.current() once request completes.
    const resourceType = req.path?.split("/").filter(Boolean)[1] ?? "unknown";
    const envelope = this.builder.build({
      action,
      resourceType,
      resourceId: req.params?.id ?? null,
      causationId: req.header("X-Causation-ID") ?? null,
    });
    res.setHeader("X-Transaction-ID", envelope.correlationId);
    if (envelope.requestId) res.setHeader("X-Request-ID", envelope.requestId);

    return new Observable((subscriber) => {
      this.txCtx.run(envelope, () => {
        next
          .handle()
          .pipe(
            tap((result: any) => {
              // Capture resource id when returned by the handler.
              if (
                result &&
                typeof result === "object" &&
                !envelope.resourceId
              ) {
                const id =
                  result.id ??
                  result.resourceId ??
                  result.patient_id ??
                  result.encounter_id ??
                  result.order_id ??
                  result.prescription_id ??
                  result.dispense_id ??
                  result.note_id ??
                  result.report_id ??
                  result.audit_id ??
                  result.appointment_id ??
                  result.invoice_id ??
                  result.payment_id ??
                  result.session_id ??
                  result.exam_id;
                if (id) envelope.resourceId = String(id);
              }
            }),
          )
          .subscribe({
            next: (v) => subscriber.next(v),
            error: (e) => subscriber.error(e),
            complete: () => subscriber.complete(),
          });
      });
    });
  }
}
