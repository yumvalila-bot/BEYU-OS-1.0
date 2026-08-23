/**
 * NOELIA — governed intelligence facade.
 *
 * Architectural boundary:
 *   Noelia → registered capability/tool → BEYU service → canonical context-aware
 *   db → transaction-local tenant context → PostgreSQL → audit.
 *
 * This facade intentionally imports no database handle. Noelia is intelligence;
 * BEYU OS identity, policy, capability services and evidence remain authority.
 */
import type { Principal } from "./authz";
import { withTenantDatabaseContext } from "./tenant-scope";
import { createDefaultNoeliaToolRegistry } from "./noelia/default-tools";
import { BeyuNoeliaEvidenceService, BeyuNoeliaPolicyService } from "./noelia/platform-services";
import { NoeliaRuntime, routeEngine } from "./noelia/runtime";
import { requestedNoeliaTarget, resolveNoeliaAuthorizedScope } from "./noelia/scope-service";
import type { NoeliaAnswer, NoeliaTargetContext } from "./noelia/types";

export { routeEngine };
export type { NoeliaAnswer, NoeliaEngine } from "./noelia/types";
export { NoeliaRuntime } from "./noelia/runtime";
export { NoeliaToolRegistry } from "./noelia/tool-registry";
export { decideMemoryVisibility, retrieveGovernedMemory } from "./noelia/memory";

export async function askNoelia(params: {
  principal: Principal;
  question: string;
  traceId: string;
  target?: Partial<NoeliaTargetContext> | null;
}): Promise<NoeliaAnswer> {
  return withTenantDatabaseContext(params.principal, async () => {
    const scope = await resolveNoeliaAuthorizedScope(params.principal);
    const target = requestedNoeliaTarget(params.principal, params.target);
    const runtime = new NoeliaRuntime(
      createDefaultNoeliaToolRegistry(),
      new BeyuNoeliaPolicyService(),
      new BeyuNoeliaEvidenceService(),
    );
    return runtime.ask({
      principal: params.principal,
      question: params.question,
      traceId: params.traceId,
      target,
      scope,
    });
  });
}
