import { apiOk, guarded } from "@/lib/api";
import { listGenerationalPlans } from "@/lib/family-office-capital-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/family-office/generational-wealth
 *
 * Generational wealth and education (§30, §31), plus the business systemization
 * maturity ladder (§29).
 *
 * This is governed DATA. It records intentions, readiness and lessons; it does
 * not create, constitute or imply a legal trust, and no field here should ever be
 * presented as a legal instrument. `legalEffectReference` exists so a plan can
 * point at the instrument that gives it legal effect, rather than implying that
 * this record is one.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:generational.read", action: "family.generational.read", rateLimit: { limit: 60, windowMs: 60_000 }, audit: { objectType: "FAMILY_GENERATIONAL_PLAN" } },
    async (ctx) => {
      const { plans, total } = await listGenerationalPlans(ctx.principal);
      return apiOk(
        {
          plans,
          total,
          /**
           * An ADOPTED plan with no legal-effect reference. Adopted means somebody
           * decided it governs, and a governing record with no instrument behind it
           * is a gap worth surfacing rather than assuming was handled.
           */
          adoptedWithoutLegalReference: plans
            .filter((p) => p.status === "ADOPTED" && !p.legalEffectReference)
            .map((p) => ({ id: p.id, structureRef: p.structureRef, status: p.status })),
          disclaimer:
            "These are governed internal records of intent and readiness. They are not legal instruments and do not create a trust. Legal effect requires professional review and a separate instrument.",
        },
        ctx.traceId,
      );
    },
  );
}
