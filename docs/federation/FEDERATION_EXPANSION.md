# BEYU Federation & Trust — Expanding to a new jurisdiction

The core is jurisdiction-generic. Adding a country, bloc or institution is **data
(profile + inventory) only** — no change to the federation core, the engine, the
security model or the deployment.

## What is data vs. what is core

- **Core (never forked, never per-country):** lifecycle, guards, capability
  negotiation, consent, reconciliation, coverage, monitoring, all 20 tables, RLS, RBAC,
  the API, the UI. One implementation, shared by every jurisdiction and every Sector OS.
- **Data (per jurisdiction, in `src/db/federation-data/`):** the jurisdiction profile,
  the domain taxonomy, the authority inventory, the services, the legal bases and the
  capability availability rows. Tanzania lives entirely in `tz-*.ts`; the core does not
  hard-code `TZ`.

## Steps to onboard a jurisdiction (e.g. Kenya)

1. **Profile** — add a `federation_jurisdictions` row: `kind`
   (COUNTRY / REGIONAL_BLOC / INTERNATIONAL / PRIVATE_INSTITUTION), `status` (start
   `PROPOSED`), data-residency rules, integration regime, cross-border interfaces.
   This is what capability negotiation and transitions read.
2. **Domain taxonomy** — register the jurisdiction's domains in
   `federation_domains` (reuse the shared domain codes where they map; add new ones
   where they don't).
3. **Authority inventory** — structured seed data (data only, no connectors, no
   credentials, no claims). Every record lands in fail-closed states:
   `REGISTERED`/`CLASSIFIED`, verification `REGISTERED`, cost `UNKNOWN_COST`,
   GovESB-or-equivalent `*_UNKNOWN`, reconciliation `PENDING_RECONCILIATION`.
   Uncertain identity → `record_status UNCERTAIN` with a note, never invented.
4. **Services** — per-authority service records with `data_classification`,
   consent/agreement/cost requirements, all defaulted fail-closed.
5. **Legal bases** — the statutes/regulations that justify each data flow
   (`DRAFT` until CONFIRMED by the governed path).
6. **Capability availability** — per-capability rows (availability, legal-basis ref,
   connector ref, data residency, cost status, human-approval flag). Unknown →
   `NOT_IMPLEMENTED`/`NOT_CONFIRMED`, which makes cross-jurisdiction plans BLOCKED
   rather than optimistic.
7. **Reconcile** — run the reconciliation engine against the official directory for the
   jurisdiction; record the run + results. Until a live official extract is available,
   reconcile against a documented baseline with `liveVerified: false` and
   count-level deltas as `MANUAL_REVIEW`.
8. **Coverage + public-access reports** — extend the coverage audit for the new
   jurisdiction and emit its reports.

## Guardrails that make expansion safe

- **No fake integrations.** A new jurisdiction ships with zero connectors, zero LIVE,
  zero FREE_CONFIRMED and zero `*_LIVE` GovESB-equivalent states. The CHECK
  constraints and the engine reject unsupported promotions regardless of jurisdiction.
- **No core fork.** There is no "Kenya federation core" or "Kenya GovESB engine" —
  the shared engine reads the new jurisdiction's profile rows.
- **Consent/access/approval unchanged.** The same tenant/entity isolation,
  classification ceilings, purpose limitation, SoD and human-gated production rules
  apply to every jurisdiction automatically.
- **Cross-border is explicit.** Moving a subject/organization from one jurisdiction to
  another goes through `negotiateCapabilities`, which flags residency, legal-basis,
  consent, agreement, local-entity and human-approval blockers per destination
  capability. Origin capabilities never carry over.
- **Private institutions** (banks, insurers, payment operators) are **not** government
  authorities and are not seeded into the authority inventory; they are supervised by
  the relevant regulators and are represented via agreements/legal bases where a data
  flow is governed.

## What "expansion-ready" means here

The architecture supports any future country/bloc/institution without forking the core.
Today the repo ships Tanzania as the first profile. Expansion is a governed data
onboarding task with the same evidence gates — not a new system.
