# Governance continuation — appointment and dormant-body checkpoint

## Scope and revision identity

**The requested governance mission is still partial.** This checkpoint covers the
bounded appointment acceptance work, superior-authorized dormant committee
establishment, and shared resolution linkage/retry corrections. It does not certify
an active-body bootstrap or the complete meeting/membership lifecycle.

- Session branch: `arena/01a0bda3-beyu-os-1-0`.
- Resumed START: `08ba14688b27f12735b5af2b5db2114141c94579`.
- Tested application END: `c244caa17f0bd4cfe98ffe5108752eb998955f9c`.
- Subsequent checkpoint changes are documentation only; this application SHA is
  the source of the build, complete suite and browser evidence below.

| Commit | Change |
| --- | --- |
| `863a3380309d66ca9e215a2734635d4ffae32789` | Reject ended-term appointment acceptance; expand authority/SQL/browser matrix |
| `4652f006bd8e51148ff59a13ca13e05938e6547c` | Superior mandate for exact dormant committee establishment; additive0052 |
| `6eb3d34b5dbb5098d115cce22636a4345e6a90f0` | Correct six exact migration-inventory assertions from52 to53 |
| `081ebdd3569dc9ee6c31be85d212d98f30966eb3` | Shared proposal links and uncertain-response recovery |
| `c244caa17f0bd4cfe98ffe5108752eb998955f9c` | Retain retry identity through real in-flight409 responses |

## Implemented and tested boundaries

- Appointment nomination, independent approval, nominee consent and activation
  remain separate governed operations. Ended-term consent is now rejected.
- Activation creates authoritative membership with audit/event history, not RBAC,
  security capability, Finance capability or delegated authority.
- Current presiding authority, constitutional authority, instrument evidence,
  exact decision provenance, scope, composition and conflicts are rechecked.
- Establishment requires an active, chartered superior BOARD/TRUSTEES and an exact
  RESERVED_MATTER decision with independent approval. It creates only a canonical
  **DRAFT COMMITTEE**, in the derived tenant/entity, with no initial membership.
- Existing body UPDATE/DELETE, membership and finalized-decision protections
  remain.0052 adds only the constrained body INSERT path and immutable proposal
  history, with FORCE RLS and deferred exact-body pairing.
- The shared resolution form now authors exact nomination/charter/establishment
  links. Linkage itself grants no authority and creates only a DRAFT resolution.
- Form retries retain the same payload-bound key after all non-success responses.
  Three browser cases use real409 responses twice, then a real commit with a lost
  response, and finally replay: four requests, one key, one canonical DRAFT,
  no nominee membership, persisted after reload. Test-only release applies solely
  to a demonstrably unexecuted fixture claim; runtime uncertain claims stay closed.

### Acceptance evidence map

Paths below are relative to `tests/`; complete-run results are recorded separately.

| Requirement | Evidence |
| --- | --- |
| Nomination, independent approval, nominee-only consent, activation | `governance/appointments.test.ts`, `governance/appointment-http.test.ts`, `browser/governance-appointment.spec.ts` |
| Duplicate/concurrent activation, overlap, unchanged unrelated memberships/RBAC/Finance | `governance/appointment-adversarial.test.ts`, `governance/appointments.test.ts` |
| Expired/revoked authority, wrong body/entity/country, instrument drift | `governance/appointment-adversarial.test.ts`, `browser/governance-appointment-denials.spec.ts` |
| Provenance, insufficient ballots, conflict/recusal, ended-term acceptance | `governance/appointment-adversarial.test.ts` |
| Rollback, audit, correlation/causation, notification atomicity | `governance/appointments.test.ts`, `governance/appointment-adversarial.test.ts` |
| Actual non-owner RLS and unchanged body/member/finalized-record denials | `security/appointment-rls.test.ts`, `security/governance-rls.test.ts` |
| Superior-body establishment, independent mandate, duplicate/concurrent/rollback | `governance/body-establishment.test.ts`, `governance/body-establishment-http.test.ts` |
| Establishment SQL scope/classification/transition/insertion/deferred constraints | `security/body-establishment-rls.test.ts` |
| Establishment UI and persisted dormant-body result | `browser/governance-establishment.spec.ts` |
| Exact linked proposal and in-flight/lost-response recovery | `browser/governance-proposal-links.spec.ts` |

The appointment service does not invent a separate acceptance TTL. The tested
expiry rule is the immutable appointment term and live authority validity.

## Validation results

All of the following are **local evidence**, not remote CI certification.
No application/test source changed during the final complete run.

