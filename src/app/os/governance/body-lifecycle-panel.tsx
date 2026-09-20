"use client";
import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { bodyChangeTarget } from "@/lib/governance/body-lifecycle-contract";
type Change={id:string;command:string;status:string;fromStatus:string;toStatus:string;proposedByUserId:string;bodyRevision:number;appliedAt:string|null};
export function BodyLifecyclePanel({bodyId,status,revision,userId,canManage,changes}:{bodyId:string;status:string;revision:number;userId:string;canManage:boolean;changes:Change[]}){
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const retry=useRef<{fingerprint:string;key:string}|null>(null),root=`/api/v1/governance/bodies/${bodyId}/lifecycle-changes`;
 async function post(path:string,input:unknown){const body=JSON.stringify(input),fingerprint=path+body;if(retry.current?.fingerprint!==fingerprint)retry.current={fingerprint,key:crypto.randomUUID()};setBusy(true);setMessage("");try{const response=await fetch(path,{method:"POST",headers:{"content-type":"application/json","idempotency-key":retry.current.key},body});const data=await response.json();setMessage(response.ok?"Recorded; authoritative body state refreshed.":data.error?.message??"Request denied.");if(response.ok){retry.current=null;router.refresh();}}catch{setMessage("Outcome unconfirmed; retry unchanged to recover safely.");}finally{setBusy(false);}}
 const archived=changes.some(c=>c.status==="APPLIED"&&c.command==="ARCHIVE");
 const commands=["SUSPEND","RESUME","DISSOLVE","ARCHIVE"].filter(c=>!archived&&bodyChangeTarget(c,status)&&(c!=="ARCHIVE"||changes.some(h=>h.status==="APPLIED"&&h.command==="DISSOLVE")));
 const style="block w-full rounded border border-slate-500/30 bg-transparent p-2 text-xs";
 return <details id={`body-lifecycle-${bodyId}`} data-body-lifecycle={bodyId} className="mt-4 border-t border-slate-500/20 pt-3"><summary className="cursor-pointer text-xs font-semibold">Body lifecycle & retained history</summary>
 <h4 className="my-2 text-xs">{archived?"ARCHIVED (canonical RETIRED)":status==="RETIRED"&&changes.some(c=>c.status==="APPLIED"&&c.command==="DISSOLVE")?"DISSOLVED (canonical RETIRED)":status} · lifecycle revision {revision}</h4>
 <p className="text-xs beyu-muted">Only an independent recorded superior may suspend, resume, dissolve or archive this committee. Dissolution is terminal and requires full-history clearance and resolved outstanding work. Membership, ballots and charter history are retained; they confer no authority while the body is inactive.</p>
 {message&&<p role="status" className="my-2 text-xs">{message}</p>}
 {canManage&&commands.length>0&&<form className="my-3 space-y-2 text-xs" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void post(root,{command:f.get("command"),expectedRevision:revision,documentId:f.get("document"),rationale:f.get("rationale")});}}>
 <label>Body lifecycle action<select name="command" className={style}>{commands.map(c=><option key={c}>{c}</option>)}</select></label>
 <label>Body lifecycle instrument document ID<input name="document" required className={style}/></label><label>Body lifecycle rationale<textarea name="rationale" minLength={20} required className={style}/></label><button disabled={busy} className="rounded border p-2">Propose body lifecycle change</button></form>}
 {changes.map(c=><article key={c.id} data-body-change={c.id} className="my-3 space-y-2 rounded border border-slate-500/30 p-2 text-xs"><p>{c.command} · {c.status} · {c.fromStatus} → {c.toStatus}</p><p className="break-all">{c.id}</p>{c.appliedAt&&<p>Applied: {c.appliedAt}</p>}
 {canManage&&c.status==="PROPOSED"&&c.bodyRevision===revision&&c.fromStatus===status&&c.proposedByUserId!==userId&&<form className="space-y-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void post(`${root}/${c.id}`,{resolutionId:f.get("resolution"),note:f.get("note")});}}><label>Approved body-specific RESERVED_MATTER resolution ID<input name="resolution" required className={style}/></label><label>Independent body lifecycle review note<input name="note" minLength={10} required className={style}/></label><button disabled={busy} className="rounded border p-2">Apply independent body lifecycle decision</button></form>}</article>)}
 </details>;
}
