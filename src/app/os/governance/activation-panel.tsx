"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
type Plan = { id: string; status: string; revision: number; authorityBodyId: string; initialCharterId: string; nominationIds: string[]; proposedByUserId: string; activatedAt: string | null };
export function ActivationPanel({ bodyId, userId, canManage, plans, accepted }: { bodyId: string; userId: string; canManage: boolean; plans: Plan[]; accepted: { id: string; seatRole: string; nomineeUserId: string }[] }) {
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const retry=useRef<{fingerprint:string;key:string}|null>(null),root=`/api/v1/governance/bodies/${bodyId}/activations`;
 const style="w-full rounded border border-slate-500/30 bg-transparent p-2 text-xs";
 async function post(path:string,input:unknown) {
  const payload=JSON.stringify(input),fingerprint=path+payload;
  if(retry.current?.fingerprint!==fingerprint) retry.current={fingerprint,key:crypto.randomUUID()};
  setBusy(true);setMessage("");
  try {
   const response=await fetch(path,{method:"POST",headers:{"content-type":"application/json","idempotency-key":retry.current.key},body:payload});
   const data=await response.json();setMessage(response.ok?"Recorded; authoritative state refreshed.":data.error?.message??"Request denied.");
   if(response.ok){retry.current=null;router.refresh();}
  } catch {setMessage("Outcome unconfirmed. Retry unchanged to recover safely.");}
  finally{setBusy(false);}
 }
 return <details className="mt-4 border-t border-slate-500/20 pt-3" data-activation-body={bodyId}>
  <summary className="cursor-pointer text-xs font-semibold">Initial composition & body activation</summary>
  <p className="my-2 text-xs beyu-muted">Freeze the exact consented membership and charter. Independent superior reserved-matter approval is required. Activation commits all memberships, charter effectiveness and the body together; it grants no RBAC or Finance capability.</p>
  {message&&<p role="status" className="my-2 text-xs">{message}</p>}
  {plans.map((p)=><article key={p.id} data-activation-id={p.id} className="my-3 space-y-2 rounded border border-slate-500/30 p-2 text-xs">
   <h4>{p.status} · revision {p.revision}</h4><p className="break-all">{p.id}</p>
   <p>Superior: {p.authorityBodyId} · charter: {p.initialCharterId}</p><p>{p.nominationIds.length} exact consented nominations</p>
   {p.activatedAt&&<p>Effective activation recorded: {p.activatedAt}. Eligibility still requires independent current authorization.</p>}
   {canManage&&p.status!=="ACTIVE"&&<form className="space-y-2" onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);const command=((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value;void post(`${root}/${p.id}`,{command,expectedRevision:p.revision,note:f.get("note"),...(command==="APPROVE"?{resolutionId:f.get("resolution")}:{} )});}}>
    <label className="block">Activation review note<input name="note" minLength={10} required className={style}/></label>
    {p.status==="IN_REVIEW"&&<label className="block">Approved activation-specific RESERVED_MATTER resolution ID<input name="resolution" required className={style}/></label>}
    {p.status==="DRAFT"&&<button disabled={busy} value="SUBMIT" className="rounded border p-2">Submit initial composition</button>}
    {p.status==="IN_REVIEW"&&p.proposedByUserId!==userId&&<button disabled={busy} value="APPROVE" className="rounded border p-2">Record independent composition approval</button>}
    {p.status==="APPROVED"&&p.proposedByUserId!==userId&&<button disabled={busy} value="ACTIVATE" className="rounded border p-2">Activate body and whole composition</button>}
   </form>}
  </article>)}
  {canManage&&<form className="space-y-2 text-xs" onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);void post(root,{nominationIds:f.getAll("nomination"),rationale:f.get("rationale")});}}>
   <fieldset><legend>Accepted initial nominations</legend>{accepted.map((a)=><label key={a.id} className="my-1 block"><input type="checkbox" name="nomination" value={a.id}/> {a.seatRole} · {a.nomineeUserId} · {a.id}</label>)}</fieldset>
   <label className="block">Initial composition rationale<textarea name="rationale" required minLength={20} className={style}/></label>
   <button disabled={busy||accepted.length===0} className="rounded border border-[#b08d1c] p-2">Propose initial composition</button>
  </form>}
 </details>;
}
