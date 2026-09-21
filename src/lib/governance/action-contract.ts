import { z } from "zod";

export const ACTION_EVENT_TYPES: Readonly<Record<string, string>> = {
  CREATE: "GOVERNANCE_ACTION_CREATED", ASSIGN: "GOVERNANCE_ACTION_ASSIGNED", START: "GOVERNANCE_ACTION_STARTED",
  BLOCK: "GOVERNANCE_ACTION_BLOCKED", RESUME: "GOVERNANCE_ACTION_RESUMED", SUBMIT_EVIDENCE: "GOVERNANCE_ACTION_EVIDENCE_SUBMITTED",
  COMPLETE: "GOVERNANCE_ACTION_COMPLETED", RETURN: "GOVERNANCE_ACTION_RETURNED", VERIFY: "GOVERNANCE_ACTION_VERIFIED", CLOSE: "GOVERNANCE_ACTION_CLOSED",
};

export const ACTION_STATES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "VERIFIED", "CLOSED"] as const;
export type ActionState = typeof ACTION_STATES[number];
export const ACTION_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  OPEN: ["ASSIGNED"], ASSIGNED: ["IN_PROGRESS"], IN_PROGRESS: ["BLOCKED", "COMPLETED"],
  BLOCKED: ["IN_PROGRESS"], COMPLETED: ["IN_PROGRESS", "VERIFIED"], VERIFIED: ["CLOSED"], CLOSED: [],
};
export function canTransitionAction(from: string, to: string): boolean {
  return ACTION_TRANSITIONS[from]?.includes(to) ?? false;
}
export const CreateActionSchema = z.object({
  title: z.string().trim().min(5).max(200),
  description: z.string().trim().min(10).max(5000),
  priority: z.enum(["NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  dueAt: z.string().datetime(),
  dependsOnTaskId: z.string().min(1).max(100).optional(),
}).strict();
const revision = z.number().int().positive();
const note = z.string().trim().min(10).max(2000);
export const ActionCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("ASSIGN"), expectedVersion: revision, assigneeUserId: z.string().min(1).max(100), note }).strict(),
  z.object({ command: z.literal("START"), expectedVersion: revision, note }).strict(),
  z.object({ command: z.literal("BLOCK"), expectedVersion: revision, note }).strict(),
  z.object({ command: z.literal("RESUME"), expectedVersion: revision, note }).strict(),
  z.object({ command: z.literal("SUBMIT_EVIDENCE"), expectedVersion: revision, documentId: z.string().min(1).max(100), note }).strict(),
  z.object({ command: z.literal("COMPLETE"), expectedVersion: revision, note }).strict(),
  z.object({ command: z.literal("RETURN"), expectedVersion: revision, note }).strict(),
  z.object({ command: z.literal("VERIFY"), expectedVersion: revision, note }).strict(),
  z.object({ command: z.literal("CLOSE"), expectedVersion: revision, note }).strict(),
]);
export type CreateActionInput = z.infer<typeof CreateActionSchema>;
export type ActionCommand = z.infer<typeof ActionCommandSchema>;
