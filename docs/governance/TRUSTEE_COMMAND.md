# Trustee Command — constitutional authority surface

**Status:** implemented, read-only, advisory
**Route:** `/os/family/trustee-command`
**API:** `GET /api/v1/family-office/trustee-command?trustEntityId=…`
**Capability:** `familyoffice:trust.read` (existing — no new permission)
**Code:** `src/lib/family/trustee-command.ts` (pure model), `src/lib/family/trustee-command-service.ts` (composition), `src/app/os/family/trustee-command/page.tsx`, `src/app/api/v1/family-office/trustee-command/route.ts`

---

## 1. What this replaces

A "Trustee Command" dashboard already existed inside the **Health OS sector SPA**
(`sectors/health/src/views/Governance.tsx`, selected by the `trustee` demo role in
`sectors/health/src/data/mock.ts`). It presented:

* three hard-coded trustees (`EMP-10001 … EMP-10003`, "Founding Trustee · Chair");
* hard-coded resolutions (`TR-2026-03`, `TR-2026-04`);
* hard-coded "matters awaiting trustee review".

None of it was data. Any viewer who picked the demo role saw it, inside a sector
surface that has no authority over the Family Trust. The upgrade keeps the idea
(a trustee-facing constitutional surface) and replaces the contents with a real
composition of registers that already own the facts.

The sector demo view is untouched — it is a sector demonstration, and no
control-plane file imports it. The new suite asserts that the demo identities
(`EMP-1000x`, `TR-2026-0x`) never appear in control-plane source or output.

## 2. What it shows, and where each value comes from

| Panel | Source of truth |
|---|---|
| Trust identity (name, code, jurisdiction, currency, status) | `legal_entities` (the trust is a legal entity — no parallel store) |
| Trustee office and quorum | `entity_appointments` (role `TRUSTEE`, current only) + `governance_bodies` (`TRUSTEE_BOARD` quorum/majority) |
| Reserved-matter review map | `governance_bodies.reserved_matters` ∪ `trust_decisions` |
| Instruments | `trust_instruments` |
| Provisions & legal effect | `trust_provisions` |
| Distribution posture | `trust_distributions` |
| Enterprise map | `legal_entities.parent_entity_id` hierarchy beneath the trust |
| Financial posting state | `governance_capability_registry` (`CAP_POSTING`), reported as the activation gate answers |
| Authority rails | `src/lib/family/model.ts` (superior instruments, decision gate, `LAST_AI_PERMITTED_STEP`) |

Nothing is computed from a preference, a query parameter or a cookie.

## 3. Honesty rules (the reason this is not another demo)

1. **A matter with no governed record type says so.** `TRUST_AMENDMENT`,
   `TRUST_INVESTMENT`, `BENEFICIARY_DETERMINATION` and `TRUST_PROTECTOR_EXERCISE`
   have no persisted trustee-decision type in the schema. They report
   `NOT_INSTRUMENTED` rather than borrowing an unrelated decision type.
2. **Absent data is absent.** The seeded database contains **zero** trustee
   appointments. The surface therefore states "no current trustee appointment
   resolves in the canonical registry" and quorum *not met*. It does not invent
   three founding trustees to fill the table.
3. **Enforceability is never assumed.** Provisions without a ratified
   legal-effect reference are counted `INERT`; a row with
   `enforceability_assumed = true` is surfaced as a remediation defect, never
   silently hidden.
4. **A distribution is a decision record, not a payment.** Executed records with
   no `finance_record_ref` are reported as awaiting Finance OS.
5. **Trustee ≠ permission.** `TrusteeBinding.appointmentIsNotPermission` is a
   structural literal, and the page guard is `familyoffice:trust.read`, not
   "are you a trustee?".

## 4. Boundary

```
advisoryOnly: true
executesNothing: true
grantsAuthority: false
```

* No vote, approval, appointment, removal, distribution or payment is executed
  here. There is no form, no button that mutates, and no server action.
* The API is **GET-only**. `POST` returns 405 — verified at the HTTP boundary.
* Every consequential act stays in `trust-governance-service.ts`
  (`/api/v1/family-office/trust`) or the governance engine (resolutions).
* `CAP_POSTING` remains LOCKED and is *reported*, not reachable.
* The page contains no `.insert/.update/.delete` and does not import the
  database handle for writes.

## 5. Scope rules

* The trust is resolved from the principal's canonical tenant scope, never from
  the URL. An out-of-scope id and a non-existent id give the same answer (404),
  so the surface cannot enumerate trust identities.
* An **entity-scoped** grant is refused (`TRUSTEE_COMMAND_ENTITY_SCOPE_UNSUPPORTED`)
  rather than widened: the governing bodies, resolutions and appointment reads
  this surface composes do not all carry legal-entity keys, so partially
  honouring such a grant would leak tenant-wide governance. This mirrors the
  canonical `guarded()` rule for `familyoffice:*`.
* Declaration is a second dimension: only rows at or below the principal's
  clearance are read (`HIGHLY_RESTRICTED` is the default on every trust table).

## 6. Certification

| Suite | What it proves |
|---|---|
| `tests/frontend/trustee-command.test.ts` (28) | Capability entry is in Family Office domains, never an OS, adds no permission, visibility matches the grant; page/API/service are write-free and GET-only; reserved-matter derivation, INERT provisions, distribution/finance separation, quorum, enterprise tree, CAP_POSTING reporting; demo identities absent. |
| `tests/family/trustee-command-http.test.ts` (6) | 401 unauthenticated, 403 without the grant, redirect on the page, full model for the grant holder, real surface (no demo dashboard), 405 on POST. |

Run:

```bash
npx vitest run tests/frontend/trustee-command.test.ts
BEYU_TEST_BASE_URL=http://127.0.0.1:3100 npx vitest run tests/family/trustee-command-http.test.ts
```
