import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { governanceBodies, governanceBodyEstablishments, governanceBodyChanges, governanceMembers, notifications, users, resolutionVotes } from "@/db/schema";
import type { Principal } from "../authz";
import { classificationRank, type Classification } from "../constants";
import { GovernanceError } from "../governance";
import { withTenantDatabaseContext } from "../tenant-scope";
import { withAuditTransaction } from "../audit";
import { newId } from "../ids";
import { authorizeResolutionFollowUp, withResolutionAuthorityLock, type MutationContext } from "../governance-vote-service";
import { readGoverningBody, readBodyDocument } from "./body-authority";
import { authorizeEstablishmentSuperior } from "./establishment-service";
import { currentCharterComposition } from "./charter-rules";
import { BodyChangeProposalSchema, BodyChangeApplySchema, bodyChangeTarget, BODY_CHANGE_EVENTS } from "./body-lifecycle-contract";
type Change=typeof governanceBodyChanges.$inferSelect;
const fail=(s:string)=>new GovernanceError("RULE_VIOLATION",s);
const serial=(v:unknown):Record<string,unknown>=>JSON.parse(JSON.stringify(v));
async function scoped<T>(p:Principal,fn:()=>Promise<T>){return withTenantDatabaseContext(p,async()=>{await db.execute(sql`select set_config('beyu.body_change_actor',${p.userId},true)`);return fn();});}
async function parties(bodyId:string){return [...new Set((await db.select({id:governanceMembers.partyId}).from(governanceMembers).where(eq(governanceMembers.bodyId,bodyId))).map(m=>m.id))].sort();}
export async function listBodyChanges(p:Principal,bodyId:string){
 const body=await readGoverningBody(p,bodyId);
 const changes=(await db.select().from(governanceBodyChanges).where(eq(governanceBodyChanges.bodyId,bodyId))).filter(c=>classificationRank(c.classification)<=classificationRank(p.clearance));
 return {body,changes,revision:changes.filter(c=>c.status==="APPLIED").length,archived:changes.some(c=>c.status==="APPLIED"&&c.command==="ARCHIVE")};
}
/** The recorded superior remains responsible after suspension/dissolution. No
 * fallback to caller authority, child self-approval, or invented root superior. */
