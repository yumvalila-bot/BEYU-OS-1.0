import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { UjenziDomainError } from "./errors";

/** Evidence URI is recorded. Government/board VERIFIED is never inferred. */
export async function attachProfessionalEvidence(input: {
  tenantId: string;
  professionalId: string;
  evidenceUri: string;
  actorUserId: string;
}) {
  if (!input.evidenceUri.trim()) throw new UjenziDomainError("DATA_REQUIRED", "Evidence URI required");
  const [pro] = await db
    .select()
    .from(s.ujenziProfessionals)
    .where(and(eq(s.ujenziProfessionals.id, input.professionalId), eq(s.ujenziProfessionals.tenantId, input.tenantId)));
  if (!pro) throw new UjenziDomainError("NOT_FOUND", "Professional not found");
  await db
    .update(s.ujenziProfessionals)
    .set({
      evidenceUri: input.evidenceUri,
      verifiedByUserId: input.actorUserId,
      verificationStatus: "EVIDENCE_RECORDED",
    })
    .where(eq(s.ujenziProfessionals.id, input.professionalId));
  return { verificationStatus: "EVIDENCE_RECORDED" as const, government: "NOT_CONNECTED" as const };
}

/** Certification is LEVEL 5 — never autonomous. VERIFIED professionals do not exist without human evidence. */
export async function certifyCalculation(input: {
  tenantId: string;
  calculationId: string;
  professionalId: string;
  actorUserId: string;
}) {
  const [calc] = await db
    .select()
    .from(s.ujenziEngineeringCalculations)
    .where(and(eq(s.ujenziEngineeringCalculations.id, input.calculationId), eq(s.ujenziEngineeringCalculations.tenantId, input.tenantId)));
  if (!calc) throw new UjenziDomainError("NOT_FOUND", "Calculation not found");
  const [pro] = await db
    .select()
    .from(s.ujenziProfessionals)
    .where(and(eq(s.ujenziProfessionals.id, input.professionalId), eq(s.ujenziProfessionals.tenantId, input.tenantId)));
  if (!pro) throw new UjenziDomainError("NOT_FOUND", "Professional not found");
  if (pro.verificationStatus !== "VERIFIED") {
    throw new UjenziDomainError(
      "INVALID_STATE",
      "Professional registration is not VERIFIED; calculation remains NOT_CERTIFIED",
    );
  }
  await db
    .update(s.ujenziEngineeringCalculations)
    .set({ professionalCertification: "CERTIFIED", approvalState: "CERTIFIED", reviewerUserId: input.actorUserId })
    .where(eq(s.ujenziEngineeringCalculations.id, input.calculationId));
  return { professionalCertification: "CERTIFIED" as const };
}
