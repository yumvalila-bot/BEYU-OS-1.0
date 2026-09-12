import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { createAssessment, listAssessments } from "@/lib/family-office-protection-service";
import { protectionError } from "../_common";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/family-office/protection/assessments
 *
 * Runs the deterministic protection-gap engine (§11) over the caller's inputs
 * and persists the FULL trace — components in, explained lines out — so any
 * figure shown later can be re-derived and audited.
 *
 * The result is labelled MODELED on its face and carries the module's
 * disclaimer as data, not styling. A missing component stays missing: the
 * engine answers with a BOUND (upper/lower) and a `missingInputs` list instead
 * of inventing the difference. It is not legal, tax, actuarial or financial
 * advice, and the AI has no role in producing it (§27): the engine is
 * arithmetic over recorded values.
 */
const ComponentSchema = z
  .object({
    code: z.enum([
      "ECONOMIC_FAMILY_EXPOSURE",
      "SUCCESSION_LIQUIDITY_NEED",
      "DEBT_OBLIGATION_EXPOSURE",
      "BUSINESS_DEPENDENCY_EXPOSURE",
      "QUALIFYING_RESOURCES",
      "EXISTING_QUALIFYING_PROTECTION",
    ]),
    valueMinor: z.number().int().nonnegative().nullish(),
    provenance: z.enum(["VERIFIED", "USER_PROVIDED", "MODELLED", "ESTIMATED", "UNVERIFIED"]),
    sourceRef: z.string().trim().max(200).nullish(),
    label: z.string().trim().min(1).max(300),
  })
  .strict();

const CreateAssessmentSchema = z
  .object({
    asOf: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
    subjectRef: z.string().trim().min(1).max(200),
    subjectKind: z.enum(["FAMILY_MEMBER", "LEGAL_ENTITY", "FAMILY"]),
    components: z.array(ComponentSchema).length(6),
    policyRefs: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
    status: z.enum(["DRAFT", "FINAL"]),
    legalEntityId: z.string().trim().max(100).nullish(),
    countryCode: z.string().trim().regex(/^[A-Z]{2}$/).nullish(),
    reviewedBy: z.string().trim().max(200).nullish(),
    authorityRef: z.string().trim().max(200).nullish(),
  })
  .strict();

/**
 * A client never supplies the RESULT: it is computed by the engine in the
 * service. Sending `result`, `modeledGapMinor` or `methodologyVersion` is the
 * forged-evidence pattern the guards exist to catch.
 */
const SERVER_CONTROLLED = ["tenantId", "id", "result", "modeledGapMinor", "methodology", "methodologyVersion", "epistemicClass", "disclaimer", "createdBy"] as const;

export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "familyoffice:protection.read",
      action: "family.protection.assessments.read",
      rateLimit: { limit: 100, windowMs: 60_000 },
      audit: { objectType: "FAMILY_PROTECTION_ASSESSMENT" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const subjectRef = url.searchParams.get("subjectRef") ?? undefined;
      try {
        return apiOk(await listAssessments(ctx.principal, { subjectRef }), ctx.traceId);
      } catch (err) {
        return protectionError(err, ctx.traceId);
      }
    },
  );
}

export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "familyoffice:protection.manage",
      action: "family.protection.assessment.record",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "FAMILY_PROTECTION_ASSESSMENT" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const forged = SERVER_CONTROLLED.find((f) => f in raw);
      if (forged) {
        return apiError("SERVER_CONTROLLED_FIELD", `'${forged}' is computed or server-derived; the gap result cannot be supplied by the client.`, 422, ctx.traceId);
      }
      const body = CreateAssessmentSchema.parse(raw);
      try {
        return await withIdempotency(ctx, "family.protection.assessment.record", body, async () => {
          const result = await createAssessment(
            { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            ctx.principal,
            {
              asOf: body.asOf,
              currency: body.currency,
              subjectRef: body.subjectRef,
              subjectKind: body.subjectKind,
              components: body.components.map((c) => ({ code: c.code, valueMinor: c.valueMinor ?? null, provenance: c.provenance, sourceRef: c.sourceRef ?? null, label: c.label })),
              policyRefs: body.policyRefs,
              status: body.status,
              legalEntityId: body.legalEntityId ?? null,
              countryCode: body.countryCode ?? null,
              reviewedBy: body.reviewedBy ?? null,
              authorityRef: body.authorityRef ?? null,
            },
          );
          return { status: 201, body: result };
        });
      } catch (err) {
        if (err instanceof Error && err.name === "ProtectionGapInputError") {
          const findings = (err as Error & { findings?: string[] }).findings ?? [err.message];
          return apiError("VALIDATION", "The protection-gap inputs were refused by the engine.", 422, ctx.traceId, { findings });
        }
        return protectionError(err, ctx.traceId);
      }
    },
  );
}
