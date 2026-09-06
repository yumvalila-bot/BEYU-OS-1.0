import { z } from "zod";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import {
  BeyuNoeliaComplianceService,
  ComplianceAccessError,
  ComplianceStateError,
  EvidenceIntegrityError,
  type CertificationState,
} from "@/lib/noelia";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

const ActionsSchema = z.object({
  action: z.enum([
    "register.requirement",
    "assess.applicability",
    "confirm.applicability",
    "register.control",
    "map.requirement-control",
    "evaluate.control",
    "register.evidence",
    "verify.evidence",
    "verify.evidence-integrity",
    "record.impact",
    "record.risk-treatment",
    "verify.risk-treatment",
    "create.audit",
    "add.finding",
    "add.corrective-action",
    "verify.corrective-action",
    "add.exception",
    "approve.exception",
    "record.management-review",
    "register.regulatory-change",
    "upsert.monitoring-indicator",
    "transition.readiness",
    "generate.assessor-package",
  ]),
  payload: z.record(z.unknown()),
}).strict();

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function stringField(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string") throw new Error(`Missing or invalid field: ${key}`);
  return value;
}

function optionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`Invalid field: ${key}`);
  return value;
}

function optionalBoolean(payload: Record<string, unknown>, key: string): boolean | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`Invalid field: ${key}`);
  return value;
}

function optionalStringArray(payload: Record<string, unknown>, key: string): string[] | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) throw new Error(`Invalid field: ${key}`);
  return value as string[];
}

