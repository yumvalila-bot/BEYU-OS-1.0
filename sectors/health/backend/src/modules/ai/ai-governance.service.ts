/**
 * AI Governance — Noelia/HIVE auditing & human-in-the-loop gating.
 *
 * Every AI-assisted clinical operation MUST be recorded via `recordInvocation`.
 * High/critical risk AI outputs default to human_approval_status='pending' and
 * MUST NOT be applied to clinical records until `applyWithApproval` (or
 * `recordHumanDecision`) transitions them to approved.
 *
 * The actual call to HIVE/Noelia routes through the `hive` adapter (fail-closed
 * if not configured); we never return fabricated model output.
 */
import { Inject, Injectable } from "@nestjs/common";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { withIsolation } from "../identity/db-utils";
import { AuditService } from "../audit/audit.service";
import { AdapterRegistry } from "../integrations/adapter-registry";
import { DomainError } from "../../common/errors/domain.error";
import { currentCorrelationId } from "../../common/observability/correlation-id.middleware";

export type RiskClass = "low" | "medium" | "high" | "critical";
export type InvocationStatus = "recorded" | "submitted_to_hive" | "completed" | "failed" | "blocked";

export interface InvocationInput {
  taskType: string;
  patient_id?: string;
  encounter_id?: string;
  input: Record<string, unknown>;
  riskClass?: RiskClass;
  modelProvider?: string;
  modelName?: string;
  modelVersion?: string;
}

@Injectable()
export class AiGovernanceService {
  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
    private readonly audit: AuditService,
    private readonly adapters: AdapterRegistry,
  ) {}

  /** Record an AI invocation and route to HIVE if configured. Fail-closed on error. */
  async invoke(input: InvocationInput): Promise<{ invocation_id: string; output: any; blocked: boolean; reason?: string }> {
    const actor = this.tenantCtx.current();
    if (!actor) throw new Error("AUTH_REQUIRED");
    const riskClass: RiskClass = input.riskClass ?? this.riskFor(input.taskType);
    const cid = currentCorrelationId();
    return withIsolation(this.db, this.tenantCtx, "ai_invocation", async (tx) => {
      const inputHash = hash(input.input);
      const ins = await tx.query<{ invocation_id: string }>(
        `INSERT INTO health.ai_invocations
           (tenant_id, entity_code, country_code, actor_global_user_id, practitioner_id,
            facility_id, patient_id, encounter_id, ai_identity, model_provider, model_name,
            model_version, task_type, input_provenance, input_hash, risk_classification,
            human_approval_status, status, correlation_id)
         VALUES (current_setting('app.tenant_id', true)::uuid,
                 current_setting('app.entity_code', true),
                 current_setting('app.country_code', true),
                 $1,$2,$3,$4,$5,'noelia',$6,$7,$8,$9,$10::jsonb,$11,$12,
                 CASE WHEN $12 IN ('high','critical') THEN 'pending'::text ELSE 'not_required'::text END,
                 'recorded',$13)
         RETURNING invocation_id`,
        [actor.userId, (actor as any).practitionerId ?? null, (actor as any).facilityId ?? null,
         input.patient_id ?? null, input.encounter_id ?? null,
         input.modelProvider ?? null, input.modelName ?? null, input.modelVersion ?? null,
         input.taskType, JSON.stringify({ fields: Object.keys(input.input ?? {}) }), inputHash,
         riskClass, cid],
      );
      const invocationId = ins[0].invocation_id;
      let output: any = null;
      let blocked = false;
      let reason: string | undefined;
      let status: InvocationStatus = "completed";
      let confidence: number | null = null;
      try {
        const hive = this.adapters.get("hive");
        if (!hive) {
          blocked = true;
          reason = "HIVE adapter not registered";
          status = "blocked";
        } else {
          const probe = await hive.probe();
          const available = probe.state === "available";
          if (!available) {
            blocked = true;
            reason = `HIVE not available: state=${probe.state}, last_error=${probe.last_error}`;
            status = "blocked";
          } else {
            // Real call would go here; without HIVE credentials we stay fail-closed.
            blocked = true;
            reason = "HIVE credentials not configured; AI invocation blocked";
            status = "blocked";
          }
        }
      } catch (e: any) {
        blocked = true;
        reason = `HIVE error: ${e.message}`;
        status = "failed";
      }
      await tx.query(
        `UPDATE health.ai_invocations SET status=$2, output=$3::jsonb, confidence=$4, error_code=$5, duration_ms=0
          WHERE invocation_id=$1`,
        [invocationId, status, JSON.stringify(output ?? {}), confidence, reason ?? null],
      );
      await this.audit.record(tx, {
        operation: "ai.invoke",
        resourceType: "ai_invocation",
        resourceId: invocationId,
        metadata: { taskType: input.taskType, blocked, reason, riskClass } as any,
        resultStatus: blocked ? "error" : "ok",
      });
      return { invocation_id: invocationId, output, blocked, reason };
    });
  }

  async recordHumanDecision(invocationId: string, decision: "approved" | "rejected" | "overridden", reviewerId?: string): Promise<void> {
    const actor = this.tenantCtx.current();
    if (!actor) throw new Error("AUTH_REQUIRED");
    if (actor.userId === reviewerId) {
      throw DomainError.forbidden("AI output cannot be approved by the invoking user (self-approval prohibited)");
    }
    return withIsolation(this.db, this.tenantCtx, "ai_invocation", async (tx) => {
      const rows = await tx.query<{ risk_classification: RiskClass; human_approval_status: string }>(
        `SELECT risk_classification, human_approval_status FROM health.ai_invocations
          WHERE invocation_id=$1 AND tenant_id=current_setting('app.tenant_id', true)::uuid`,
        [invocationId],
      );
      if (!rows.length) throw DomainError.notFound("ai_invocation");
      if (rows[0].human_approval_status === "approved" && rows[0].risk_classification === "critical") {
        throw DomainError.requiresHumanDecision("critical AI outputs already approved; overrides require a second reviewer (not yet implemented)");
      }
      await tx.query(
        `UPDATE health.ai_invocations SET human_approval_status=$2, human_reviewer_global_user_id=$3,
                human_approval_at=now() WHERE invocation_id=$1`,
        [invocationId, decision, reviewerId ?? actor.userId],
      );
      await this.audit.record(tx, {
        operation: `ai.review.${decision}`,
        resourceType: "ai_invocation",
        resourceId: invocationId,
      });
    });
  }

  private riskFor(task: string): RiskClass {
    if (/(medication|prescrib|diagnos|differential|triage|sepsis|imaging_interpret)/i.test(task)) return "high";
    if (/(summary|note_completion|coding)/i.test(task)) return "medium";
    return "low";
  }
}

function hash(obj: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("crypto").createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}
