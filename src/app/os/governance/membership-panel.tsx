"use client";
import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
type Member={appointedOn:string;retiredOn:string|null;id:string;partyId:string;name:string;seatRole:string;lifecycleStatus:string;lifecycleRevision:number};
type Change={id:string;memberId:string;command:string;status:string;proposedByUserId:string;appliedAt:string|null};
export function MembershipPanel({bodyId,userId,partyId,canManage,members,changes}:{bodyId:string;userId:string;partyId:string;canManage:boolean;members:Member[];changes:Change[]}){
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const retry=useRef<{fingerprint:string;key:string}|null>(null),root=`/api/v1/governance/bodies/${bodyId}`;
 async function post(path:string,input:unknown){const body=JSON.stringify(input),fingerprint=path+body;if(retry.current?.fingerprint!==fingerprint)retry.current={fingerprint,key:crypto.randomUUID()};setBusy(true);setMessage("");try{const response=await fetch(path,{method:"POST",headers:{"content-type":"application/json","idempotency-key":retry.current.key},body});const data=await response.json();setMessage(response.ok?"Recorded; authoritative membership refreshed.":data.error?.message??"Request denied.");if(response.ok){retry.current=null;router.refresh();}}catch{setMessage("Outcome unconfirmed; retry unchanged to recover safely.");}finally{setBusy(false);}}
 const today=new Date().toISOString().slice(0,10);
 const style="block w-full rounded border border-slate-500/30 bg-transparent p-2 text-xs";
 return <details data-membership-body={bodyId} className="mt-4 border-t border-slate-500/20 pt-3"><summary className="cursor-pointer text-xs font-semibold">Membership lifecycle & history</summary>
 <p className="my-2 text-xs beyu-muted">A member may resign personally. Suspension, removal and reinstatement require independent recorded-superior decisions. Dates and historical ballots remain unchanged. Membership does not grant RBAC or Finance powers.</p>
 {message&&<p role="status" className="text-xs">{message}</p>}
 {members.map(m=><article key={m.id} id={`member-${m.id}`} data-membership-id={m.id} className="my-3 space-y-2 rounded border border-slate-500/30 p-2 text-xs"><h4>{m.name} · {m.seatRole} · {m.lifecycleStatus!=="ACTIVE"?m.lifecycleStatus:m.retiredOn&&m.retiredOn<today?"EXPIRED":m.appointedOn>today?"SCHEDULED":"ACTIVE"} · revision {m.lifecycleRevision}</h4>
 {(["ACTIVE","SUSPENDED"].includes(m.lifecycleStatus)&&m.appointedOn<=today&&(!m.retiredOn||m.retiredOn>=today)&&(canManage||m.partyId===partyId))&&<form className="space-y-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void post(`${root}/members/${m.id}/changes`,{command:f.get("command"),expectedRevision:m.lifecycleRevision,documentId:f.get("document"),rationale:f.get("rationale")});}}>
 <label>Membership action<select name="command" className={style}>{m.partyId===partyId&&<option value="RESIGN">Resign my membership</option>}{canManage&&m.partyId!==partyId&&<>{m.lifecycleStatus==="ACTIVE"?<option value="SUSPEND">Propose suspension</option>:<option value="REINSTATE">Propose reinstatement</option>}<option value="REMOVE">Propose removal</option></>}</select></label>
 <label>Membership instrument document ID<input name="document" required className={style}/></label><label>Membership change rationale<textarea name="rationale" minLength={20} required className={style}/></label>
 <button disabled={busy} className="rounded border p-2">Record membership request</button></form>}
 {changes.filter(c=>c.memberId===m.id).map(c=><div key={c.id} data-membership-change={c.id} className="space-y-2 border-t border-slate-500/20 pt-2"><p>{c.command} · {c.status} · <span className="break-all">{c.id}</span></p>{c.appliedAt&&<p>Applied: {c.appliedAt}</p>}
 {canManage&&c.status==="PROPOSED"&&c.proposedByUserId!==userId&&<form className="space-y-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void post(`${root}/membership-changes/${c.id}`,{resolutionId:f.get("resolution"),note:f.get("note")});}}><label>Approved membership-specific RESERVED_MATTER resolution ID<input name="resolution" required className={style}/></label><label>Independent membership review note<input name="note" minLength={10} required className={style}/></label><button disabled={busy} className="rounded border p-2">Apply independent membership decision</button></form>}</div>)}
 </article>)}
 </details>;
}
