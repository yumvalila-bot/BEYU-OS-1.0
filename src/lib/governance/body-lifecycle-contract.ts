import { z } from "zod";
export const BodyChangeProposalSchema = z.object({
 command: z.enum(["SUSPEND", "RESUME", "DISSOLVE", "ARCHIVE"]),
 expectedRevision: z.number().int().nonnegative(), documentId: z.string().min(1).max(100),
 rationale: z.string().trim().min(20).max(5000),
}).strict();
export const BodyChangeApplySchema = z.object({resolutionId:z.string().min(1).max(100),note:z.string().trim().min(10).max(2000)}).strict();
export function bodyChangeTarget(command:string,from:string):"ACTIVE"|"SUSPENDED"|"RETIRED"|null {
 if(command==="SUSPEND"&&from==="ACTIVE")return "SUSPENDED";
 if(command==="RESUME"&&from==="SUSPENDED")return "ACTIVE";
 if(command==="DISSOLVE"&&["ACTIVE","SUSPENDED"].includes(from))return "RETIRED";
 if(command==="ARCHIVE"&&from==="RETIRED")return "RETIRED";
 return null;
}
export const BODY_CHANGE_EVENTS={PROPOSE:"GOVERNANCE_BODY_CHANGE_PROPOSED",SUSPEND:"GOVERNANCE_BODY_SUSPENDED",RESUME:"GOVERNANCE_BODY_RESUMED",DISSOLVE:"GOVERNANCE_BODY_DISSOLVED",ARCHIVE:"GOVERNANCE_BODY_ARCHIVED"} as const;