| Final c244caa check | Result |
| --- | --- |
| Complete PostgreSQL/HTTP/Vitest suite | **4348 passed,11 existing skips**;239 files passed/3 skipped;946.69s |
| Entire Chromium browser suite | **28 passed**,9.3m; no skipped browser cases |
| Exact CI DB-free release command | **182 passed,6 expected DB-dependent skips**,3.62s |
| Build without runtime/database secrets | **PASS**, explicitly observed exit0 |
| Typecheck | **PASS** |
| Lint | **0 errors**,1 pre-existing image warning |
| Committed application-tree secret scan | **PASS**,2041 tracked files |
| Migration integrity including database ledger | **PASS**,53 migrations;14 acknowledged historical debts;0 blockers |
| Schema drift | **PASS**,0 blocking differences |

Ignored local evidence: `tmp/governance/body-c244caa-{suite,browser,build,typecheck,
lint,secrets,integrity,drift,release-db-free}.log`. Failures and earlier-source logs
remain separate. The documentation checkpoint is rescanned before commit.

Migration evidence covers an empty database with all **53 migrations**, constrained
runtime provisioning/seed, upgrade from0051, no-op replay, and integrity-with-ledger.
The same14 historical metadata debts are acknowledged; none was regenerated away.
Schema drift reports **0 blocking differences,149 informational SQL-managed
objects**.0048–0051 SQL checksums remain unchanged. The new migration is
`drizzle/0052_governance_body_establishments.sql` with corresponding metadata.

Failed probes were retained and repaired, not removed or weakened:

1.4652f00 full run:4342 passed/6 failed/11 skipped. The six failures were stale exact
  migration counts. The CI DB-free command reproduced the same release failure.
  Corrected assertions remain exact53 and reject the stale baseline.
2. Initial link-browser probes timed out on ambiguous select labels. Explicit
  accessible names fixed the UI without relaxing exact-name selectors.
3. Real in-flight retry reproducer: attempt2 rotated to a second key and returned201
  instead of409. The final fix preserves the original key on every non-success.
4.081ebdd complete PostgreSQL/HTTP run passed4348 tests/11 skips in920.10s. Its
  browser stage was interrupted for the new in-flight reproducer; it is not counted
  as a complete browser pass or substituted for final-source evidence.

## GitHub reconciliation and external boundary

At **14:11UTC on2026-09-20**, the final main fetch failed with credentials
unavailable/terminal prompts disabled; PR77 and root-run queries returned
**HTTP401 Bad credentials**. GitHub must be reconnected in Arena. No credentials
were requested or stored in chat.

- Last successfully fetched main: `5ac90f2cc712582bde45cc0f2616937d856a6f71`.
  Current remote main cannot be verified or reconciled until authentication works.
- PR77 was last observed **OPEN/DRAFT**, at
  `4652f006bd8e51148ff59a13ca13e05938e6547c`.
- That SHA is the last successfully pushed application revision. Inventory/UI/
  in-flight corrections are committed locally but their push/PR refresh and CI
  remain unverified. A fresh CI run must test the corrected source after reconnect.
- Only remote operations are externally blocked. The engineering gaps below are
  not reclassified as external blockers or human approvals.

Previously observed CI remains source-specific:

-863a338: root35510280309 and scratch35510280306 **SUCCESS**.
-4652f00: scratch35511965800 **SUCCESS**; root35511965796 P3 DB-free job
  **FAILED**. Root's overall final conclusion was not successfully retrieved.
- No successful remote CI is claimed for the local correction commits.

## Remaining engineering work — not external blockers

**P1:** consent-backed initial composition and superior child-charter/ACTIVE
bootstrap; vacancy recovery; full suspension/dissolution/archive; renewal,
resignation/removal and succession; formal seat, competency and independence
models. Current seat labels and dated memberships are not this full capability.
The nomination party-identity snapshot limitation remains documented in the audit.

**Meeting/P2:** the full linked meeting→notice→invitation→acknowledgement→agenda→
papers→attendance→quorum/conflict→deliberation→motion→vote→resolution→minutes chain;
shared calendar, delivery/acknowledgement/escalation, evaluation and reporting.
Generic in-app notices do not constitute those workflows.

**Execution:** bounded action→implementation evidence→independent verification→
closure exists. Aggregate certification, reassignment, cancellation, exceptions and
post-verification corrections remain incomplete.

**P3:** existing preflight is nonmutating and non-authorizing, not complete legal,
delegation-chain or approval-chain certification. Full simulation, maturity,
analytics and justified advanced assistive intelligence remain future work.

BEYU OS remains one Constitutional Control Plane + Enterprise Operating Kernel +
Governed Intelligence Layer. No new OS, self-authorizing Noelia/HIVE path, Finance
activation or production promotion was introduced. Merge, legal ratification and
production promotion remain human-controlled.

Detailed chronology: [X10THINK audit](X10THINK_2026-09-20_AUDIT.md).
Implementation boundaries: [body establishment](BODY_ESTABLISHMENT.md),
[appointments](APPOINTMENTS_AND_TERMS.md).
