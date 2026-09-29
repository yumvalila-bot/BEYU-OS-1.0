/**
 * Journey Automation — governed communication journeys using existing workflow engine.
 *
 * Supports journeys like:
 * NEW CUSTOMER → Welcome → Product info → Order → Invoice → Feedback → Follow-up
 * ORDER: CREATED → Confirmation → PROCESSING → READY → COMPLETED → Receipt → Feedback
 *
 * Do not create another workflow engine. Use existing workflow infrastructure
 * plus this journey registry for communication-specific orchestration.
 */

import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { communicationJourneys, communicationJourneyRuns } from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { recordAudit, publishEvent } from "@/lib/audit";
import { orchestrateCommunication } from "./orchestrator";
import type { CommunicationIntent } from "./types";

export type JourneyRecord = typeof communicationJourneys.$inferSelect;
export type JourneyRunRecord = typeof communicationJourneyRuns.$inferSelect;

export type JourneyStep = {
  step: number;
  name: string;
  channel?: string;
  templateCode?: string;
  delayMinutes?: number;
  condition?: Record<string, unknown>;
  action?: string;
  metadata?: Record<string, unknown>;
};

export async function createJourney(input: {
  tenantId?: string | null;
  code: string;
  name: string;
  description?: string;
  triggerEventType: string;
  triggerConditions?: Record<string, unknown>;
  steps: JourneyStep[];
  classification?: string;
  createdBy: string;
}): Promise<JourneyRecord> {
  const id = newId(ID_PREFIX.commJourney);
  const [row] = await db
    .insert(communicationJourneys)
    .values({
      id,
      tenantId: input.tenantId,
      code: input.code,
      name: input.name,
      description: input.description,
      triggerEventType: input.triggerEventType,
      triggerConditions: input.triggerConditions ?? {},
      steps: input.steps as never,
      status: "DRAFT",
      classification: (input.classification as never) ?? "INTERNAL",
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

export async function activateJourney(id: string, activatedBy: string): Promise<JourneyRecord | null> {
  const [row] = await db
    .update(communicationJourneys)
    .set({ status: "ACTIVE", updatedAt: new Date() })
    .where(eq(communicationJourneys.id, id))
    .returning();
  return row ?? null;
}

export async function listJourneys(tenantId?: string): Promise<JourneyRecord[]> {
  if (tenantId) {
    const { or, isNull } = await import("drizzle-orm");
    return db
      .select()
      .from(communicationJourneys)
      .where(or(eq(communicationJourneys.tenantId, tenantId), isNull(communicationJourneys.tenantId)))
      .orderBy(desc(communicationJourneys.createdAt));
  }
  return db.select().from(communicationJourneys).orderBy(desc(communicationJourneys.createdAt));
}

export async function startJourneyRun(input: {
  journeyId: string;
  tenantId: string;
  contactId: string;
  conversationId?: string | null;
  correlationId: string;
  causationId?: string | null;
  context?: Record<string, unknown>;
}): Promise<JourneyRunRecord> {
  const id = newId(ID_PREFIX.commJourneyRun);
  const [row] = await db
    .insert(communicationJourneyRuns)
    .values({
      id,
      journeyId: input.journeyId,
      tenantId: input.tenantId,
      contactId: input.contactId,
      conversationId: input.conversationId,
      status: "RUNNING",
      currentStep: 0,
      context: input.context ?? {},
      correlationId: input.correlationId,
      causationId: input.causationId,
    })
    .returning();

  await recordAudit({
    tenantId: input.tenantId,
    action: "communications.journey.started",
    objectType: "JOURNEY_RUN",
    objectId: id,
    outcome: "SUCCESS",
    newValue: { journeyId: input.journeyId, contactId: input.contactId, correlationId: input.correlationId },
  });

  return row;
}

export async function advanceJourneyRun(
  runId: string,
  tenantId: string,
  principal: { userId: string; tenantId: string; clearance: string },
): Promise<{ run: JourneyRunRecord; completed: boolean } | null> {
  const [run] = await db
    .select()
    .from(communicationJourneyRuns)
    .where(and(eq(communicationJourneyRuns.id, runId), eq(communicationJourneyRuns.tenantId, tenantId)))
    .limit(1);
  if (!run) return null;

  const [journey] = await db.select().from(communicationJourneys).where(eq(communicationJourneys.id, run.journeyId)).limit(1);
  if (!journey) return null;

  const steps = journey.steps as unknown as JourneyStep[];
  if (run.currentStep >= steps.length) {
    // Already completed
    const [completed] = await db
      .update(communicationJourneyRuns)
      .set({ status: "COMPLETED", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(communicationJourneyRuns.id, runId))
      .returning();
    return { run: completed, completed: true };
  }

  const currentStep = steps[run.currentStep];

  // Check condition if present
  if (currentStep.condition && !evaluateCondition(currentStep.condition, run.context as Record<string, unknown>)) {
    // Skip this step
    const [updated] = await db
      .update(communicationJourneyRuns)
      .set({ currentStep: run.currentStep + 1, updatedAt: new Date() })
      .where(eq(communicationJourneyRuns.id, runId))
      .returning();
    return { run: updated, completed: false };
  }

  // Execute step — send communication if template/channel specified
  if (currentStep.templateCode && currentStep.channel) {
    // Resolve recipient from contact
    const { communicationContacts } = await import("@/db/schema");
    const [contact] = await db
      .select()
      .from(communicationContacts)
      .where(eq(communicationContacts.id, run.contactId))
      .limit(1);

    if (contact) {
      const recipient = currentStep.channel === "EMAIL" ? contact.primaryEmail ?? "" : contact.primaryPhone ?? "";
      if (recipient) {
        const intent: CommunicationIntent = {
          tenantId,
          contactId: run.contactId,
          recipient,
          channel: currentStep.channel as never,
          messageType: "JOURNEY",
          priority: "NORMAL",
          classification: "INTERNAL",
          purpose: "TRANSACTIONAL",
          templateCode: currentStep.templateCode,
          templateVariables: {
            ...(run.context as Record<string, unknown>),
            contact_name: contact.displayName,
            organization_name: "BEYU",
          },
          correlationId: run.correlationId,
          causationId: run.id,
          idempotencyKey: `${run.id}:${currentStep.step}`,
          traceId: run.correlationId,
          metadata: { journey_id: journey.id, journey_run_id: run.id, step: currentStep.step, ...currentStep.metadata },
        };

        await orchestrateCommunication(intent, principal);
      }
    }
  }

  // Advance to next step
  const nextStep = run.currentStep + 1;
  const isCompleted = nextStep >= steps.length;

  const [updated] = await db
    .update(communicationJourneyRuns)
    .set({
      currentStep: nextStep,
      status: isCompleted ? "COMPLETED" : "RUNNING",
      completedAt: isCompleted ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(communicationJourneyRuns.id, runId))
    .returning();

  return { run: updated, completed: isCompleted };
}

function evaluateCondition(condition: Record<string, unknown>, context: Record<string, unknown>): boolean {
  // Simple condition evaluation — extend as needed
  // Example: { field: "order_status", equals: "COMPLETED" }
  if (condition.field && condition.equals !== undefined) {
    const field = condition.field as string;
    return context[field] === condition.equals;
  }
  if (condition.field && condition.not_equals !== undefined) {
    const field = condition.field as string;
    return context[field] !== condition.not_equals;
  }
  return true;
}

export async function handleEventTrigger(
  eventType: string,
  tenantId: string,
  contactId: string,
  context: Record<string, unknown>,
  principal: { userId: string; tenantId: string; clearance: string },
): Promise<JourneyRunRecord[]> {
  const journeys = await db
    .select()
    .from(communicationJourneys)
    .where(and(eq(communicationJourneys.triggerEventType, eventType), eq(communicationJourneys.status, "ACTIVE")));

  const runs: JourneyRunRecord[] = [];
  for (const journey of journeys) {
    // Check trigger conditions
    const triggerConditions = journey.triggerConditions as Record<string, unknown>;
    if (Object.keys(triggerConditions).length > 0 && !evaluateCondition(triggerConditions, context)) {
      continue;
    }

    // Tenant check
    if (journey.tenantId && journey.tenantId !== tenantId) continue;

    const run = await startJourneyRun({
      journeyId: journey.id,
      tenantId,
      contactId,
      correlationId: newId(ID_PREFIX.correlationId),
      context,
    });
    runs.push(run);

    // Auto-advance first step
    await advanceJourneyRun(run.id, tenantId, principal);
  }

  return runs;
}