export async function authorizeBodyChange(p:Principal,bodyId:string,classification:Classification,command:string){
 const body=await readGoverningBody(p,bodyId);
 const [e]=await db.select().from(governanceBodyEstablishments).where(and(eq(governanceBodyEstablishments.bodyId,bodyId),eq(governanceBodyEstablishments.status,"ESTABLISHED")));
 if(!e||body.bodyType!=="COMMITTEE")throw new GovernanceError("FORBIDDEN","Recorded superior establishment authority is required.");
 const authority=await authorizeEstablishmentSuperior(p,e.parentBodyId,classification,command,"body-lifecycle");
 if(authority.body.tenantId!==body.tenantId||authority.body.legalEntityId!==body.legalEntityId)throw fail("Superior body authority is outside the body's entity/country.");
 // Conservative independence: a recorded child member cannot act as its superior.
 if((await parties(bodyId)).includes(p.partyId))throw new GovernanceError("FORBIDDEN","Recorded child members cannot independently govern their own body's cessation or resumption.");
 return authority;
}
export async function canManageBodyChanges(p:Principal,bodyId:string){try{await authorizeBodyChange(p,bodyId,p.clearance,"PROPOSE");return true;}catch(e){if(e instanceof GovernanceError)return false;throw e;}}
async function assertWindDown(p:Principal,bodyId:string,command:string,operation:string){
 if(!["DISSOLVE","ARCHIVE"].includes(command))return;
 await authorizeBodyChange(p,bodyId,"HIGHLY_RESTRICTED",operation);
 const result=await db.execute(sql`select
 exists(select 1 from resolutions r where r.body_id=${bodyId} and r.status not in ('APPROVED','REJECTED','WITHDRAWN'))
 or exists(select 1 from tasks t join resolutions r on r.id=t.source_resolution_id where r.body_id=${bodyId} and t.status<>'CLOSED')
 or exists(select 1 from governance_appointments a where a.body_id=${bodyId} and a.status not in ('ACTIVE','DECLINED'))
 or exists(select 1 from foundation_meetings m where m.governance_body_id=${bodyId} and m.status not in ('COMPLETED','CANCELLED')) as blocked`);
 if(result.rows[0]?.blocked!==false)throw fail("Outstanding decisions, actions, appointments or meetings must be resolved before body wind-down.");
}
async function transition(p:Principal,body:Awaited<ReturnType<typeof readGoverningBody>>,perform:()=>Promise<Change>,ctx:MutationContext,cause:string|null,policyVersion:string|null,note?:string){
 return withAuditTransaction(async tx=>{
  const row=await perform();
  if(row.status==="APPLIED"){
   await tx.execute(sql`select set_config('beyu.body_change_id',${row.id},true)`);
   const next=bodyChangeTarget(row.command,row.fromStatus);if(!next)throw fail("Invalid body lifecycle projection.");
   const projected=await tx.update(governanceBodies).set({status:next}).where(and(eq(governanceBodies.id,body.id),sql`${governanceBodies.status}::text=${row.fromStatus}`)).returning();
   if(!projected.length)throw new GovernanceError("CONFLICT","Body state changed concurrently.");
   if(row.command==="RESUME"){
    const c=await currentCharterComposition(projected[0]);
    if(!c.charter||!c.satisfied)throw fail("Resumption requires satisfied adopted charter composition; it cannot revive expired or ended memberships.");
   }
   for(const party of await parties(body.id)){
    const recipients=await tx.select().from(users).where(eq(users.partyId,party));
    for(const u of recipients)await tx.insert(notifications).values({id:newId("NTF"),tenantId:body.tenantId,userId:u.id,channel:"IN_APP",status:"QUEUED",subject:"Governing body lifecycle updated",body:"Review the authoritative body state and retained history. This notice grants no authority.",linkHref:`/os/governance#body-lifecycle-${body.id}`});
   }
  }
  return row;
 },row=>({tenantId:body.tenantId,actorUserId:p.userId,actorType:"HUMAN",action:`governance.body-lifecycle.${row.status==="APPLIED"?row.command.toLowerCase():"propose"}`,objectType:"GOVERNANCE_BODY_CHANGE",objectId:row.id,outcome:"SUCCESS",reason:note??row.rationale,oldValue:serial(body),newValue:serial({change:row,body:{...body,status:row.status==="APPLIED"?row.toStatus:body.status}}),traceId:ctx.traceId}),
 row=>({type:BODY_CHANGE_EVENTS[row.status==="APPLIED"?row.command as keyof typeof BODY_CHANGE_EVENTS:"PROPOSE"],source:"beyu-os/governance",domain:"GOVERNANCE",operation:row.command,tenantId:body.tenantId,legalEntityId:body.legalEntityId,subjectType:"GOVERNANCE_BODY_CHANGE",subjectId:row.id,actorUserId:p.userId,actorType:"HUMAN",classification:row.classification,payload:serial(row),traceId:ctx.traceId,correlationId:ctx.traceId,causationId:cause,destinationDomain:null,policyVersion,authorityContext:{authorityId:row.authorityBodyId,decisionId:row.resolutionId,capabilityCode:null,permissionCode:"governance:resolution.approve",policyVersion}}));
}
export async function proposeBodyChange(p:Principal,bodyId:string,raw:unknown,ctx:MutationContext){
 const input=BodyChangeProposalSchema.parse(raw);
 return scoped(p,async()=>{
  await db.select().from(governanceBodies).where(eq(governanceBodies.id,bodyId)).for("update");
  const {body,revision,archived,changes}=await listBodyChanges(p,bodyId);
  if(archived||(input.command==="ARCHIVE"&&!changes.some(c=>c.status==="APPLIED"&&c.command==="DISSOLVE")))throw fail("Archival is terminal and requires recorded dissolution evidence.");
  if(revision!==input.expectedRevision)throw new GovernanceError("CONFLICT","Stale body lifecycle revision.");
  const toStatus=bodyChangeTarget(input.command,body.status);if(!toStatus)throw fail("Invalid body lifecycle transition.");
  const doc=await readBodyDocument(p,body,input.documentId),authority=await authorizeBodyChange(p,bodyId,doc.classification,"PROPOSE");
  await assertWindDown(p,bodyId,input.command,"PROPOSE");
  return transition(p,body,async()=>{const [row]=await db.insert(governanceBodyChanges).values({id:newId("GBC"),bodyId,authorityBodyId:authority.body.id,command:input.command,fromStatus:body.status,toStatus,bodyRevision:revision,affectedPartyIds:await parties(bodyId),documentId:doc.id,documentVersion:doc.version,documentChecksum:doc.checksum,classification:doc.classification,rationale:input.rationale,proposedByUserId:p.userId,proposedByPartyId:p.partyId}).returning();return row;},ctx,null,authority.policy.appliedPolicies.map(v=>`${v.code}@${v.version}`).join(",")||null);
 });
}
/** Also used before idempotency receipt recovery: current authority/independence
 * is checked without requiring a completed request to be pending again. */
