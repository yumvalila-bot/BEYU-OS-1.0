import { can } from "@/lib/authz";
import type {
  DeclaredNoeliaTool,
  RegisteredNoeliaTool,
  ToolDecision,
  ToolInvocationContext,
  ToolInvocationResult,
  ToolMetadata,
} from "./types";

/** Structural fields of ToolMetadata that define the capability contract. */
const METADATA_CONTRACT_FIELDS = [
  "stableId",
  "version",
  "ownerRole",
  "domain",
  "sideEffects",
  "idempotent",
  "timeoutMs",
  "retryPolicy",
  "jurisdictionRestrictions",
  "entityRestrictions",
  "approvalRequirements",
  "auditRequirements",
] as const;

function metadataContractEquals(a: ToolMetadata, b: ToolMetadata): boolean {
  return METADATA_CONTRACT_FIELDS.every((field) =>
    JSON.stringify(a[field]) === JSON.stringify(b[field]));
}

function describeContract(tool: Pick<RegisteredNoeliaTool, "name" | "permission" | "risk" | "classification" | "approverRole" | "metadata">): string {
  return [
    tool.name,
    tool.permission,
    tool.risk,
    tool.classification ?? "none",
    tool.approverRole ?? "none",
    tool.metadata.stableId,
    tool.metadata.version,
    tool.metadata.ownerRole,
    tool.metadata.domain,
    tool.metadata.sideEffects,
    tool.metadata.idempotent,
    tool.metadata.timeoutMs,
    tool.metadata.jurisdictionRestrictions?.join(",") ?? "none",
    tool.metadata.entityRestrictions,
    tool.metadata.approvalRequirements?.approverRole ?? "none",
  ].join("|");
}

/**
 * The only HIVE capability dispatch point.
 *
 * A tool name is not authority. The registry fails closed through declaration,
 * registration, RBAC/ABAC, tenant, entity, country, jurisdiction and
 * human-approval checks in that order. Tool handlers are BEYU service
 * adapters; HIVE never receives a DB client or transaction handle.
 *
 * Every capability carries a full governed contract (stable id, version,
 * owner, domain, side effects, idempotency, timeout, retry, jurisdiction and
 * entity restrictions, approval and audit requirements). Unknown tools,
 * unknown capabilities, unregistered handlers and context mismatches DENY.
 */
export class NoeliaToolRegistry {
  private readonly declarations = new Map<string, DeclaredNoeliaTool>();
  private readonly handlers = new Map<string, RegisteredNoeliaTool>();

