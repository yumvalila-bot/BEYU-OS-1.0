import { proposeBodyEstablishment, commandBodyEstablishment } from "../../src/lib/governance/establishment-service";
import { establishmentFixture, establishmentInput, establishmentBallot, asEstablishmentActor as as } from "./establishments";
export const initialCharterContext = { traceId: "INITIAL_CHARTER_PROOF" };
export async function initialCharterFixture(prefix: string) {
 const f = await establishmentFixture(prefix), ctx = initialCharterContext;
 const proposal = await as(f.chair, () => proposeBodyEstablishment(f.chair, f.bodyId, establishmentInput(), ctx));
 await as(f.chair, () => commandBodyEstablishment(f.chair, f.bodyId, proposal.id, { command: "SUBMIT", expectedRevision: 1, note: "Review initial committee establishment" }, ctx));
 const resolutionId = await establishmentBallot(proposal.id, f.chair);
 await as(f.secretary, () => commandBodyEstablishment(f.secretary, f.bodyId, proposal.id, { command: "APPROVE", expectedRevision: 2, resolutionId, note: "Independent superior establishment approval" }, ctx));
 const established = await as(f.secretary, () => commandBodyEstablishment(f.secretary, f.bodyId, proposal.id, { command: "ESTABLISH", expectedRevision: 3, note: "Create dormant committee without membership" }, ctx));
 return { ...f, childId: established.bodyId!, establishmentId: proposal.id };
}