export async function authorizeBodyChangeApplication(p:Principal,bodyId:string,id:string){
 const {body,changes}=await listBodyChanges(p,bodyId),row=changes.find(c=>c.id===id);
 if(!row)throw new GovernanceError("NOT_FOUND","Body change is not visible.");
 const authority=await authorizeBodyChange(p,bodyId,row.classification,"APPLY");
 if(["DISSOLVE","ARCHIVE"].includes(row.command))await authorizeBodyChange(p,bodyId,"HIGHLY_RESTRICTED","APPLY");
 if(authority.body.id!==row.authorityBodyId)throw fail("Recorded superior changed.");
 if(p.userId===row.proposedByUserId||p.partyId===row.proposedByPartyId||row.affectedPartyIds.includes(p.partyId))throw new GovernanceError("FORBIDDEN","Independent superior action cannot be the proposer or an affected member.");
 return {body,row,authority};
}
export async function applyBodyChange(p:Principal,bodyId:string,id:string,raw:unknown,ctx:MutationContext){
 const input=BodyChangeApplySchema.parse(raw);
 return scoped(p,()=>withResolutionAuthorityLock(p,input.resolutionId,async()=>{
  await db.select().from(governanceBodies).where(eq(governanceBodies.id,bodyId)).for("update");
  const {body,row,authority}=await authorizeBodyChangeApplication(p,bodyId,id);
  const {revision,archived}=await listBodyChanges(p,bodyId);
  if(archived)throw fail("Archival is terminal.");
  if(row.status!=="PROPOSED"||row.bodyRevision!==revision||row.fromStatus!==body.status)throw new GovernanceError("CONFLICT","Applied or stale body lifecycle evidence.");
  if(bodyChangeTarget(row.command,body.status)!==row.toStatus)throw fail("Body transition is no longer valid.");
  const doc=await readBodyDocument(p,body,row.documentId);
  if(doc.version!==row.documentVersion||doc.checksum!==row.documentChecksum||doc.classification!==row.classification)throw fail("Frozen body instrument changed; propose a new request.");
  const decision=await authorizeResolutionFollowUp(p,input.resolutionId,true),r=decision.resolution;
  if(decision.body.id!==row.authorityBodyId||r.category!=="RESERVED_MATTER"||r.linkedObjectType!=="GOVERNANCE_BODY_CHANGE"||r.linkedObjectId!==row.id||classificationRank(r.classification)<classificationRank(row.classification))throw fail("Exact superior reserved-matter approval of this body change is required.");
  const affected=new Set([...row.affectedPartyIds,...await parties(bodyId)]);
  const votes=await db.select({party:governanceMembers.partyId,vote:resolutionVotes.vote}).from(resolutionVotes).innerJoin(governanceMembers,eq(governanceMembers.id,resolutionVotes.memberId)).where(eq(resolutionVotes.resolutionId,r.id));
  if(votes.some(v=>affected.has(v.party)&&v.vote!=="RECUSED"))throw fail("Affected child members must not substantively participate in their superior body's decision.");
  await assertWindDown(p,bodyId,row.command,"APPLY");
  return transition(p,body,async()=>{const [applied]=await db.update(governanceBodyChanges).set({status:"APPLIED",resolutionId:r.id,appliedByUserId:p.userId,appliedAt:new Date()}).where(and(eq(governanceBodyChanges.id,row.id),eq(governanceBodyChanges.status,"PROPOSED"))).returning();if(!applied)throw new GovernanceError("CONFLICT","Concurrent body change.");return applied;},ctx,decision.decisionEvent.id,authority.policy.appliedPolicies.map(v=>`${v.code}@${v.version}`).join(",")||null,input.note);
 }));
}
