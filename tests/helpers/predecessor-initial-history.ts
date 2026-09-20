import type { Client } from "pg";
/** Version-stable predecessor fixture. Deliberately uses only 0055 columns:
 * importing today's ORM/service projection into yesterday's schema is invalid.
 * All predecessor guards run normally: no trigger/RLS disabling or ledger repair. */
export async function predecessorInitialHistory(c:Client){
 const chair="USR_AMANI_BEYU",secretary="USR_GRACE_KILELE",parent="GOV_GROUP_BOARD",child="GOV_UPGRADE_CHILD";
 const [body]=(await c.query("select * from governance_bodies where id=$1",[parent])).rows;
 const [doc]=(await c.query("select * from documents where id='DOC_D4'")).rows;
 const party=(await c.query("select party_id from users where id=$1",[chair])).rows[0].party_id;
 const presider=(await c.query("select id from governance_members where body_id=$1 and seat_role='CHAIR'",[parent])).rows[0].id;
 const rules={quorumMinimum:body.quorum_minimum,majorityRule:body.majority_rule,minimumVotingMembers:4,maximumVotingMembers:8,requiredSeats:[{role:"CHAIR",minimum:1,maximum:1},{role:"SECRETARY",minimum:1,maximum:1}]};
 async function actor(who:string){await c.query("select set_config('beyu.governance_charter_actor',$1,false),set_config('beyu.body_establishment_actor',$1,false),set_config('beyu.governance_appointment_actor',$1,false)",[who]);}
 async function decision(id:string,type:string,category:string){const rid=`RES_${id}`;await c.query(`insert into resolutions(id,reference,tenant_id,body_id,title,category,summary,rationale,data_basis,consequences,proposed_by,status,required_majority,classification,linked_object_type,linked_object_id,quorum_met,decided_by_member_id,decision_date)
 values($1,$1,$2,$3,'Historical exact decision',$4,'Predecessor history','Predecessor history','Recorded fixture','No RBAC grant',$5,'APPROVED',$6,$7,$8,$9,true,$10,now())`,[rid,body.tenant_id,parent,category,chair,body.majority_rule,doc.classification,type,id,presider]);return rid;}
 async function charter(id:string,bodyId:string,initial:boolean){
  await actor(chair);
  await c.query("insert into governance_charters(id,body_id,authority_body_id,created_by_party_id,version,created_by_user_id) values($1,$2,$3,$4,1,$5)",[id,bodyId,parent,party,chair]);
  await c.query("insert into governance_charter_terms(id,document_id,document_version,document_checksum,purpose,rules,classification) values($1,$2,$3,$4,'Predecessor composition charter',$5,$6)",[id,doc.id,doc.version,doc.checksum,JSON.stringify(rules),doc.classification]);
  await c.query("update governance_charters set status='IN_REVIEW',revision=2 where id=$1",[id]);
  const rid=await decision(id,"GOVERNANCE_CHARTER","POLICY");await actor(secretary);
  await c.query("update governance_charters set status=$2,revision=3,adopted_by_user_id=$3,adopted_at=now(),resolution_id=$4 where id=$1",[id,initial?"APPROVED":"ADOPTED",secretary,rid]);
 }
 await charter("GCH_UPGRADE_PARENT",parent,false);await actor(chair);
 await c.query(`insert into governance_body_establishments(id,parent_body_id,parent_charter_id,code,name,purpose,document_id,document_version,document_checksum,classification,rules,reserved_matters,proposed_by_user_id,proposed_by_party_id)
 values('GBE_UPGRADE',$1,'GCH_UPGRADE_PARENT','UPGRADE_CHILD','Historical child','Predecessor body establishment',$2,$3,$4,$5,$6,$7,$8,$9)`,[parent,doc.id,doc.version,doc.checksum,doc.classification,JSON.stringify(rules),JSON.stringify(body.reserved_matters),chair,party]);
 await c.query("update governance_body_establishments set status='IN_REVIEW',revision=2 where id='GBE_UPGRADE'");const er=await decision("GBE_UPGRADE","GOVERNANCE_BODY_ESTABLISHMENT","RESERVED_MATTER");await actor(secretary);
 await c.query("update governance_body_establishments set status='APPROVED',revision=3,approved_by_user_id=$1,resolution_id=$2 where id='GBE_UPGRADE'",[secretary,er]);
 await c.query("begin");try{
  await c.query("update governance_body_establishments set status='ESTABLISHED',revision=4,body_id=$1 where id='GBE_UPGRADE'",[child]);
  await c.query(`insert into governance_bodies select (jsonb_populate_record(null::governance_bodies,to_jsonb(b)||$1::jsonb)).* from governance_bodies b where id=$2`,[JSON.stringify({id:child,code:"UPGRADE_CHILD",name:"Historical child",body_type:"COMMITTEE",status:"DRAFT",classification:doc.classification,charter_document_id:doc.id}),parent]);
  await c.query("commit");
 }catch(e){await c.query("rollback");throw e;}
 await charter("GCH_UPGRADE_CHILD",child,true);
 for(let i=0;i<4;i++){
  const uid=`USR_UPGRADE_${i}`,pid=`PTY_UPGRADE_${i}`,id=`GAP_UPGRADE_${i}`;
  await c.query("insert into parties select (jsonb_populate_record(null::parties,to_jsonb(p)||$1::jsonb)).* from parties p where id=$2",[JSON.stringify({id:pid,display_name:`Historical nominee ${i}`}),party]);
  await c.query("insert into users select (jsonb_populate_record(null::users,to_jsonb(u)||$1::jsonb)).* from users u where id=$2",[JSON.stringify({id:uid,party_id:pid,email:`upgrade_${i}@beyu.os`}),chair]);
  await actor(chair);
  await c.query(`insert into governance_appointments(id,body_id,authority_body_id,initial_charter_id,nominee_user_id,party_id,seat_role,voting_rights,appointed_on,retired_on,document_id,document_version,document_checksum,classification,rationale,nominated_by_user_id,nominated_by_party_id)
  values($1,$2,$3,'GCH_UPGRADE_CHILD',$4,$5,$6,true,CURRENT_DATE,'2030-12-31',$7,$8,$9,$10,'Immutable predecessor nomination',$11,$12)`,[id,child,parent,uid,pid,i===0?"CHAIR":i===1?"SECRETARY":"MEMBER",doc.id,doc.version,doc.checksum,doc.classification,chair,party]);
  const rid=await decision(id,"GOVERNANCE_APPOINTMENT","APPOINTMENT");await actor(secretary);
  await c.query("update governance_appointments set status='APPROVED',revision=2,approved_by_user_id=$2,approved_by_party_id=(select party_id from users where id=$2),resolution_id=$3 where id=$1",[id,secretary,rid]);
  await actor(uid);await c.query("update governance_appointments set status='ACCEPTED',revision=3,accepted_at=now() where id=$1",[id]);
 }
}
