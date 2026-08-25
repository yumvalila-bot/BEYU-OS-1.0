# NOELIA — Capability Complete

**Date:** 2026-08-25 · **Gate: 🟢 GREEN (implementation) / ⚪ BLOCKED (production deployment)**

**Machine-readable:** `noelia-capability-completeness-matrix.json`

## 1. Executive Intelligence (§III)

- Executive briefings with the full structured contract (engine, analysis
  type, horizon, headline, summary, findings, evidence, sources, metrics,
  assumptions, uncertainty, limitations, confidence, observed/derived/
  forecast/scenario, recommendations, alternatives, risks,
  what-would-change, human-review flag, denied sources, tools, latency,
  policy decision, trace/correlation IDs).
- Six horizons (H1 IMMEDIATE … H6 100-YEAR CONTINUITY) as **metadata only**;
  horizons never convert into authority levels.
- New this audit: `structure` (BOARD/EXECUTIVE/OPERATIONAL — presentation
  metadata), `enterprisePosition`, `strategicVariance`, `kpiInterpretation`,
  `materialItems` (candidate signals; determination remains governance),
  `opportunities` (only what registered capabilities report), and
  `recommendationComparison` (option/alternative/trade-off/condition derived
  from source evidence). Tool-emitted structured recommendations are now
  adopted verbatim into the briefing.
- Cross-domain executive synthesis via `CROSS_DOMAIN_CORRELATION` and the
  cross-OS tool.

## 2. Enterprise Analytics (§IV)

20 governed types — KPI, TREND, VARIANCE, ANOMALY, FORECAST, SENSITIVITY,
SCENARIO_COMPARISON, STRESS_TEST, CONCENTRATION, LIQUIDITY, PERFORMANCE,
WORKFORCE, COMPLIANCE, RISK, CAPITAL, **GOVERNANCE** (new), and
CROSS_DOMAIN_CORRELATION, STRATEGIC_VARIANCE, OPPORTUNITY_DETECTION, EARLY_WARNING. All numeric measures come from the canonical
specialist engines (treasury/risk/FP&A/forecast) with tenant/entity/country/
classification pushdown; no engine is duplicated.

## 3. Finance OS (§V) / HCM (§VI) / Health (§VII)

- Finance: observe/analyze/compare/forecast/identify/recommend/explain only.
  No autonomous journal posting, approval, capital movement, policy/FX/tax/
  period/waterfall/ownership alteration — all REQUIRES_AUTHORITY, no code path.
- HCM: headcount/turnover/trends/org/workforce risk/capacity/cost/succession
  intelligence over the canonical employee master; no hire/terminate/promote/
  demote/compensation/status changes — human-authorized only.
- Health: fail-closed boundary. No canonical source → UNAVAILABLE. Sample
  data, snapshots and registry entries are never clinical truth. Adapter
  pattern is ready for a future governed integration.

## 4. Tax + Legal (§VIII)

FACT → INFERENCE → ANALYSIS → RECOMMENDATION → REQUIRES_AUTHORITY; unknown
jurisdiction/authority fails closed; Noelia is never presented as lawyer, tax
authority, court, regulator or statutory decision-maker; retrieved content is
DATA, never SYSTEM AUTHORITY.

## 5. RAG (§IX) + Memory (§X)

- Governed keyword retrieval with the full provenance envelope
  (authority/jurisdiction/tenant/entity/country/classification/effective/
  review/expiry/supersession). Semantic retrieval explicitly BLOCKED — no
  fake vectors.
- 12 memory classes (SESSION, WORKING, TASK, USER, ORGANIZATIONAL,
  ENTERPRISE (new), TENANT, SECTOR, GOVERNANCE, STRATEGIC, INSTITUTIONAL,
  LONG_TERM_CONTINUITY). Every durable object carries owner/tenant/entity/
  country/classification/provenance/confidence/authority/created/effective/
  expiry/supersession/retention/legal hold/deletion policy/audit. AI-written
  memory is UNVERIFIED until governed.

## 6. Workflows (§XI) + Approvals (§XII)

PLAN→VALIDATE→AUTHORIZE→EXECUTE→VERIFY→COMPLETE with maker/checker,
idempotency, replay protection, crash recovery, re-checked authorization,
tenant/entity/country/classification/policy gates, audit, events, failure and
dead-letter evidence. Approval substrate now includes **quorum (distinct
approvers)**, **decision expiry (validUntil)**, **delegation evidence
(delegatedFrom)**, SLA (slaDueAt), amount/risk/classification/jurisdiction/
entity/sector gates. Thresholds are POLICY REQUIRED and fail closed; the
requester can never approve their own workflow; an approval record is never
authority by existence.

## 7. Scheduler (§XIII) / Cross-OS (§XIV) / Model (§XV)

- OUTBOX→CONSUMER→WATERMARK→idempotent execution→audit→event→recovery with
  dead-letter and exactly-once business semantics.
- Cross-OS: 12 domains, independent per-domain authorization, unregistered
  domains UNAVAILABLE, cross-tenant DENY.
- Tool registry: every one of the 30 registered capabilities carries the full
  governed contract (stableId, version, owner, domain, permission,
  classification, risk, approver-role, Zod input/output schemas, side-effects,
  idempotency, timeout, retry, jurisdiction, entity, audit requirements);
  handler output is validated against the declared Zod output contract after
  execution (OUTPUT_INVALID fails closed); unknown tools always DENY.
- Model gateway: full metadata contract incl. latency/fallback/effective/
  retired; external providers DENY until ratified.

## 8. Explicit non-capabilities (no fabrication)

Semantic retrieval (BLOCKED) · external providers (BLOCKED) · Health clinical
data (UNAVAILABLE) · production chain (BLOCKED) · autonomous mutations and
cross-tenant aggregation (REQUIRES_AUTHORITY, no code path) · approval
thresholds (POLICY REQUIRED).
