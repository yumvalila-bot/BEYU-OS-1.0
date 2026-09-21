import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { parties, users } from "../../src/db/schema";
import type { Principal } from "../../src/lib/authz";
/** Privileged disposable identity-administration fixture. Preserve NOT NULL,
 * unique party bindings and all application/SQL guards throughout the swap. */
export async function withReboundAppointmentActors<T>(f: { chair: Principal; secretary: Principal }, fn: () => Promise<T>): Promise<T> {
 const [party] = await db.select().from(parties).where(eq(parties.id, f.chair.partyId!));
 const spare = `PTY_APPT_SWAP_${randomUUID()}`;
 await db.insert(parties).values({ ...party, id: spare, displayName: "Disposable identity reassignment fixture" });
 let swapped = false;
 try {
  await db.transaction(async (tx) => {
   await tx.update(users).set({ partyId: spare }).where(eq(users.id, f.chair.userId));
   await tx.update(users).set({ partyId: f.chair.partyId }).where(eq(users.id, f.secretary.userId));
   await tx.update(users).set({ partyId: f.secretary.partyId }).where(eq(users.id, f.chair.userId));
  });
  swapped = true;
  return await fn();
 } finally {
  if (swapped) await db.transaction(async (tx) => {
   await tx.update(users).set({ partyId: spare }).where(eq(users.id, f.secretary.userId));
   await tx.update(users).set({ partyId: f.chair.partyId }).where(eq(users.id, f.chair.userId));
   await tx.update(users).set({ partyId: f.secretary.partyId }).where(eq(users.id, f.secretary.userId));
  });
  await db.delete(parties).where(eq(parties.id, spare));
 }
}
