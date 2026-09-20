import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { governanceCharters, governanceCharterTerms, governanceMembers } from "@/db/schema";
import { CharterRulesSchema, SEAT_ROLES } from "./charter-contract";

export function assessComposition(raw: unknown, members: { partyId: string; seatRole: string; votingRights: boolean; appointedOn: string; retiredOn: string | null }[], asOf = new Date().toISOString().slice(0, 10)) {
  const parsed = CharterRulesSchema.safeParse(raw);
  if (!parsed.success) return { satisfied: false, violations: ["Charter rules are invalid."], votingMembers: 0 };
  const rules = parsed.data;
  const active = members.filter((m) => m.appointedOn <= asOf && (!m.retiredOn || m.retiredOn >= asOf));
  const violations: string[] = [];
  if (active.some((m) => !(SEAT_ROLES as readonly string[]).includes(m.seatRole))) violations.push("Unknown active seat role.");
  if (active.some((m) => m.seatRole === "OBSERVER" && m.votingRights)) violations.push("An observer cannot hold voting rights under this charter.");
  if (new Set(active.map((m) => m.partyId)).size !== active.length) violations.push("Duplicate active party seats require reconciliation.");
  const votingMembers = new Set(active.filter((m) => m.votingRights).map((m) => m.partyId)).size;
  if (votingMembers < rules.quorumMinimum) violations.push("Active voting membership cannot meet the absolute quorum.");
  if (votingMembers < rules.minimumVotingMembers || votingMembers > rules.maximumVotingMembers) violations.push("Voting membership is outside charter bounds.");
  for (const rule of rules.requiredSeats) {
    const count = active.filter((m) => m.seatRole === rule.role).length;
    if (count < rule.minimum || count > rule.maximum) violations.push(`${rule.role}: ${count} active; requires ${rule.minimum}–${rule.maximum}.`);
  }
  return { satisfied: violations.length === 0, violations, votingMembers };
}
/** No charter is manufactured for legacy bodies. Once adopted, controls persist
 * from immutable terms, even if the source registry document is later revised. */
export async function currentCharterComposition(body: { id: string; quorumMinimum: number; majorityRule: string }) {
  const [charter] = await db.select().from(governanceCharters).where(and(eq(governanceCharters.bodyId, body.id), eq(governanceCharters.status, "ADOPTED"))).orderBy(desc(governanceCharters.version)).limit(1);
  if (!charter) return { charter: null, satisfied: true, violations: [] as string[], coverage: "LEGACY_UNCHARTERED" as const };
  const [terms] = await db.select().from(governanceCharterTerms).where(eq(governanceCharterTerms.id, charter.id));
  if (!terms) return { charter, satisfied: false, violations: ["Adopted charter terms are unavailable in this scope."], coverage: "ADOPTED_CHARTER" as const };
  const members = await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, body.id));
  const result = assessComposition(terms.rules, members);
  if (terms.rules.quorumMinimum !== body.quorumMinimum || terms.rules.majorityRule !== body.majorityRule) result.violations.push("Canonical voting rules differ from the adopted charter.");
  return { charter, satisfied: result.violations.length === 0, violations: result.violations, coverage: "ADOPTED_CHARTER" as const };
}
