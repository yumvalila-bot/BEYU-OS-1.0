import { z } from "zod";
export const MembershipProposalSchema=z.object({command:z.enum(["RESIGN","SUSPEND","REMOVE","REINSTATE"]),expectedRevision:z.number().int().nonnegative(),documentId:z.string().min(1).max(100),rationale:z.string().trim().min(20).max(5000)}).strict();
export const MembershipApplySchema=z.object({resolutionId:z.string().min(1).max(100),note:z.string().trim().min(10).max(2000)}).strict();
export const MEMBERSHIP_EVENTS={PROPOSE:"GOVERNANCE_MEMBERSHIP_CHANGE_PROPOSED",RESIGN:"GOVERNANCE_MEMBER_RESIGNED",SUSPEND:"GOVERNANCE_MEMBER_SUSPENDED",REMOVE:"GOVERNANCE_MEMBER_REMOVED",REINSTATE:"GOVERNANCE_MEMBER_REINSTATED"} as const;
export function membershipTarget(command:string,from:string){
 if(command==="REINSTATE"&&from==="SUSPENDED")return "ACTIVE";
 if(command==="SUSPEND"&&from==="ACTIVE")return "SUSPENDED";
 if(command==="RESIGN"&&["ACTIVE","SUSPENDED"].includes(from))return "RESIGNED";
 if(command==="REMOVE"&&["ACTIVE","SUSPENDED"].includes(from))return "REMOVED";
 return null;
}
