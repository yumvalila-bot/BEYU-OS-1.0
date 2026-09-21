import { z } from "zod";
export const ActivationProposalSchema = z.object({
 nominationIds: z.array(z.string().min(1).max(100)).min(1).max(100).refine((ids) => new Set(ids).size === ids.length, "Duplicate nomination IDs are not allowed"),
 rationale: z.string().trim().min(20).max(5000),
}).strict();
const common = { expectedRevision: z.number().int().positive(), note: z.string().trim().min(10).max(2000) };
export const ActivationCommandSchema = z.discriminatedUnion("command", [
 z.object({ ...common, command: z.literal("SUBMIT") }).strict(),
 z.object({ ...common, command: z.literal("APPROVE"), resolutionId: z.string().min(1).max(100) }).strict(),
 z.object({ ...common, command: z.literal("ACTIVATE") }).strict(),
]);
export const ACTIVATION_EVENTS = { PROPOSE: "GOVERNANCE_BODY_ACTIVATION_PROPOSED", SUBMIT: "GOVERNANCE_BODY_ACTIVATION_SUBMITTED", APPROVE: "GOVERNANCE_BODY_ACTIVATION_APPROVED", ACTIVATE: "GOVERNANCE_BODY_ACTIVATED" } as const;
