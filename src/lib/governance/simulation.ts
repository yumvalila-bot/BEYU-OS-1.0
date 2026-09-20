/** Read-only preflight. Output is never an approval, vote or execution token. */
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { capitalRequests, governanceBodies, governanceMembers, legalEntities, resolutions, resolutionVotes, users } from "@/db/schema";
import { can, clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../authz";
import { ProposeResolutionSchema } from "../governance-contract";
import { GovernanceError, inferMatterTrigger } from "../governance";
import { tenantScopeIds, withTenantDatabaseContext } from "../tenant-scope";
import { evaluatePolicy } from "../policy";
import { hasEffectiveConstitution } from "./constitution";
import { currentCharterComposition } from "./charter-rules";
import { checkBodyCompetence, requiresReservedMatterTreatment } from "./reserved-matters";
import { allEligibleHaveVoted, calculateQuorum, decideResolution, eligibleBallots, isMajorityRule, tallyBallots, votingWindowState, type BallotLine } from "../governance-voting";

export const SimulationSchema = z.object({
  ballots: z.array(z.object({ memberId: z.string().min(1).max(100), vote: z.enum(["FOR", "AGAINST", "ABSTAIN"]) }).strict()).max(1000).default([]),
  additionalRecusals: z.array(z.string().min(1).max(100)).max(1000).default([]),
  assumeVotingConcluded: z.boolean().default(false),
}).strict();

async function calculate(principal: Principal, id: string, input: z.infer<typeof SimulationSchema>) {
  const mode = await db.execute<{ mode: string; isolation: string }>(sql`select current_setting('transaction_read_only') as mode, current_setting('transaction_isolation') as isolation`);
  if (mode.rows[0]?.mode !== "on" || !["repeatable read", "serializable"].includes(mode.rows[0]?.isolation)) throw new GovernanceError("RULE_VIOLATION", "Simulation requires a database-enforced read-only, repeatable snapshot transaction.");
  const scope = await tenantScopeIds(principal);
  const [row] = await db.select({ resolution: resolutions, body: governanceBodies }).from(resolutions)
    .innerJoin(governanceBodies, eq(governanceBodies.id, resolutions.bodyId))
    .where(and(eq(resolutions.id, id), inArray(resolutions.tenantId, scope))).limit(1);
  if (!row || row.body.tenantId !== row.resolution.tenantId || !can(principal, "governance:resolution.read", {
    classification: row.resolution.classification, entityId: row.body.legalEntityId ?? undefined,
  }).allowed) throw new GovernanceError("NOT_FOUND", "Resolution is not visible in your authorized scope.");
  const { body, resolution } = row;
  const category = ProposeResolutionSchema.shape.category.safeParse(resolution.category);
  if (!category.success) throw new GovernanceError("RULE_VIOLATION", "Unknown resolution category cannot be simulated.");
  if (!isMajorityRule(body.majorityRule) || body.majorityRule !== resolution.requiredMajority || !Number.isSafeInteger(body.quorumMinimum) || body.quorumMinimum < 1) throw new GovernanceError("RULE_VIOLATION", "Invalid or inconsistent voting rules cannot be simulated.");
  const now = new Date(), today = now.toISOString().slice(0, 10);
  const members = (await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, body.id)))
    .filter((m) => m.lifecycleStatus === "ACTIVE" && m.appointedOn <= today && (!m.retiredOn || m.retiredOn >= today));
  if (new Set(members.map((m) => m.partyId)).size !== members.length) throw new GovernanceError("RULE_VIOLATION", "Duplicate active party seats require reconciliation.");
  const eligible = members.filter((m) => m.votingRights).map((m) => m.id);
  const stored = await db.select().from(resolutionVotes).where(eq(resolutionVotes.resolutionId, id));
  let ballots: BallotLine[];
  try { ballots = eligibleBallots(stored as (BallotLine & { conflictDeclared: boolean })[], eligible); }
  catch { throw new GovernanceError("RULE_VIOLATION", "Invalid stored ballot evidence."); }
  const forcedRecusals = new Set(ballots.filter((b) => b.vote === "RECUSED").map((b) => b.memberId));
  if (new Set(input.ballots.map((b) => b.memberId)).size !== input.ballots.length || new Set(input.additionalRecusals).size !== input.additionalRecusals.length) throw new GovernanceError("RULE_VIOLATION", "A scenario cannot duplicate voters or recusals.");
  if ([...input.ballots.map((b) => b.memberId), ...input.additionalRecusals].some((memberId) => !eligible.includes(memberId))) throw new GovernanceError("RULE_VIOLATION", "Scenario participants must be currently eligible members of this body.");
  const recused = new Set([...forcedRecusals, ...input.additionalRecusals]);
  if (input.ballots.some((b) => recused.has(b.memberId))) throw new GovernanceError("RULE_VIOLATION", "A simulation cannot erase a recorded conflict or vote on behalf of a recused participant.");
  const effective = new Map(ballots.map((b) => [b.memberId, b]));
  for (const ballot of input.ballots) effective.set(ballot.memberId, ballot);
  for (const memberId of recused) effective.set(memberId, { memberId, vote: "RECUSED" });
  ballots = [...effective.values()];
  const quorum = calculateQuorum({ eligibleMemberIds: eligible, recusedMemberIds: [...recused], quorumMinimum: body.quorumMinimum }, ballots);
  const tally = tallyBallots(ballots);
  const window = votingWindowState({ opensAt: resolution.votingOpensAt, closesAt: resolution.votingClosesAt }, now);
  const votingConcluded = input.assumeVotingConcluded || window === "CLOSED" || allEligibleHaveVoted(eligible, [...recused], ballots);
  const outcome = decideResolution({ majorityRule: body.majorityRule, quorum, tally, votingConcluded });
  const [entity] = body.legalEntityId ? await db.select().from(legalEntities).where(eq(legalEntities.id, body.legalEntityId)).limit(1) : [];
  const [actor] = await db.select().from(users).where(eq(users.id, principal.userId)).limit(1);
  const grants = (await loadGrants(principal.userId, principal.tenantId))
    .filter((grant) => !grant.entityId || grant.entityId === body.legalEntityId);
  const roles = grants.map((g) => g.code);
  const live = { ...principal, roles, permissions: permissionsForRoles(roles), clearance: clearanceForRoles(roles),
    entityScope: grants.flatMap((g) => g.entityId ? [g.entityId] : []), emergencyPermissions: [], delegatedPermissions: [] };
  if (!actor || actor.status !== "ACTIVE" || actor.partyId !== principal.partyId ||
      !(await tenantScopeIds(live)).includes(resolution.tenantId) || !can(live, "governance:resolution.read", {
        classification: resolution.classification, entityId: body.legalEntityId ?? undefined,
      }).allowed) throw new GovernanceError("NOT_FOUND", "Current grants no longer expose this resolution.");
  const policy = await evaluatePolicy({ action: "governance:resolution.approve", entityCode: entity?.code, jurisdictionCode: entity?.countryCode,
    tenantId: resolution.tenantId, roles, classification: resolution.classification, riskScore: principal.riskScore, aiInitiated: actor.isServiceAccount });
  const charter = await currentCharterComposition(body);
  const ownSeat = members.find((m) => m.partyId === principal.partyId);
  const accessContext = { tenantId: resolution.tenantId, entityId: body.legalEntityId ?? undefined, classification: resolution.classification };
  const trigger = resolution.linkedObjectType === "CAPITAL_REQUEST" ? "CAPITAL_ALLOCATION" : inferMatterTrigger(category.data);
  let reserved: { coverage: string; explanation: string; competence?: string; treatment?: string } = { coverage: "NOT_EVALUATED", explanation: "No unambiguous trigger can be inferred; this is not a declaration of non-reservation." };
  if (trigger) {
    let amount: number | undefined;
    let available = trigger !== "CAPITAL_ALLOCATION";
    if (trigger === "CAPITAL_ALLOCATION" && resolution.linkedObjectType === "CAPITAL_REQUEST" && resolution.linkedObjectId && can(principal, "finance:capital.read", accessContext).allowed) {
      const [request] = await db.select().from(capitalRequests).where(and(eq(capitalRequests.id, resolution.linkedObjectId), eq(capitalRequests.tenantId, resolution.tenantId))).limit(1);
      if (request && can(principal, "finance:capital.read", { tenantId: request.tenantId, entityId: request.legalEntityId }).allowed &&
          can(live, "finance:capital.read", { tenantId: request.tenantId, entityId: request.legalEntityId }).allowed) {
        amount = Number(request.amount); available = Number.isFinite(amount) && amount >= 0;
      }
    }
    if (available) {
      const competence = await checkBodyCompetence({ bodyId: body.id, trigger, amount, tenantIds: scope });
      const treatment = await requiresReservedMatterTreatment({ trigger, amount, declaredCategory: resolution.category, tenantIds: scope });
      reserved = { coverage: "EVALUATED_RULES_ONLY", explanation: competence.reason, competence: competence.decision, treatment: treatment.decision };
    } else reserved = { coverage: "NOT_EVALUATED", explanation: "A readable persisted capital amount is required; no client-supplied amount or currency assumption is accepted." };
  }
  return {
    mode: "READ_ONLY_SIMULATION" as const, authorityGranted: false as const, approvalGranted: false as const, executionPermitted: false as const,
    observedAt: now.toISOString(), resolutionId: id,
    source: { status: resolution.status, window, entityId: body.legalEntityId, countryCode: entity?.countryCode ?? null,
      recordedTally: { for: resolution.votesFor, against: resolution.votesAgainst, abstain: resolution.votesAbstain } },
    assumptions: { votingConcluded: input.assumeVotingConcluded, substitutedBallots: input.ballots.length, additionalRecusals: input.additionalRecusals.length },
    hypothetical: { quorum, tally, outcome: outcome.outcome, explanation: outcome.explanation, threshold: outcome.threshold },
    checks: {
      constitutionEffective: await hasEffectiveConstitution(), bodyActive: body.status === "ACTIVE", entityActive: !!entity && entity.status === "ACTIVE" && scope.includes(entity.tenantId),
      activeHuman: !!actor && actor.status === "ACTIVE" && !actor.isServiceAccount && actor.partyId === principal.partyId,
      mfaSatisfied: principal.mfaSatisfied,
      actorHasCurrentVotingSeatAndPermission: !!ownSeat && ownSeat.votingRights && !recused.has(ownSeat.id) && can(principal, "governance:resolution.vote", accessContext).allowed && can(live, "governance:resolution.vote", accessContext).allowed,
      actorHasCurrentPresidingSeatAndPermission: !!ownSeat && ["CHAIR", "SECRETARY"].includes(ownSeat.seatRole) && !recused.has(ownSeat.id) && can(principal, "governance:resolution.approve", accessContext).allowed && can(live, "governance:resolution.approve", accessContext).allowed,
      charterCoverage: charter.coverage, charterSatisfied: charter.satisfied,
      approvalPolicyEffect: policy.effect, undischargedPolicyObligations: policy.obligations.length,
      reservedMatters: reserved,
      delegation: "NOT_EVALUATED_NO_DELEGATED_AUTHORITY_GRANTED", approvalChain: "NOT_EVALUATED_NO_APPROVAL_GRANTED", countryGrants: "NOT_MODELLED_ENTITY_COUNTRY_POLICY_ONLY",
    },
    limitations: ["Hypothetical results are not authoritative; all real mutations must independently reauthorize.", "Current membership is used, never a rewrite of an historical decision.", "Policy observations use the source entity/country; independent country grants, delegation instruments and full approval chains are not certified.", "Database READ ONLY prevents state, ballots, audit/event, task or notification writes in the simulation service."],
  };
}

export async function simulateResolution(principal: Principal, id: string, raw: unknown) {
  const input = SimulationSchema.parse(raw);
  const read = () => withTenantDatabaseContext(principal, () => calculate(principal, id, input));
  // Never escape an enclosing transaction. Refuse it unless already READ ONLY.
  if (hasDatabaseTransactionContext()) return read();
  return db.transaction(read, { accessMode: "read only", isolationLevel: "repeatable read" });
}
