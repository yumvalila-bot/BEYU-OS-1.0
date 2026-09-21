import { apiError,guarded,withIdempotency } from "@/lib/api";
import { GovernanceError,GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { BodyChangeProposalSchema } from "@/lib/governance/body-lifecycle-contract";
import { authorizeBodyChange,proposeBodyChange } from "@/lib/governance/body-lifecycle-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
export const dynamic="force-dynamic";
export async function POST(request:Request,params:{params:Promise<{id:string}>}){
 const {id}=await params.params;
 return guarded(request,{permission:"governance:resolution.approve",action:"governance.body-lifecycle.propose",databaseContext:"handler",rateLimit:{limit:20,windowMs:60000}},async ctx=>{
  let raw:unknown;try{raw=await request.json();}catch{return apiError("VALIDATION_ERROR","Valid JSON required.",422,ctx.traceId);}
  const input=BodyChangeProposalSchema.parse(raw);
  try{
   await withTenantDatabaseContext(ctx.principal,()=>authorizeBodyChange(ctx.principal,id,ctx.principal.clearance,"PROPOSE"));
   return await withIdempotency(ctx,`governance.bodies.${id}.lifecycle-changes`,input,async()=>{
    try{return{status:201,body:await proposeBodyChange(ctx.principal,id,input,{traceId:ctx.traceId})};}
    catch(e){if(e instanceof GovernanceError)return apiError(e.code,e.message,GOVERNANCE_ERROR_STATUS[e.code],ctx.traceId);throw e;}
   });
  }catch(e){if(e instanceof GovernanceError)return apiError(e.code,e.message,GOVERNANCE_ERROR_STATUS[e.code],ctx.traceId);throw e;}
 });
}
