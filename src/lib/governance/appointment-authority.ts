import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { governanceBodies, governanceBodyEstablishments, governanceCharters, governanceCharterTerms } from "@/db/schema";
import type { Principal } from "../authz";
import { classificationRank, type Classification } from "../constants";
import { GovernanceError } from "../governance";
import { authorizeBodyPresider, readBodyDocument, readGoverningBody } from "./body-authority";
import { authorizeEstablishmentSuperior } from "./establishment-service";
import { hasEffectiveConstitution } from "./constitution";
import { currentCharterComposition } from "./charter-rules";
const fail = (message: string) => new GovernanceError("RULE_VIOLATION", message);
/** Readable authority evidence, not a presiding permission. Nominees may inspect
 * and consent, but only the separate presider check permits nomination/approval. */
export async function appointmentAuthority(p: Principal, body: typeof governanceBodies.$inferSelect, classification: Classification) {
 if (body.status === "ACTIVE") return { authorityBodyId: body.id, initialCharterId: null as string | null };
 if (body.status !== "DRAFT" || body.bodyType !== "COMMITTEE") throw fail("Appointments require an active body or a superior-established dormant committee.");
 if (!await hasEffectiveConstitution()) throw new GovernanceError("POLICY_DENIED", "An effective constitution is required for initial appointment preparation and consent.");
 const [e] = await db.select().from(governanceBodyEstablishments).where(and(eq(governanceBodyEstablishments.bodyId, body.id), eq(governanceBodyEstablishments.status, "ESTABLISHED"))).limit(1);
 if (!e) throw fail("Recorded superior establishment authority is required.");
 const superior = await readGoverningBody(p, e.parentBodyId);
 if (superior.status !== "ACTIVE" || !["BOARD", "TRUSTEES"].includes(superior.bodyType) || superior.tenantId !== body.tenantId || superior.legalEntityId !== body.legalEntityId) throw fail("Initial appointment authority must remain active and in the child's tenant/entity/country.");
 const composition = await currentCharterComposition(superior);
 if (!composition.charter || !composition.satisfied) throw fail("Superior appointment authority needs an adopted charter and satisfied composition.");
 const [c] = await db.select().from(governanceCharters).where(and(eq(governanceCharters.bodyId, body.id), eq(governanceCharters.status, "APPROVED"))).orderBy(desc(governanceCharters.version)).limit(1).for("share");
 const [terms] = c ? await db.select().from(governanceCharterTerms).where(eq(governanceCharterTerms.id, c.id)) : [];
 if (!c || !terms) throw new GovernanceError("FORBIDDEN", "No appointment authority exists until the initial charter is superior-approved and readable.");
 if (!c.createdByPartyId || c.authorityBodyId !== superior.id || classificationRank(terms.classification) > classificationRank(classification)) throw fail("A readable superior-approved initial charter covered by the appointment classification is required.");
 const doc = await readBodyDocument(p, body, terms.documentId);
 if (doc.version !== terms.documentVersion || doc.checksum !== terms.documentChecksum || doc.classification !== terms.classification || terms.rules.quorumMinimum !== body.quorumMinimum || terms.rules.majorityRule !== body.majorityRule) throw fail("Initial charter evidence or canonical voting rules changed.");
 return { authorityBodyId: superior.id, initialCharterId: c.id };
}
export async function authorizeAppointmentPresider(p: Principal, bodyId: string, classification: Classification, command: string, plannedActivation = false) {
 const body = await readGoverningBody(p, bodyId);
 const linkage = await appointmentAuthority(p, body, classification);
 if (linkage.initialCharterId && command === "ACTIVATE" && !plannedActivation) throw fail("Initial appointments require atomic composition/body activation; individual activation is forbidden.");
 const authority = linkage.initialCharterId
  ? await authorizeEstablishmentSuperior(p, linkage.authorityBodyId, classification, command, "appointment")
  : await authorizeBodyPresider(p, bodyId, classification, command, "appointment");
 return { ...authority, ...linkage };
}
export async function canManageAppointments(p: Principal, bodyId: string) {
 try { await authorizeAppointmentPresider(p, bodyId, p.clearance, "NOMINATE"); return true; }
 catch (e) { if (e instanceof GovernanceError) return false; throw e; }
}
