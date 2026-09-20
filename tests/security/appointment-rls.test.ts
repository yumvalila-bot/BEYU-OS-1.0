import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { nominateMember } from "../../src/lib/governance/appointment-service";
import { appointmentFixture, appointmentInput, cleanupAppointments, asAppointmentActor as as } from "../helpers/appointments";
let runtime: Client, f: Awaited<ReturnType<typeof appointmentFixture>>, id: string;
async function scoped(fn: () => Promise<void>, options: { tenant?: string; entity?: string; classification?: string; read?: string } = {}) {
 await runtime.query("begin");
 try {
  await runtime.query(`select set_config('beyu.current_tenant_ids',$1,true),set_config('beyu.governance_context','on',true),set_config('beyu.governance_entity_ids',$2,true),set_config('beyu.governance_classifications',$3,true),set_config('beyu.governance_actions_read',$4,true),set_config('beyu.global_scope','on',true),set_config('beyu.governance_appointment_actor',$5,true)`, [options.tenant ?? f.chair.tenantId, options.entity ?? "", options.classification ?? "PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED", options.read ?? "on", f.chair.userId]);
  await fn();
 } finally { await runtime.query("rollback"); }
}
beforeAll(async () => {
 if (!process.env.BEYU_RUNTIME_DATABASE_URL) throw Error("Actual runtime DSN required");
 runtime = new Client({ connectionString: process.env.BEYU_RUNTIME_DATABASE_URL }); await runtime.connect();
 expect((await runtime.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user")).rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
 await cleanupAppointments("APPT_RLS"); f = await appointmentFixture("APPT_RLS");
 await db.execute(sql`insert into documents select (jsonb_populate_record(null::documents, to_jsonb(d)||'{"id":"DOC_APPT_RLS","classification":"RESTRICTED"}'::jsonb)).* from documents d where id='DOC_D4'`);
 id = (await as(f.chair, () => nominateMember(f.chair, f.bodyId, appointmentInput(f.candidate.userId, { documentId: "DOC_APPT_RLS" }), { traceId: "APPOINTMENT_RLS" }))).id;
});
afterAll(async () => { await cleanupAppointments("APPT_RLS"); await db.execute(sql`delete from documents where id='DOC_APPT_RLS'`); if (runtime) await runtime.end(); });
describe("appointment direct non-owner SQL boundary", () => {
 it("exposes no rows without scoped context", async () => { expect((await runtime.query("select id from governance_appointments where id=$1", [id])).rowCount).toBe(0); });
 it.each([{ tenant: "TEN_BEYU_FINTECH" }, { entity: "WRONG_ENTITY" }, { classification: "PUBLIC" }, { read: "off" }])("blocks %j despite global flag", async (options) => scoped(async () => { expect((await runtime.query("select id from governance_appointments where id=$1", [id])).rowCount).toBe(0); }, options));
 it("cannot delete appointment history", async () => scoped(async () => { expect((await runtime.query("delete from governance_appointments where id=$1", [id])).rowCount).toBe(0); }));
 it.each(["status='ACTIVE',revision=revision+1", "seat_role='CHAIR',revision=revision+1", "nominee_user_id='USR_AMANI_BEYU',revision=revision+1", "status='APPROVED',approved_by_user_id='USR_AMANI_BEYU',revision=revision+1"])("rejects forged transition %s", async (set) => scoped(async () => { await expect(runtime.query(`update governance_appointments set ${set} where id=$1`, [id])).rejects.toHaveProperty("code", "23514"); }));
 it.each(["governance_bodies", "governance_members"])("0051 preserves UPDATE denial on %s", async (table) => scoped(async () => {
  const filter = table === "governance_bodies" ? "id" : "body_id";
  await expect(runtime.query(`update ${table} set ${table === "governance_bodies" ? "name=name" : "seat_role='CHAIR'"} where ${filter}=$1`, [f.bodyId])).rejects.toHaveProperty("code", "42501");
 }));
 it.each(["governance_bodies", "governance_members"])("0051 preserves DELETE denial on %s", async (table) => scoped(async () => {
  expect((await runtime.query(`delete from ${table} where ${table === "governance_bodies" ? "id" : "body_id"}=$1`, [f.bodyId])).rowCount).toBe(0);
 }));
 it("0051 preserves body creation denial", async () => scoped(async () => {
  await expect(runtime.query(`insert into governance_bodies select (jsonb_populate_record(null::governance_bodies,to_jsonb(b)||'{"id":"GOV_FORGED_APPT","code":"GOV_FORGED_APPT"}'::jsonb)).* from governance_bodies b where id=$1`, [f.bodyId])).rejects.toHaveProperty("code", "42501");
 }));
 it("0051 preserves finalized decisions and ballots", async () => scoped(async () => {
  const final = await runtime.query("select id from resolutions where body_id=$1 and status='APPROVED'", [f.bodyId]); expect(final.rowCount).toBeGreaterThan(0);
  const resolutionId = final.rows[0].id;
  expect((await runtime.query("update resolutions set status='DRAFT' where id=$1", [resolutionId])).rowCount).toBe(0);
  expect((await runtime.query("delete from resolutions where id=$1", [resolutionId])).rowCount).toBe(0);
  expect((await runtime.query("update resolution_votes set vote='AGAINST' where resolution_id=$1", [resolutionId])).rowCount).toBe(0);
  expect((await runtime.query("delete from resolution_votes where resolution_id=$1", [resolutionId])).rowCount).toBe(0);
 }));
 it("does not treat an appointment flag as appointment authority", async () => scoped(async () => {
  await runtime.query("select set_config('beyu.governance_appointment_id',$1,true)", [id]);
  await expect(runtime.query("insert into governance_members(id,body_id,party_id,seat_role,appointed_on) values('GMB_FORGED_APPT',$1,$2,'CHAIR',CURRENT_DATE)", [f.bodyId, f.candidate.partyId])).rejects.toHaveProperty("code", "42501");
 }));
});
