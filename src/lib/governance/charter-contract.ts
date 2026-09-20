import { z } from "zod";
export const SEAT_ROLES = ["CHAIR", "VICE_CHAIR", "SECRETARY", "TREASURER", "MEMBER", "INDEPENDENT_MEMBER", "COMMITTEE_MEMBER", "OBSERVER"] as const;
export const CharterRulesSchema = z.object({
  quorumMinimum: z.number().int().positive().max(1000),
  majorityRule: z.enum(["SIMPLE", "TWO_THIRDS", "UNANIMOUS"]),
  minimumVotingMembers: z.number().int().positive().max(1000),
  maximumVotingMembers: z.number().int().positive().max(1000),
  requiredSeats: z.array(z.object({ role: z.enum(SEAT_ROLES), minimum: z.number().int().min(0).max(1000), maximum: z.number().int().min(0).max(1000) }).strict()).min(1).max(8),
}).strict().superRefine((r, ctx) => {
  if (r.minimumVotingMembers > r.maximumVotingMembers || r.quorumMinimum > r.maximumVotingMembers)
    ctx.addIssue({ code: "custom", message: "Voting bounds must be coherent and able to meet quorum." });
  if (new Set(r.requiredSeats.map((s) => s.role)).size !== r.requiredSeats.length || r.requiredSeats.some((s) => s.minimum > s.maximum))
    ctx.addIssue({ code: "custom", message: "Seat rules must be unique with coherent bounds." });
});
export type CharterRules = z.infer<typeof CharterRulesSchema>;
export const CreateCharterSchema = z.object({ documentId: z.string().min(1).max(100), purpose: z.string().trim().min(20).max(5000), rules: CharterRulesSchema }).strict();
export const CharterCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("SUBMIT"), expectedRevision: z.number().int().positive(), note: z.string().trim().min(10).max(2000) }).strict(),
  z.object({ command: z.literal("ADOPT"), expectedRevision: z.number().int().positive(), resolutionId: z.string().min(1).max(100), note: z.string().trim().min(10).max(2000) }).strict(),
]);
