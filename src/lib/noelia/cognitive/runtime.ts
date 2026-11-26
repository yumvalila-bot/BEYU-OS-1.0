/**
 * NOELIA — cognitive capability invocation.
 *
 * Resolves the caller's authorized scope through the canonical BEYU OS service,
 * builds the invocation context (including the caller's authorized capability
 * set so a brain can compute its effective reach) and invokes the ONE registry.
 *
 * Nothing here is a second dispatch path: it calls `registry.invoke`, which
 * performs the full fail-closed authorization chain.
 */

import type { Principal } from "@/lib/authz";
import type { NoeliaAuthorizedScope, ToolInvocationResult } from "@/lib/noelia/types";
import type { NoeliaToolRegistry } from "@/lib/noelia/tool-registry";

export type RunCognitiveCapabilityInput = {
  registry: NoeliaToolRegistry;
  capability: string;
  principal: Principal;
  traceId: string;
  input: unknown;
  /** Injected so this module carries no direct database concern. */
  resolveScope: (principal: Principal) => Promise<NoeliaAuthorizedScope>;
};

export async function runCognitiveCapability(
  input: RunCognitiveCapabilityInput,
): Promise<ToolInvocationResult> {
  const scope = await input.resolveScope(input.principal);

  const context = {
    principal: input.principal,
    traceId: input.traceId,
    target: {
      tenantId: input.principal.tenantId,
      legalEntityId: null,
      countryCode: null,
    },
    scope,
  };

  // The caller's actual authorized capability set. Computed from the SAME
  // registry so the brain-reach computation cannot disagree with enforcement.
  const authorizedCapabilities = input.registry.authorizedToolNames(context);

  return input.registry.invoke(
    input.capability,
    { ...context, authorizedCapabilities },
    input.input,
  );
}
