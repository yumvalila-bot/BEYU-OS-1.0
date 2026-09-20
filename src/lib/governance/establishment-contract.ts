import { z } from "zod";
import { CharterRulesSchema } from "./charter-contract";
export const EstablishmentProposalSchema = z.object({
 code: z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/), name: z.string().trim().min(3).max(200),
 purpose: z.string().trim().min(20).max(5000), documentId: z.string().min(1).max(100), rules: CharterRulesSchema,
}).strict();
const common = { expectedRevision: z.number().int().positive(), note: z.string().trim().min(10).max(2000) };
export const EstablishmentCommandSchema = z.discriminatedUnion("command", [
 z.object({ ...common, command: z.literal("SUBMIT") }).strict(),
 z.object({ ...common, command: z.literal("APPROVE"), resolutionId: z.string().min(1).max(100) }).strict(),
 z.object({ ...common, command: z.literal("ESTABLISH") }).strict(),
]);
export const ESTABLISHMENT_EVENTS = { PROPOSE: "GOVERNANCE_BODY_PROPOSED", SUBMIT: "GOVERNANCE_BODY_SUBMITTED", APPROVE: "GOVERNANCE_BODY_APPROVED", ESTABLISH: "GOVERNANCE_BODY_ESTABLISHED" } as const;