/**
 * POST /api/v1/ai/noelia/compliance/actions — governed Phase 4 compliance
 * engine actions.
 *
 * Every action runs under the canonical tenant RLS context and is denied if
 * the caller lacks the corresponding `ai:compliance.*` permission.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "ai:compliance.write",
      action: "ai.noelia.compliance.action",
      rateLimit: { limit: 90, windowMs: 60_000 },
      audit: { objectType: "AI_COMPLIANCE" },
      databaseContext: "handler",
    },
    async (ctx) => {
      let body: z.infer<typeof ActionsSchema>;
      try {
        body = await parseBody(ctx.request, ActionsSchema);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return apiError("VALIDATION_FAILED", "Request payload failed schema validation.", 422, ctx.traceId);
        }
        throw err;
      }

      try {
        const service = new BeyuNoeliaComplianceService();
        const result = await withTenantDatabaseContext(ctx.principal, async () => {
          const p = asRecord(body.payload);
          switch (body.action) {
            case "register.requirement":
              return service.registerRequirement({
                principal: ctx.principal,
                traceId: ctx.traceId,
                requirementCode: stringField(p, "requirementCode"),
                frameworkId: stringField(p, "frameworkId"),
                reference: stringField(p, "reference"),
                title: stringField(p, "title"),
                description: stringField(p, "description"),
                category: stringField(p, "category"),
                ownerRole: stringField(p, "ownerRole"),
                priority: optionalString(p, "priority") ?? "MEDIUM",
                jurisdictionCode: optionalString(p, "jurisdictionCode"),
                countryCode: optionalString(p, "countryCode"),
                applicableToTypes: optionalStringArray(p, "applicableToTypes"),
                effectiveFrom: optionalString(p, "effectiveFrom"),
                effectiveTo: optionalString(p, "effectiveTo"),
                source: optionalString(p, "source"),
              });
            case "assess.applicability":
              return service.assessApplicability({
                principal: ctx.principal,
                traceId: ctx.traceId,
                requirementId: stringField(p, "requirementId"),
                subjectType: stringField(p, "subjectType"),
                subjectId: stringField(p, "subjectId"),
                tenantId: optionalString(p, "tenantId"),
                countryCode: optionalString(p, "countryCode"),
                legalEntityId: optionalString(p, "legalEntityId"),
                result: stringField(p, "result"),
                rationale: stringField(p, "rationale"),
                legalBasis: optionalString(p, "legalBasis"),
                legallyAmbiguous: optionalBoolean(p, "legallyAmbiguous"),
                validUntil: optionalString(p, "validUntil"),
              });
            case "confirm.applicability":
              return service.confirmApplicability({
                principal: ctx.principal,
                traceId: ctx.traceId,
                id: stringField(p, "id"),
                reviewedBy: optionalString(p, "reviewedBy") ?? undefined,
                result: optionalString(p, "result") ?? undefined,
              });
            case "register.control":
              return service.registerControl({
                principal: ctx.principal,
                traceId: ctx.traceId,
                controlCode: stringField(p, "controlCode"),
                title: stringField(p, "title"),
                description: stringField(p, "description"),
                controlType: stringField(p, "controlType"),
                ownerRole: stringField(p, "ownerRole"),
                riskLevel: optionalString(p, "riskLevel") ?? "LOW",
                implementationStatus: optionalString(p, "implementationStatus") ?? "NOT_IMPLEMENTED",
                assessmentRequirement: optionalString(p, "assessmentRequirement") ?? "INTERNAL",
                sourcePath: optionalString(p, "sourcePath"),
                testPath: optionalString(p, "testPath"),
                evidencePath: optionalString(p, "evidencePath"),
                reviewDate: optionalString(p, "reviewDate"),
                automation: optionalString(p, "automation") ?? "MANUAL",
                frameworks: optionalStringArray(p, "frameworks"),
              });
            case "map.requirement-control":
              return service.mapRequirementControl({
                principal: ctx.principal,
                traceId: ctx.traceId,
                requirementId: stringField(p, "requirementId"),
                controlId: stringField(p, "controlId"),
                rationale: optionalString(p, "rationale") ?? undefined,
                evidenceId: optionalString(p, "evidenceId"),
              });
            case "evaluate.control":
              return service.evaluateControlEffectiveness({
                principal: ctx.principal,
                traceId: ctx.traceId,
                mappingId: stringField(p, "mappingId"),
                evidenceId: optionalString(p, "evidenceId") ?? null,
                verifier: optionalString(p, "verifier") ?? undefined,
                verdict: optionalString(p, "verdict") ?? undefined,
              });
            case "register.evidence":
              return service.registerEvidence({
                principal: ctx.principal,
                traceId: ctx.traceId,
                evidenceCode: stringField(p, "evidenceCode"),
                evidenceType: stringField(p, "evidenceType"),
                title: stringField(p, "title"),
                description: stringField(p, "description"),
                subjectType: stringField(p, "subjectType"),
                subjectId: stringField(p, "subjectId"),
                tenantId: optionalString(p, "tenantId"),
                sourceUri: optionalString(p, "sourceUri"),
                contentRef: optionalString(p, "contentRef"),
                evidenceDate: optionalString(p, "evidenceDate"),
                expiresAt: typeof p.expiresAt === "string" ? new Date(p.expiresAt) : null,
                payload: asRecord(p.payload ?? {}),
              });
            case "verify.evidence":
              return service.verifyEvidence({
                principal: ctx.principal,
                traceId: ctx.traceId,
                evidenceId: stringField(p, "evidenceId"),
                verifier: optionalString(p, "verifier") ?? undefined,
                externalAssessor: optionalString(p, "externalAssessor"),
                externalReference: optionalString(p, "externalReference"),
              });
            case "verify.evidence-integrity":
              return service.verifyEvidenceIntegrity({
                principal: ctx.principal,
                traceId: ctx.traceId,
                evidenceId: stringField(p, "evidenceId"),
              });
            case "record.impact":
              return service.recordImpactAssessment({
                principal: ctx.principal,
                traceId: ctx.traceId,
                assessmentCode: stringField(p, "assessmentCode"),
                systemId: stringField(p, "systemId"),
                requirementId: optionalString(p, "requirementId"),
                tenantId: optionalString(p, "tenantId"),
                countryCode: optionalString(p, "countryCode"),
                legalEntityId: optionalString(p, "legalEntityId"),
                scope: stringField(p, "scope"),
                impactType: stringField(p, "impactType"),
                impactLevel: stringField(p, "impactLevel"),
                safetyImpact: optionalString(p, "safetyImpact") ?? "NOT_ASSESSED",
                fundamentalRights: optionalString(p, "fundamentalRights") ?? "NOT_ASSESSED",
                dataProtection: optionalString(p, "dataProtection") ?? "NOT_ASSESSED",
                humanOversight: optionalString(p, "humanOversight") ?? "NOT_ASSESSED",
                rationale: optionalString(p, "rationale") ?? undefined,
                nextReviewAt: optionalString(p, "nextReviewAt"),
              });
            case "record.risk-treatment":
              return service.recordRiskTreatment({
                principal: ctx.principal,
                traceId: ctx.traceId,
                riskId: stringField(p, "riskId"),
                treatment: stringField(p, "treatment"),
                ownerRole: stringField(p, "ownerRole"),
                rationale: stringField(p, "rationale"),
                targetResidual: optionalString(p, "targetResidual"),
                dueDate: optionalString(p, "dueDate"),
                evidenceId: optionalString(p, "evidenceId"),
              });
            case "verify.risk-treatment":
              return service.verifyRiskTreatment({
                principal: ctx.principal,
                traceId: ctx.traceId,
                treatmentId: stringField(p, "treatmentId"),
                evidenceId: optionalString(p, "evidenceId") ?? null,
                verifier: optionalString(p, "verifier") ?? undefined,
              });
            case "create.audit":
              return service.createAudit({
                principal: ctx.principal,
                traceId: ctx.traceId,
                auditCode: stringField(p, "auditCode"),
                title: stringField(p, "title"),
                scope: stringField(p, "scope"),
                objective: stringField(p, "objective"),
                frameworkId: optionalString(p, "frameworkId"),
                auditType: optionalString(p, "auditType") ?? "GAP_ASSESSMENT",
                auditor: stringField(p, "auditor"),
                auditorRole: stringField(p, "auditorRole"),
                periodStart: optionalString(p, "periodStart"),
                periodEnd: optionalString(p, "periodEnd"),
                tenantId: optionalString(p, "tenantId"),
                legalEntityId: optionalString(p, "legalEntityId"),
                countryCode: optionalString(p, "countryCode"),
                plannedAt: optionalString(p, "plannedAt"),
                notes: optionalString(p, "notes"),
              });
            case "add.finding":
              return service.addFinding({
                principal: ctx.principal,
                traceId: ctx.traceId,
                findingCode: stringField(p, "findingCode"),
                auditId: stringField(p, "auditId"),
                severity: stringField(p, "severity"),
                title: stringField(p, "title"),
                description: stringField(p, "description"),
                controlId: optionalString(p, "controlId"),
                evidenceId: optionalString(p, "evidenceId"),
                tenantId: optionalString(p, "tenantId"),
                ownerRole: stringField(p, "ownerRole"),
                dueDate: optionalString(p, "dueDate"),
              });
            case "add.corrective-action":
              return service.addCorrectiveAction({
                principal: ctx.principal,
                traceId: ctx.traceId,
                actionCode: stringField(p, "actionCode"),
                findingId: stringField(p, "findingId"),
                description: stringField(p, "description"),
                rootCause: optionalString(p, "rootCause"),
                ownerRole: stringField(p, "ownerRole"),
                dueDate: optionalString(p, "dueDate"),
                evidenceId: optionalString(p, "evidenceId"),
                tenantId: optionalString(p, "tenantId"),
              });
            case "verify.corrective-action":
              return service.verifyCorrectiveAction({
                principal: ctx.principal,
                traceId: ctx.traceId,
                actionId: stringField(p, "actionId"),
                evidenceId: stringField(p, "evidenceId"),
                verifier: optionalString(p, "verifier") ?? undefined,
              });
            case "add.exception":
              return service.addException({
                principal: ctx.principal,
                traceId: ctx.traceId,
                exceptionCode: stringField(p, "exceptionCode"),
                requirementId: optionalString(p, "requirementId"),
                controlId: optionalString(p, "controlId"),
                subjectType: stringField(p, "subjectType"),
                subjectId: stringField(p, "subjectId"),
                tenantId: optionalString(p, "tenantId"),
                rationale: stringField(p, "rationale"),
                riskAccepted: optionalString(p, "riskAccepted") ?? "NOT_ASSESSED",
                compensatingControl: optionalString(p, "compensatingControl"),
                expiryDate: optionalString(p, "expiryDate"),
              });
            case "approve.exception":
              return service.approveException({
                principal: ctx.principal,
                traceId: ctx.traceId,
                exceptionId: stringField(p, "exceptionId"),
                approved: optionalBoolean(p, "approved"),
                approvedBy: optionalString(p, "approvedBy") ?? undefined,
                reviewedBy: optionalString(p, "reviewedBy") ?? undefined,
              });
            case "record.management-review":
              return service.recordManagementReview({
                principal: ctx.principal,
                traceId: ctx.traceId,
                reviewCode: stringField(p, "reviewCode"),
                title: stringField(p, "title"),
                frameworkId: optionalString(p, "frameworkId"),
                meetingDate: optionalString(p, "meetingDate"),
                reviewedBy: optionalString(p, "reviewedBy") ?? undefined,
                scope: stringField(p, "scope"),
                decisions: asRecord(p.decisions ?? {}),
                actions: asRecord(p.actions ?? {}),
                tenantId: optionalString(p, "tenantId"),
                legalEntityId: optionalString(p, "legalEntityId"),
                countryCode: optionalString(p, "countryCode"),
              });
            case "register.regulatory-change":
              return service.registerRegulatoryChange({
                principal: ctx.principal,
                traceId: ctx.traceId,
                changeCode: stringField(p, "changeCode"),
                frameworkId: stringField(p, "frameworkId"),
                title: stringField(p, "title"),
                source: stringField(p, "source"),
                sourceUri: optionalString(p, "sourceUri"),
                jurisdictionCode: optionalString(p, "jurisdictionCode"),
                effectiveDate: optionalString(p, "effectiveDate"),
                assessment: optionalString(p, "assessment"),
                impactLevel: optionalString(p, "impactLevel"),
                assignedRole: optionalString(p, "assignedRole"),
                dueDate: optionalString(p, "dueDate"),
              });
            case "upsert.monitoring-indicator":
              return service.upsertMonitoringIndicator({
                principal: ctx.principal,
                traceId: ctx.traceId,
                indicatorCode: stringField(p, "indicatorCode"),
                title: stringField(p, "title"),
                metric: stringField(p, "metric"),
                target: optionalString(p, "target"),
                baseline: optionalString(p, "baseline"),
                current: optionalString(p, "current"),
                unit: optionalString(p, "unit"),
                period: optionalString(p, "period"),
                status: optionalString(p, "status") ?? "TRACKING",
                source: optionalString(p, "source"),
                tenantId: optionalString(p, "tenantId"),
                countryCode: optionalString(p, "countryCode"),
              });
            case "transition.readiness":
              return service.transitionCertificationReadiness({
                principal: ctx.principal,
                traceId: ctx.traceId,
                frameworkId: stringField(p, "frameworkId"),
                targetScope: stringField(p, "targetScope"),
                to: stringField(p, "to") as CertificationState,
                externalEvidenceId: optionalString(p, "externalEvidenceId"),
                notes: optionalString(p, "notes"),
              });
            case "generate.assessor-package":
              return service.generateAssessorPackage({
                principal: ctx.principal,
                traceId: ctx.traceId,
                frameworkId: stringField(p, "frameworkId"),
                scope: stringField(p, "scope"),
                tenantId: optionalString(p, "tenantId"),
                certificationReadinessId: optionalString(p, "certificationReadinessId"),
              });
          }
        });
        return apiOk(result, ctx.traceId);
      } catch (err) {
        if (err instanceof ComplianceAccessError) {
          return apiError("FORBIDDEN", err.message, 403, ctx.traceId);
        }
        if (err instanceof EvidenceIntegrityError) {
          return apiError("EVIDENCE_INTEGRITY_FAILED", err.message, 409, ctx.traceId);
        }
        if (err instanceof ComplianceStateError) {
          return apiError("COMPLIANCE_STATE_REJECTED", err.message, 409, ctx.traceId);
        }
        if (err instanceof Error && err.message.includes("Missing or invalid field")) {
          return apiError("VALIDATION_FAILED", err.message, 422, ctx.traceId);
        }
        console.error(JSON.stringify({ level: "error", traceId: ctx.traceId, action: body.action, message: String(err) }));
        return apiError("INTERNAL_ERROR", "The compliance action could not be completed.", 500, ctx.traceId);
      }
    },
  );
}
