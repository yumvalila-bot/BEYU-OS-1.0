import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { governanceBodies, governanceBodyEstablishments, governanceMembers, governanceMembershipChanges, users, notifications, legalEntities, resolutionVotes } from "@/db/schema";
import { can, loadGrants, permissionsForRoles, clearanceForRoles, type Principal } from "../authz";
import { classificationRank } from "../constants";
import { GovernanceError } from "../governance";
import { withTenantDatabaseContext } from "../tenant-scope";
import { withAuditTransaction } from "../audit";
import { evaluatePolicy } from "../policy";
import { newId } from "../ids";
import { authorizeResolutionFollowUp, withResolutionAuthorityLock, type MutationContext } from "../governance-vote-service";
import { readBodyDocument, readGoverningBody } from "./body-authority";
import { authorizeEstablishmentSuperior } from "./establishment-service";
import { hasEffectiveConstitution } from "./constitution";
import { currentCharterComposition } from "./charter-rules";
import { MembershipProposalSchema, MembershipApplySchema, membershipTarget, MEMBERSHIP_EVENTS } from "./membership-contract";
type Change=typeof governanceMembershipChanges.$inferSelect;
const serial=(v:unknown):Record<string,unknown>=>JSON.parse(JSON.stringify(v));
const fail=(m:string)=>new GovernanceError("RULE_VIOLATION",m);
async function scoped<T>(p:Principal,fn:()=>Promise<T>){return withTenantDatabaseContext(p,async()=>{await db.execute(sql`select set_config('beyu.membership_actor',${p.userId},true)`);return fn();});}
export async function listMembershipChanges(p:Principal,bodyId:string){
 const body=await readGoverningBody(p,bodyId);
 const changes=await db.select().from(governanceMembershipChanges).where(eq(governanceMembershipChanges.bodyId,bodyId));
 return {body,changes:changes.filter(r=>classificationRank(r.classification)<=classificationRank(p.clearance))};
}
async function target(p:Principal,bodyId:string,memberId:string){
 const body=await readGoverningBody(p,bodyId);
 const [member]=await db.select().from(governanceMembers).where(and(eq(governanceMembers.id,memberId),eq(governanceMembers.bodyId,bodyId)));
 if(!member)throw new GovernanceError("NOT_FOUND","Membership is not visible.");
 return {body,member};
}
export async function authorizeMembershipSuperior(p:Principal,bodyId:string,classification:Change["classification"],command:string){
 const body=await readGoverningBody(p,bodyId);
 const [e]=await db.select().from(governanceBodyEstablishments).where(and(eq(governanceBodyEstablishments.bodyId,bodyId),eq(governanceBodyEstablishments.status,"ESTABLISHED")));
 if(!e||body.status!=="ACTIVE"||body.bodyType!=="COMMITTEE")throw new GovernanceError("FORBIDDEN","A recorded superior is required for involuntary membership changes and reinstatement.");
 const authority=await authorizeEstablishmentSuperior(p,e.parentBodyId,classification,command,"membership");
 if(authority.body.tenantId!==body.tenantId||authority.body.legalEntityId!==body.legalEntityId)throw fail("Superior membership authority is outside the body's entity/country.");
 return authority;
}
export async function canManageMembership(p:Principal,bodyId:string){try{await authorizeMembershipSuperior(p,bodyId,p.clearance,"PROPOSE");return true;}catch(e){if(e instanceof GovernanceError)return false;throw e;}}
async function resignAuthority(p:Principal,body:Awaited<ReturnType<typeof readGoverningBody>>,member:typeof governanceMembers.$inferSelect,classification:Change["classification"]){
 const [actor]=await db.select().from(users).where(eq(users.id,p.userId)).for("share");
 const [entity]=await db.select().from(legalEntities).where(eq(legalEntities.id,body.legalEntityId!));
 const grants=(await loadGrants(p.userId,p.tenantId)).filter(g=>!g.entityId||g.entityId===body.legalEntityId),roles=grants.map(g=>g.code);
 if(!entity||entity.status!=="ACTIVE"||entity.tenantId!==body.tenantId||!actor||actor.status!=="ACTIVE"||actor.isServiceAccount||actor.partyId!==p.partyId||actor.partyId!==member.partyId||actor.primaryTenantId!==body.tenantId||!p.mfaSatisfied||!permissionsForRoles(roles).has("governance:resolution.read")||classificationRank(clearanceForRoles(roles))<classificationRank(classification)||!can(p,"governance:resolution.read",{tenantId:body.tenantId,entityId:body.legalEntityId??undefined,classification}).allowed)throw new GovernanceError("FORBIDDEN","Only the current human member with independently scoped read access and MFA may resign.");
 if(!await hasEffectiveConstitution())throw new GovernanceError("POLICY_DENIED","An effective constitution is required.");
 const policy=await evaluatePolicy({action:"governance:membership.resign",tenantId:body.tenantId,entityCode:entity.code,jurisdictionCode:entity.countryCode,roles,classification,riskScore:p.riskScore,aiInitiated:false});
 const permissionPolicy=await evaluatePolicy({action:"governance:resolution.read",tenantId:body.tenantId,entityCode:entity.code,jurisdictionCode:entity.countryCode,roles,classification,riskScore:p.riskScore,aiInitiated:false});
 if(permissionPolicy.effect==="DENY"||permissionPolicy.obligations.length)throw new GovernanceError("POLICY_DENIED","Membership read policy has undischarged restrictions.");
 policy.appliedPolicies.push(...permissionPolicy.appliedPolicies);
 if(policy.effect==="DENY"||policy.obligations.length)throw new GovernanceError("POLICY_DENIED","Resignation has undischarged policy restrictions.");
 return policy;
}
function currentTerm(member:typeof governanceMembers.$inferSelect){const today=new Date().toISOString().slice(0,10);if(member.appointedOn>today||(member.retiredOn&&member.retiredOn<today))throw fail("The original membership term is not current; this operation cannot renew or backdate it.");}
async function project(change:Change){
 await db.execute(sql`select set_config('beyu.membership_change_id',${change.id},true)`);
 const [member]=await db.update(governanceMembers).set({lifecycleStatus:change.toStatus,lifecycleRevision:change.memberRevision+1}).where(and(eq(governanceMembers.id,change.memberId),eq(governanceMembers.lifecycleRevision,change.memberRevision))).returning();
 if(!member)throw new GovernanceError("CONFLICT","Membership changed concurrently.");
 const [body]=await db.select().from(governanceBodies).where(eq(governanceBodies.id,change.bodyId));
 const composition=await currentCharterComposition(body);
 if(change.command==="REINSTATE"&&(!composition.charter||!composition.satisfied))throw fail("Reinstatement must restore a valid current charter composition.");
 return composition;
}
async function changed(p:Principal,body:Awaited<ReturnType<typeof readGoverningBody>>,member:typeof governanceMembers.$inferSelect,perform:()=>Promise<Change>,ctx:MutationContext,cause:string|null,policyVersion:string|null,note:string|null=null){
 return withAuditTransaction(async(tx)=>{
  const row=await perform();
  if(row.status==="APPLIED"){
   await project(row);
   const recipients=await tx.select().from(users).where(eq(users.partyId,member.partyId));
   for(const u of recipients)await tx.insert(notifications).values({id:newId("NTF"),tenantId:body.tenantId,userId:u.id,channel:"IN_APP",status:"QUEUED",subject:"Governance membership updated",body:"Review the authoritative membership record. This notice grants no authority.",linkHref:`/os/governance#member-${member.id}`});
  }
  return row;
 },row=>({tenantId:body.tenantId,actorUserId:p.userId,actorType:"HUMAN",action:`governance.membership.${row.status==="APPLIED"?row.command.toLowerCase():"propose"}`,objectType:row.status==="APPLIED"?"GOVERNANCE_MEMBER":"GOVERNANCE_MEMBERSHIP_CHANGE",objectId:row.status==="APPLIED"?member.id:row.id,outcome:"SUCCESS",reason:note??row.rationale,oldValue:serial(member),newValue:serial({change:row,member:{...member,...(row.status==="APPLIED"?{lifecycleStatus:row.toStatus,lifecycleRevision:member.lifecycleRevision+1}:{})}}),traceId:ctx.traceId}),
 row=>({type:MEMBERSHIP_EVENTS[row.status==="APPLIED"?row.command as keyof typeof MEMBERSHIP_EVENTS:"PROPOSE"],source:"beyu-os/governance",domain:"GOVERNANCE",operation:row.command,tenantId:body.tenantId,legalEntityId:body.legalEntityId,subjectType:row.status==="APPLIED"?"GOVERNANCE_MEMBER":"GOVERNANCE_MEMBERSHIP_CHANGE",subjectId:row.status==="APPLIED"?member.id:row.id,actorUserId:p.userId,actorType:"HUMAN",classification:row.classification,payload:serial(row),traceId:ctx.traceId,correlationId:ctx.traceId,causationId:cause,destinationDomain:null,policyVersion,authorityContext:{authorityId:row.authorityBodyId,decisionId:row.resolutionId,capabilityCode:null,permissionCode:row.command==="RESIGN"?"governance:resolution.read":"governance:resolution.approve",policyVersion}}));
}
export async function proposeMembershipChange(p:Principal,bodyId:string,memberId:string,raw:unknown,ctx:MutationContext){
 const input=MembershipProposalSchema.parse(raw);
 return scoped(p,async()=>{
  await db.select().from(governanceBodies).where(eq(governanceBodies.id,bodyId)).for("update");
  await db.select().from(governanceMembers).where(eq(governanceMembers.id,memberId)).for("update");
  const {body,member}=await target(p,bodyId,memberId);currentTerm(member);
  if(member.lifecycleRevision!==input.expectedRevision)throw new GovernanceError("CONFLICT","Stale membership revision.");
  const toStatus=membershipTarget(input.command,member.lifecycleStatus);if(!toStatus)throw fail("Invalid membership lifecycle transition.");
  const doc=await readBodyDocument(p,body,input.documentId);
  const authority=input.command==="RESIGN"?null:await authorizeMembershipSuperior(p,bodyId,doc.classification,"PROPOSE");
  if(authority&&member.partyId===p.partyId)throw new GovernanceError("FORBIDDEN","A member cannot propose an involuntary change or reinstatement for themselves.");
  const policy=authority?.policy??await resignAuthority(p,body,member,doc.classification),policyVersion=policy.appliedPolicies.map(v=>`${v.code}@${v.version}`).join(",")||null;
  return changed(p,body,member,async()=>{
   const [row]=await db.insert(governanceMembershipChanges).values({id:newId("GMC"),bodyId,memberId,authorityBodyId:authority?.body.id??bodyId,command:input.command,fromStatus:member.lifecycleStatus,toStatus,memberRevision:member.lifecycleRevision,documentId:doc.id,documentVersion:doc.version,documentChecksum:doc.checksum,classification:doc.classification,rationale:input.rationale,proposedByUserId:p.userId,proposedByPartyId:p.partyId,...(input.command==="RESIGN"?{status:"APPLIED",appliedByUserId:p.userId,appliedAt:new Date()}:{})}).returning();return row;
  },ctx,null,policyVersion);
 });
}
export async function applyMembershipChange(p:Principal,bodyId:string,id:string,raw:unknown,ctx:MutationContext){
 const input=MembershipApplySchema.parse(raw);
 return scoped(p,()=>withResolutionAuthorityLock(p,input.resolutionId,async()=>{
  await db.select().from(governanceBodies).where(eq(governanceBodies.id,bodyId)).for("update");
  const {changes}=await listMembershipChanges(p,bodyId),row=changes.find(c=>c.id===id);
  if(!row)throw new GovernanceError("NOT_FOUND","Membership change is not visible.");
  await db.select().from(governanceMembers).where(eq(governanceMembers.id,row.memberId)).for("update");
  const {body,member}=await target(p,bodyId,row.memberId);currentTerm(member);
  if(row.status!=="PROPOSED"||member.lifecycleRevision!==row.memberRevision)throw new GovernanceError("CONFLICT","This request has been applied or its membership evidence is stale.");
  if(membershipTarget(row.command,member.lifecycleStatus)!==row.toStatus)throw fail("Membership lifecycle evidence changed.");
  const authority=await authorizeMembershipSuperior(p,bodyId,row.classification,"APPLY");
  if(authority.body.id!==row.authorityBodyId)throw fail("Recorded superior authority changed.");
  if(p.userId===row.proposedByUserId||p.partyId===row.proposedByPartyId||p.partyId===member.partyId)throw new GovernanceError("FORBIDDEN","Independent superior approval cannot be the proposer or affected member.");
  const doc=await readBodyDocument(p,body,row.documentId);
  if(doc.version!==row.documentVersion||doc.checksum!==row.documentChecksum||doc.classification!==row.classification)throw fail("The frozen instrument changed; propose a new request.");
  const decision=await authorizeResolutionFollowUp(p,input.resolutionId,true),r=decision.resolution;
  if(decision.body.id!==row.authorityBodyId||r.category!=="RESERVED_MATTER"||r.linkedObjectType!=="GOVERNANCE_MEMBERSHIP_CHANGE"||r.linkedObjectId!==row.id||classificationRank(r.classification)<classificationRank(row.classification))throw fail("An exact superior reserved-matter decision on this membership change is required.");
  const affected=await db.select({vote:resolutionVotes.vote}).from(resolutionVotes).innerJoin(governanceMembers,eq(governanceMembers.id,resolutionVotes.memberId)).where(and(eq(resolutionVotes.resolutionId,r.id),eq(governanceMembers.partyId,member.partyId)));
  if(affected.some(v=>v.vote!=="RECUSED"))throw fail("The affected member cannot participate in their own membership decision.");
  const policyVersion=authority.policy.appliedPolicies.map(v=>`${v.code}@${v.version}`).join(",")||null;
  return changed(p,body,member,async()=>{const [applied]=await db.update(governanceMembershipChanges).set({status:"APPLIED",resolutionId:r.id,appliedByUserId:p.userId,appliedAt:new Date()}).where(and(eq(governanceMembershipChanges.id,row.id),eq(governanceMembershipChanges.status,"PROPOSED"))).returning();if(!applied)throw new GovernanceError("CONFLICT","Concurrent membership transition.");return applied;},ctx,decision.decisionEvent.id,policyVersion,input.note);
 }));
}

/** Current preauthorization for receipt recovery, without re-running transition preconditions. */
export async function authorizeMembershipRequest(p:Principal,bodyId:string,memberId:string,input:{command:string;documentId:string}){
 const {body,member}=await target(p,bodyId,memberId),doc=await readBodyDocument(p,body,input.documentId);
 if(input.command==="RESIGN")return resignAuthority(p,body,member,doc.classification);
 const authority=await authorizeMembershipSuperior(p,bodyId,doc.classification,"PROPOSE");
 if(member.partyId===p.partyId)throw new GovernanceError("FORBIDDEN","Affected member cannot authorize their own change.");
 return authority.policy;
}
