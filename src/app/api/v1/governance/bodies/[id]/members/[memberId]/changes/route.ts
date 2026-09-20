import { apiError,guarded,withIdempotency } from "@/lib/api";
import { GovernanceError,GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { MembershipProposalSchema } from "@/lib/governance/membership-contract";
import { authorizeMembershipRequest,proposeMembershipChange } from "@/lib/governance/membership-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
export const dynamic="force-dynamic";
export async function POST(request:Request,params:{params:Promise<{id:string;memberId:string}>}){
 const {id,memberId}=await params.params;
 return guarded(request,{permission:"governance:resolution.read",action:"governance.membership.propose",databaseContext:"handler",rateLimit:{limit:20,windowMs:60000}},async ctx=>{
  let raw:unknown;try{raw=await request.json();}catch{return apiError("VALIDATION_ERROR","Valid JSON required.",422,ctx.traceId);}
  const input=MembershipProposalSchema.parse(raw);
  try{
   await withTenantDatabaseContext(ctx.principal,()=>authorizeMembershipRequest(ctx.principal,id,memberId,input));
   return await withIdempotency(ctx,`governance.bodies.${id}.members.${memberId}.changes`,input,async()=>{
    try{return{status:201,body:await proposeMembershipChange(ctx.principal,id,memberId,input,{traceId:ctx.traceId})};}
    catch(e){if(e instanceof GovernanceError)return apiError(e.code,e.message,GOVERNANCE_ERROR_STATUS[e.code],ctx.traceId);throw e;}
   });
  }catch(e){if(e instanceof GovernanceError)return apiError(e.code,e.message,GOVERNANCE_ERROR_STATUS[e.code],ctx.traceId);throw e;}
 });
}
