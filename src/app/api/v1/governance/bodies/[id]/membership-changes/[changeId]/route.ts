import { apiError,guarded,withIdempotency } from "@/lib/api";
import { GovernanceError,GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { MembershipApplySchema } from "@/lib/governance/membership-contract";
import { listMembershipChanges,authorizeMembershipSuperior,applyMembershipChange } from "@/lib/governance/membership-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
export const dynamic="force-dynamic";
export async function POST(request:Request,params:{params:Promise<{id:string;changeId:string}>}){
 const {id,changeId}=await params.params;
 return guarded(request,{permission:"governance:resolution.approve",action:"governance.membership.apply",databaseContext:"handler",rateLimit:{limit:30,windowMs:60000}},async ctx=>{
  let raw:unknown;try{raw=await request.json();}catch{return apiError("VALIDATION_ERROR","Valid JSON required.",422,ctx.traceId);}
  const input=MembershipApplySchema.parse(raw);
  try{
   await withTenantDatabaseContext(ctx.principal,async()=>{const {changes}=await listMembershipChanges(ctx.principal,id),row=changes.find(c=>c.id===changeId);if(!row)throw new GovernanceError("NOT_FOUND","Membership change is not visible.");await authorizeMembershipSuperior(ctx.principal,id,row.classification,"APPLY");});
   return await withIdempotency(ctx,`governance.bodies.${id}.membership-changes.${changeId}`,input,async()=>{
    try{return{status:200,body:await applyMembershipChange(ctx.principal,id,changeId,input,{traceId:ctx.traceId})};}
    catch(e){if(e instanceof GovernanceError)return apiError(e.code,e.message,GOVERNANCE_ERROR_STATUS[e.code],ctx.traceId);throw e;}
   });
  }catch(e){if(e instanceof GovernanceError)return apiError(e.code,e.message,GOVERNANCE_ERROR_STATUS[e.code],ctx.traceId);throw e;}
 });
}
