import { can } from "@/lib/authz";
import type {
  DeclaredNoeliaTool,
  RegisteredNoeliaTool,
  ToolDecision,
  ToolInvocationContext,
  ToolInvocationResult,
} from "./types";

/**
 * The only HIVE capability dispatch point.
 *
 * A tool name is not authority. The registry fails closed through declaration,
 * registration, RBAC/ABAC, tenant, entity, country and human-approval checks in
 * that order. Tool handlers are BEYU service adapters; HIVE never receives a DB
 * client or transaction handle.
 */
export class NoeliaToolRegistry {
  private readonly declarations = new Map<string, DeclaredNoeliaTool>();
  private readonly handlers = new Map<string, RegisteredNoeliaTool>();

  declare(tool: DeclaredNoeliaTool): this {
    if (this.declarations.has(tool.name)) throw new Error(`Noelia tool '${tool.name}' is already declared.`);
    this.declarations.set(tool.name, Object.freeze({ ...tool }));
    return this;
  }

  register(tool: RegisteredNoeliaTool): this {
    const declared = this.declarations.get(tool.name);
    if (declared) {
      if (
        declared.permission !== tool.permission ||
        declared.risk !== tool.risk ||
        declared.classification !== tool.classification ||
        declared.approverRole !== tool.approverRole
      ) {
        throw new Error(`Noelia tool '${tool.name}' registration does not match its declaration.`);
      }
    } else {
      this.declarations.set(tool.name, Object.freeze({
        name: tool.name,
        permission: tool.permission,
        classification: tool.classification,
        risk: tool.risk,
        approverRole: tool.approverRole,
        description: tool.description,
      }));
    }
    this.handlers.set(tool.name, Object.freeze({ ...tool }));
    return this;
  }

  definition(name: string): DeclaredNoeliaTool | null {
    return this.declarations.get(name) ?? null;
  }

  list(): Array<DeclaredNoeliaTool & { registered: boolean }> {
    return [...this.declarations.values()]
      .map((tool) => ({ ...tool, registered: this.handlers.has(tool.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  authorize(name: string, context: ToolInvocationContext | null | undefined): ToolDecision {
    const definition = this.declarations.get(name);
    if (!definition) {
      return { allowed: false, code: "TOOL_UNKNOWN", reason: `Unknown tool '${name}' is denied by default.` };
    }
    if (!this.handlers.has(name)) {
      return { allowed: false, code: "TOOL_UNREGISTERED", reason: `Tool '${name}' has no registered BEYU service.` };
    }
    if (
      !context ||
      !context.principal ||
      !context.traceId ||
      !context.target?.tenantId ||
      !context.scope ||
      !Array.isArray(context.scope.tenantIds) ||
      !Array.isArray(context.scope.legalEntityIds) ||
      !Array.isArray(context.scope.countryCodes) ||
      !Array.isArray(context.scope.entities) ||
      !Array.isArray(context.scope.tenantCountries)
    ) {
      return { allowed: false, code: "CONTEXT_MISSING", reason: "Canonical identity and scope context are required." };
    }

    const access = can(context.principal, definition.permission, {
      ...(definition.classification ? { classification: definition.classification } : {}),
    });
    if (!access.allowed) {
      return {
        allowed: false,
        code: access.reason.startsWith("ABAC: clearance") ? "CLASSIFICATION_DENIED" : "PERMISSION_DENIED",
        reason: access.reason,
      };
    }

    if (!context.scope.tenantIds.includes(context.target.tenantId)) {
      return { allowed: false, code: "TENANT_DENIED", reason: "Target tenant is outside the resolved BEYU scope." };
    }
    const targetEntity = context.target.legalEntityId
      ? context.scope.entities.find((entity) => entity.id === context.target.legalEntityId)
      : null;
    if (
      context.target.legalEntityId &&
      (!targetEntity || targetEntity.tenantId !== context.target.tenantId)
    ) {
      return {
        allowed: false,
        code: "ENTITY_DENIED",
        reason: "Target legal entity is outside the target tenant's resolved BEYU scope.",
      };
    }
    if (context.target.countryCode) {
      const countryMatchesTarget = targetEntity
        ? targetEntity.countryCode === context.target.countryCode
        : context.scope.tenantCountries.some((item) =>
            item.tenantId === context.target.tenantId && item.countryCode === context.target.countryCode);
      if (!countryMatchesTarget) {
        return {
          allowed: false,
          code: "COUNTRY_DENIED",
          reason: "Target country is outside the target tenant/entity's resolved BEYU scope.",
        };
      }
    }

    if (definition.risk === "HIGH") {
      const approval = context.approval;
      if (!approval) {
        return {
          allowed: false,
          code: "HUMAN_APPROVAL_REQUIRED",
          reason: `High-risk tool '${name}' requires explicit accountable-human approval.`,
        };
      }
      if (
        approval.actorType !== "HUMAN" ||
        approval.decision !== "APPROVED" ||
        !approval.approvalId ||
        !approval.approvingHumanId ||
        approval.approvingHumanId === context.principal.userId
      ) {
        return {
          allowed: false,
          code: "HUMAN_APPROVAL_INVALID",
          reason: "Approval must be an explicit HUMAN maker/checker decision by a separate identity.",
        };
      }
    }

    return { allowed: true, code: "ALLOWED", reason: `Tool '${name}' is authorized through BEYU OS.` };
  }

  async invoke(
    name: string,
    context: ToolInvocationContext | null | undefined,
    input: unknown,
  ): Promise<ToolInvocationResult> {
    const decision = this.authorize(name, context);
    if (!decision.allowed) return { allowed: false, decision };

    // Authorization proves both context and registration, so these lookups are
    // safe without a permissive fallback.
    const handler = this.handlers.get(name);
    if (!handler || !context) {
      return {
        allowed: false,
        decision: { allowed: false, code: "TOOL_UNREGISTERED", reason: `Tool '${name}' became unavailable.` },
      };
    }
    const output = await handler.execute(context, input);
    return { allowed: true, decision, output };
  }
}
