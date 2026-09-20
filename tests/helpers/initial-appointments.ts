import { initialCharterFixture } from "./initial-charters";
import { createBodyCharter, commandBodyCharter } from "../../src/lib/governance/charter-service";
import { decideResolutionClosure } from "../../src/lib/governance-vote-service";
import { asAppointmentActor as as } from "./appointments";
import { charterFixtureRules, concludedCharterBallot } from "./charters";
export const initialAppointmentContext = { traceId: "INITIAL_APPOINTMENT_PROOF" };
export async function approveInitialCharter(f: Awaited<ReturnType<typeof initialCharterFixture>>) {
 const ctx = initialAppointmentContext;
 const c = await as(f.chair, () => createBodyCharter(f.chair, f.childId, { documentId: "DOC_D4", purpose: "Superior-reviewed initial committee composition terms", rules: charterFixtureRules }, ctx));
 await as(f.chair, () => commandBodyCharter(f.chair, f.childId, c.id, { command: "SUBMIT", expectedRevision: 1, note: "Review initial composition terms" }, ctx));
 const resolutionId = await concludedCharterBallot(c.id);
 await as(f.chair, () => decideResolutionClosure(f.chair, { resolutionId }, ctx));
 await as(f.secretary, () => commandBodyCharter(f.secretary, f.childId, c.id, { command: "ADOPT", expectedRevision: 2, resolutionId, note: "Approve without effectiveness or membership" }, ctx));
 return c.id;
}
export async function initialAppointmentFixture(prefix: string) {
 const f = await initialCharterFixture(prefix);
 return { ...f, initialCharterId: await approveInitialCharter(f) };
}
