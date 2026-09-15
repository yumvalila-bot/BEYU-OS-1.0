import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { UjenziDomainError } from "./errors";

function id() {
  return newId(ID_PREFIX.ujenzi);
}

export async function recordCommissioningTest(input: {
  tenantId: string;
  projectId: string;
  code: string;
  systemName: string;
  result?: "PENDING" | "PASSED" | "FAILED";
}) {
  const [p] = await db
    .select({ id: s.ujenziProjects.id })
    .from(s.ujenziProjects)
    .where(and(eq(s.ujenziProjects.id, input.projectId), eq(s.ujenziProjects.tenantId, input.tenantId)));
  if (!p) throw new UjenziDomainError("NOT_FOUND", "Project not found");
  const rowId = id();
  await db.insert(s.ujenziCommissioningTests).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    systemName: input.systemName,
    result: input.result ?? "PENDING",
    workflowState: "PREPARED",
    professionalCertification: "NOT_CERTIFIED",
  });
  return { id: rowId, workflowState: "PREPARED" as const, professionalCertification: "NOT_CERTIFIED" as const };
}

export async function advanceCommissioning(input: {
  tenantId: string;
  testId: string;
  to: "TESTING" | "PASSED" | "FAILED" | "REVIEWED" | "APPROVED" | "HANDED_OVER";
}) {
  const [row] = await db
    .select()
    .from(s.ujenziCommissioningTests)
    .where(and(eq(s.ujenziCommissioningTests.id, input.testId), eq(s.ujenziCommissioningTests.tenantId, input.tenantId)));
  if (!row) throw new UjenziDomainError("NOT_FOUND", "Commissioning test not found");
  if (input.to === "HANDED_OVER" && row.professionalCertification !== "CERTIFIED") {
    throw new UjenziDomainError("INVALID_STATE", "Handover requires human professional certification");
  }
  await db
    .update(s.ujenziCommissioningTests)
    .set({
      workflowState: input.to,
      result: input.to === "PASSED" || input.to === "FAILED" ? input.to : row.result,
    })
    .where(eq(s.ujenziCommissioningTests.id, input.testId));
  return { id: input.testId, workflowState: input.to, professionalCertification: row.professionalCertification };
}
