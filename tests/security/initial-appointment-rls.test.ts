import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { db } from "../../src/db";
import { sql } from "drizzle-orm";
import { Client } from "pg";
import { nominateMember, commandAppointment } from "../../src/lib/governance/appointment-service";
import { initialAppointmentFixture, initialAppointmentContext as ctx } from "../helpers/initial-appointments";
import { appointmentInput, appointmentBallot, asAppointmentActor as as } from "../helpers/appointments";
import { cleanupEstablishments } from "../helpers/establishments";
let runtime: Client, f: Awaited<ReturnType<typeof initialAppointmentFixture>>, id: string, accepted: string, resolutionId: string;
async function scoped(fn: () => Promise<void>, options: { tenant?: string; entity?: string; classification?: string; actor?: string } = {}) {
 await runtime.query("begin");
 try {
  await runtime.query(`select set_config('beyu.current_tenant_ids',$1,true),set_config('beyu.governance_context','on',true),set_config('beyu.governance_actions_read','on',true),set_config('beyu.governance_entity_ids',$2,true),set_config('beyu.governance_classifications',$3,true),set_config('beyu.governance_appointment_actor',$4,true),set_config('beyu.global_scope','on',true)`, [options.tenant ?? f.chair.tenantId, options.entity ?? "", options.classification ?? "PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED", options.actor ?? f.secretary.userId]);
  await fn();
 } finally { await runtime.query("rollback"); }
}
beforeAll(async () => {
 if (!process.env.BEYU_RUNTIME_DATABASE_URL) throw Error("Actual runtime DSN required");
 runtime = new Client({ connectionString: process.env.BEYU_RUNTIME_DATABASE_URL }); await runtime.connect();
 expect((await runtime.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
 await cleanupEstablishments("INITIAL_APPT_RLS"); f = await initialAppointmentFixture("INITIAL_APPT_RLS");
 await db.execute(sql`insert into documents select (jsonb_populate_record(null::documents,to_jsonb(d)||'{"id":"DOC_INITIAL_APPT_RLS","classification":"RESTRICTED"}'::jsonb)).* from documents d where id='DOC_D4'`);
 const create = () => as(f.chair, () => nominateMember(f.chair, f.childId, appointmentInput(f.candidate.userId, { documentId: "DOC_INITIAL_APPT_RLS" }), ctx));
 id = (await create()).id; resolutionId = await appointmentBallot(id, f.chair);
 accepted = (await create()).id; const r = await appointmentBallot(accepted, f.chair);
 await as(f.secretary, () => commandAppointment(f.secretary, f.childId, accepted, { command: "APPROVE", expectedRevision: 1, resolutionId: r, note: "Approve initial consent without authority" }, ctx));
 await as(f.candidate, () => commandAppointment(f.candidate, f.childId, accepted, { command: "ACCEPT", expectedRevision: 2, note: "Consent to the immutable initial appointment" }, ctx));
});
afterAll(async () => { if (runtime) await runtime.end(); await cleanupEstablishments("INITIAL_APPT_RLS"); await db.execute(sql`delete from documents where id='DOC_INITIAL_APPT_RLS'`); });
describe("initial appointments, actual non-owner SQL", () => {
 it("exposes no appointments without scoped context", async () => { expect((await runtime.query("select id from governance_appointments where id=$1",[id])).rowCount).toBe(0); });
 it.each([{ tenant: "TEN_BEYU_FINTECH" }, { entity: "WRONG_ENTITY" }, { classification: "PUBLIC" }])("denies %j despite global flag", async (options) => scoped(async () => { expect((await runtime.query("select id from governance_appointments where id=$1",[id])).rowCount).toBe(0); }, options));
 it("permits an exact superior approval but creates no membership", async () => scoped(async () => {
  const r = await runtime.query("update governance_appointments set status='APPROVED',revision=2,approved_by_user_id=$2,approved_by_party_id=$3,resolution_id=$4 where id=$1 returning authority_body_id,initial_charter_id",[id,f.secretary.userId,f.secretary.partyId,resolutionId]);
  expect(r.rows).toEqual([{ authority_body_id: f.bodyId, initial_charter_id: f.initialCharterId }]);
  expect((await runtime.query("select id from governance_members where body_id=$1",[f.childId])).rowCount).toBe(0);
 }));
 it.each([{ authority_body_id: null }, { initial_charter_id: null }, { authority_body_id: "GOV_GROUP_BOARD" }])("rejects forged initial scope %j", async (fields) => scoped(async () => {
  await expect(runtime.query("insert into governance_appointments select (jsonb_populate_record(null::governance_appointments,to_jsonb(a)||$2::jsonb)).* from governance_appointments a where id=$1",[id,JSON.stringify({ id: `${id}_FORGED`, ...fields })])).rejects.toHaveProperty("code","23514");
 }, { actor: f.chair.userId }));
 it("cannot substitute the pinned charter during an otherwise valid approval", async () => scoped(async () => {
  await expect(runtime.query("update governance_appointments set status='APPROVED',revision=2,approved_by_user_id=$2,approved_by_party_id=$3,resolution_id=$4,initial_charter_id=null where id=$1",[id,f.secretary.userId,f.secretary.partyId,resolutionId])).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("Immutable appointment authority") });
 }));
 it("cannot activate an accepted initial appointment, even with forged activation flags", async () => scoped(async () => {
  await runtime.query("select set_config('beyu.governance_appointment_id',$1,true)",[accepted]);
  await expect(runtime.query("update governance_appointments set status='ACTIVE',revision=4,activated_by_user_id=$2,member_id='GMB_FORGED_INITIAL' where id=$1",[accepted,f.secretary.userId])).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("cannot individually activate") });
 }));
 it("cannot insert an initial member directly", async () => scoped(async () => {
  await runtime.query("select set_config('beyu.governance_appointment_id',$1,true)",[accepted]);
  await expect(runtime.query("insert into governance_members(id,body_id,party_id,seat_role,appointed_on) values('GMB_FORGED_INITIAL',$1,$2,'CHAIR',CURRENT_DATE)",[f.childId,f.candidate.partyId])).rejects.toHaveProperty("code","42501");
 }));
 it("preserves body-write and appointment-history protections", async () => {
  await scoped(async () => { await expect(runtime.query("update governance_bodies set status='ACTIVE' where id=$1",[f.childId])).rejects.toHaveProperty("code","42501"); });
  await scoped(async () => { expect((await runtime.query("delete from governance_appointments where id=$1",[id])).rowCount).toBe(0); });
 });
});