  declare(tool: DeclaredNoeliaTool): this {
    if (this.declarations.has(tool.name)) throw new Error(`Noelia tool '${tool.name}' is already declared.`);
    if (!tool.metadata) throw new Error(`Noelia tool '${tool.name}' must declare governed metadata.`);
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
        declared.approverRole !== tool.approverRole ||
        !metadataContractEquals(declared.metadata, tool.metadata)
      ) {
        throw new Error(
          `Noelia tool '${tool.name}' registration does not match its declaration ` +
            `(declared: ${describeContract(declared)}; registered: ${describeContract(tool)}).`,
        );
      }
    } else {
      this.declarations.set(tool.name, Object.freeze({
        name: tool.name,
        permission: tool.permission,
        classification: tool.classification,
        risk: tool.risk,
        approverRole: tool.approverRole,
        description: tool.description,
        metadata: Object.freeze({ ...tool.metadata }),
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

  /** Capabilities callable by a given principal within a resolved scope. */
  authorizedToolNames(context: ToolInvocationContext): string[] {
    return [...this.declarations.values()]
      .filter((tool) => this.handlers.has(tool.name))
      .filter((tool) => this.authorize(tool.name, context).allowed)
      .map((tool) => tool.name)
      .sort((a, b) => a.localeCompare(b));
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

    // Jurisdiction restrictions on the capability itself fail closed: a
    // jurisdiction-restricted tool requires an explicit in-scope country
    // target, never an implicit "anywhere".
    const restrictions = definition.metadata.jurisdictionRestrictions;
    if (restrictions !== null) {
      const country = context.target.countryCode;
      if (!country || !restrictions.includes(country)) {
        return {
          allowed: false,
          code: "JURISDICTION_DENIED",
          reason: `Tool '${name}' is restricted to jurisdictions ${restrictions.join(", ")}; target '${country ?? "none"}' is not authorized.`,
        };
      }
    }

    /**
     * Human approval gate.
     *
     * Two independent signals require approval:
     *   1. A tool classified HIGH risk (regardless of metadata).
     *   2. Any tool whose governed metadata declares `approvalRequirements`
     *      non-null (so a LOW/MEDIUM risk tool with side effects can still
     *      require a maker/checker decision — a declared approval requirement
     *      is never silently ignored because a future refactor lowered the
     *      risk label).
     *
     * Both gates share the same validity check: HUMAN actor, APPROVED
     * decision, distinct maker/checker identity, and a declared approver
     * role enforced when the metadata specifies one.
     */
    const approvalRequired =
      definition.risk === "HIGH" || definition.metadata.approvalRequirements !== null;
    if (approvalRequired) {
      const approval = context.approval;
      const reason =
        definition.risk === "HIGH"
          ? `High-risk tool '${name}' requires explicit accountable-human approval.`
          : `Tool '${name}' declares a required human approval (${
              definition.metadata.approvalRequirements?.reason ?? "maker/checker required"
            }).`;
      if (!approval) {
        return {
          allowed: false,
          code: "HUMAN_APPROVAL_REQUIRED",
          reason,
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

    // Input contract: declared Zod schema rejects malformed handler input
    // before any BEYU service is reached.
    if (handler.metadata.inputSchema) {
      const parsed = handler.metadata.inputSchema.safeParse(input);
      if (!parsed.success) {
        return {
          allowed: false,
          decision: {
            allowed: false,
            code: "INPUT_INVALID",
            reason: `Tool '${name}' rejected its input contract.`,
          },
        };
      }
      input = parsed.data;
    }

    const output = await this.runWithTimeout(handler, context, input);

    // Output contract: handler output must satisfy the declared shape.
    if (handler.metadata.outputSchema) {
      const parsed = handler.metadata.outputSchema.safeParse(output);
      if (!parsed.success) {
        return {
          allowed: false,
          decision: {
            allowed: false,
            code: "OUTPUT_INVALID",
            reason: `Tool '${name}' produced output outside its declared contract.`,
          },
        };
      }
    }
    return { allowed: true, decision, output };
  }

  private async runWithTimeout(
    handler: RegisteredNoeliaTool,
    context: ToolInvocationContext,
    input: unknown,
  ): Promise<ReturnType<RegisteredNoeliaTool["execute"]> extends Promise<infer T> ? T : never> {
    const timeoutMs = handler.metadata.timeoutMs;
    if (!timeoutMs || timeoutMs <= 0) return handler.execute(context, input);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        handler.execute(context, input),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(Object.assign(new Error(`Noelia tool '${handler.name}' exceeded its ${timeoutMs}ms budget.`), {
              code: "TOOL_TIMEOUT",
            }));
          }, timeoutMs);
        }),
      ]);
    } catch (err) {
      if ((err as { code?: string }).code === "TOOL_TIMEOUT") {
        // The tool has not completed; it cannot have committed an outcome that
        // the caller can rely on. Timeout is a denial, not an exception: the
        // caller persists denial evidence and leaves the domain untouched.
        throw new NoeliaToolTimeoutError(handler.name, timeoutMs);
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export class NoeliaToolTimeoutError extends Error {
  constructor(readonly toolName: string, readonly timeoutMs: number) {
    super(`Noelia tool '${toolName}' exceeded its ${timeoutMs}ms governed timeout.`);
    this.name = "NoeliaToolTimeoutError";
  }
}
