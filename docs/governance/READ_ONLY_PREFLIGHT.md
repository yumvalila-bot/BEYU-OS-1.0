# Read-only governance preflight

Status: **IMPLEMENTED bounded preflight / PARTIAL comprehensive simulation**.
This is a shared BEYU OS control-plane capability, not a new OS or authority engine.

## Contract and entry points

- `POST /api/v1/governance/resolutions/:id/simulation`
- `src/lib/governance/simulation.ts`
- The **Read-only governance preflight** disclosure on each visible resolution in
  `/os/governance`.
- Existing `governance:resolution.read`, authenticated server Principal, explicit
  tenant subtree, body/entity scope and resolution classification. The UI uses
  a relative URL; it cannot supply tenant, actor, authority, threshold or outcome.

The strict JSON input permits only:

```json
{
  "ballots": [{ "memberId": "EXISTING_ELIGIBLE_MEMBER_ID", "vote": "FOR" }],
  "additionalRecusals": [],
  "assumeVotingConcluded": false
}
```

Ballots can be FOR, AGAINST or ABSTAIN. Substitution affects only this calculation.
Duplicate, unknown, inactive, non-voting or recused participants are rejected;
recorded conflicts and recusals cannot be removed. Empty input compares the
currently readable ballots using current membership. Malformed JSON is rejected,
not silently interpreted as an empty scenario. The first UI is intentionally a
manual JSON editor, not a complete scenario designer.

## Non-authority and database boundary

Every successful result includes these literal invariants:

- `mode: READ_ONLY_SIMULATION`
- `authorityGranted: false`
- `approvalGranted: false`
- `executionPermitted: false`

The hypothetical arithmetic outcome is separate from stored status and tally.
Even an arithmetic APPROVED result is **not an approval**, a historical decision
reconstruction, an authorization token or a valid execution prerequisite.

The service starts a PostgreSQL **READ ONLY, REPEATABLE READ** transaction on the
canonical context-aware application connection. It never opens a second pool or
escapes an ambient transaction. An inherited transaction must already be read-only
and repeatable-read or serializable; writable/read-committed inheritance is refused.
The same scoped connection reads the resolution, body, members, ballots and checks.
Existing FORCE RLS policies remain in force; no migration, grant, bypass or policy
relaxation is introduced.

The service cannot write resolutions, ballots, tasks, approvals, Finance state,
audit events, enterprise events or notifications. It intentionally has no
idempotency claim or business event: there is no business transition to record.
The normal authentication/rate-limit/security-denial boundary remains in place;
a denied API authorization can still produce its existing security audit. This is
not an attempt to suppress security logging. Rate limit: 20 requests/minute/user
for this action. Results are fresh observations, not replayable certificates.

## Reuse and coverage

The implementation uses the canonical `governance-voting.ts` engine. Absolute
quorum is never reduced by recusals. Stored majority/quorum/category inconsistencies
fail closed. Current, date-valid distinct party seats determine the electorate;
current non-expired grants, clearance and entity scope are rechecked for the reader.

Reported observations include the effective constitutional foundation, active
body/entity/human, MFA, current voting/presiding seat and permission, adopted charter
composition, approval-policy effect and undischarged obligations. These are separate
observations, **not an aggregate eligibility certificate**. Policy inputs use the
source entity/country and service-account flag; no AI authority is introduced.

Reserved-matter observations are conditional: only an unambiguous trigger and a
readable persisted amount can support the existing rule evaluation. Capital data
must satisfy both source visibility and actual request-entity permission checks.
Client amounts are never accepted. This is the existing numeric reservation-rule
evaluation, not independent currency normalization or legal interpretation. An
unavailable trigger/amount is explicitly
NOT_EVALUATED, never treated as proof of non-reservation.

## Explicit gaps

- Full delegation and approval chains: NOT_EVALUATED; no authority or approval
  granted. Revocation/expiry must still be checked by the real mutation service.
- Independent country-grant axis: NOT_MODELLED; entity-country policy context only.
- Attendance, notices, motions, agenda, papers and minutes cannot be simulated as
  completed shared workflows because those workflows are not yet implemented.
- Composition is an observation, not legal independence/competency certification.
- No broad scenario persistence, named scenario comparison, meeting forecast,
  historical electorate replay, Noelia tool registration or autonomous execution.
- No constitutional/legal ratification or CAP_POSTING activation. Real mutations
  must independently enforce current identity, authority, scope, policy, quorum,
  conflict, approval, evidence and verification controls.

These are engineering gaps, not external blockers.

## Validation

Initial focused validation on 2026-09-20: 16 service/integration tests, 3 real HTTP
tests against the non-owner application runtime, and 1 Chromium browser test
passed. Service tests explicitly switch to the NOBYPASSRLS/NOSUPERUSER runtime role;
fixtures alone use administrator access. Coverage includes database read-only
write rejection, ambient-transaction refusal, unchanged ballots/state/audit/events,
quorum/recusal, concurrent opposing scenarios, malformed/forged inputs, scope
isolation, expired live grants and unknown categories. Build/typecheck/lint passed
(0 lint errors; the existing Noelia image warning remains).

Completed corrected full-suite validation of source `dc66969`: **4276 passed,
11 skipped**, 232 files passed / 3 skipped, **868.84 seconds**. The 11 skips are the
existing bootstrap enrollment/foundation/preparation cases, not skipped simulation
or transport tests. Complete Chromium regression: **13 passed in 2.1 minutes**.
No test assertion was weakened. The disposable database-name configuration fix is
now covered by a successful complete run, not just its focused rerun.

The source commit was pushed to PR77. Its CI runs35504744854/35504744855 started,
but subsequent GitHub access returned HTTP401. Their final outcomes are **not
verified**. Charter f31e46b root35503257334 and scratch35503257355 were observed
successful before access expired. See the continuation evidence below the reality
matrix for the precise boundary; local success is not substituted for CI success.
