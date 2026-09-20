import { apiError,guarded,withIdempotency } from "@/lib/api";
import { GovernanceError,GOVERNANCE_ERROR_STATUS } from "@/lib/governance";
import { BodyChangeApplySchema } from "@/lib/governance/body-lifecycle-contract";
import { authorizeBodyChangeApplication,applyBodyChange } from "@/lib/governance/body-lifecycle-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
export const dynamic="force-dynamic";
export async function POST(request:Request,params:{params:Promise<{id:string;changeId:string}>}){
 const {id,changeId}=await params.params;
 return guarded(request,{permission:"governance:resolution.approve",action:"governance.body-lifecycle.apply",databaseContext:"handler",rateLimit:{limit:30,windowMs:60000}},async ctx=>{
  let raw:unknown;try{raw=await request.json();}catch{return apiError("VALIDATION_ERROR","Valid JSON required.",422,ctx.traceId);}
  const input=BodyChangeApplySchema.parse(raw);
  try{
   await withTenantDatabaseContext(ctx.principal,()=>authorizeBodyChangeApplication(ctx.principal,id,changeId));
   return await withIdempotency(ctx,`governance.bodies.${id}.lifecycle-changes.${changeId}`,input,async()=>{
    try{return{status:200,body:await applyBodyChange(ctx.principal,id,changeId,input,{traceId:ctx.traceId})};}
    catch(e){if(e instanceof GovernanceError)return apiError(e.code,e.message,GOVERNANCE_ERROR_STATUS[e.code],ctx.traceId);throw e;}
   });
  }catch(e){if(e instanceof GovernanceError)return apiError(e.code,e.message,GOVERNANCE_ERROR_STATUS[e.code],ctx.traceId);throw e;}
 });
}
