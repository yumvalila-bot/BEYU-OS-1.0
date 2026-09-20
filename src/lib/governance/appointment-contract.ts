import { z } from "zod";
import { SEAT_ROLES } from "./charter-contract";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => { const d = new Date(v); return !isNaN(d.valueOf()) && d.toISOString().slice(0,10) === v; }, "A real calendar date is required");
export const NominateMemberSchema = z.object({
 nomineeUserId: z.string().min(1).max(100), documentId: z.string().min(1).max(100),
 seatRole: z.enum(SEAT_ROLES), votingRights: z.boolean(), appointedOn: date, retiredOn: date,
 rationale: z.string().trim().min(20).max(5000),
}).strict().superRefine((v, ctx) => {
 if (v.retiredOn < v.appointedOn) ctx.addIssue({ code: "custom", message: "Term end precedes its start." });
 if (v.seatRole === "OBSERVER" && v.votingRights) ctx.addIssue({ code: "custom", message: "Observers cannot vote." });
});
const base = { expectedRevision: z.number().int().positive(), note: z.string().trim().min(10).max(2000) };
export const AppointmentCommandSchema = z.discriminatedUnion("command", [
 z.object({ ...base, command: z.literal("APPROVE"), resolutionId: z.string().min(1).max(100) }).strict(),
 z.object({ ...base, command: z.literal("ACCEPT") }).strict(),
 z.object({ ...base, command: z.literal("DECLINE") }).strict(),
 z.object({ ...base, command: z.literal("ACTIVATE") }).strict(),
]);
export const APPOINTMENT_EVENTS = { NOMINATE: "GOVERNANCE_MEMBER_NOMINATED", APPROVE: "GOVERNANCE_APPOINTMENT_APPROVED", ACCEPT: "GOVERNANCE_APPOINTMENT_ACCEPTED", DECLINE: "GOVERNANCE_APPOINTMENT_DECLINED", ACTIVATE: "GOVERNANCE_MEMBERSHIP_ACTIVATED" } as const;
