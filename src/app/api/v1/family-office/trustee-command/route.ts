/**
 * GET /api/v1/family-office/trustee-command?trustEntityId=…
 *
 * The Trustee Command model as JSON: trustee bindings from the canonical
 * appointment registry, the reserved-matter review map, instrument/provision/
 * distribution posture, the ownership tree beneath the trust and the authority
 * rails — with the CAP_POSTING activation verdict reported, never unlocked.
 *
 * DELIBERATELY GET-ONLY. There is no POST sibling. Trustee Command is an
 * advisory review surface; every consequential act goes to the governed engine
 * that owns it (`/api/v1/family-office/trust` for trust decisions and
 * distributions, the governance API for resolutions). Adding a mutation here
 * would create a second write path to family entitlement, which the
 * architecture forbids.
 */
import { apiError, apiOk, guarded } from "@/lib/api";
import {
  TRUSTEE_COMMAND_ERROR_STATUS,
  TRUSTEE_TRUST_CAPABILITY,
  TrusteeCommandError,
  loadTrusteeCommand,
} from "@/lib/family/trustee-command-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: TRUSTEE_TRUST_CAPABILITY,
      action: "family.trusteeCommand.read",
      audit: { objectType: "TRUST_INSTRUMENT" },
    },
    async (ctx) => {
      const trustEntityId = new URL(request.url).searchParams.get("trustEntityId");
      try {
        const model = await loadTrusteeCommand(ctx.principal, { trustEntityId });
        return apiOk(model, ctx.traceId);
      } catch (err) {
        if (err instanceof TrusteeCommandError) {
          return apiError(
            err.code,
            err.message,
            TRUSTEE_COMMAND_ERROR_STATUS[err.code],
            ctx.traceId,
          );
        }
        throw err;
      }
    },
  );
}
