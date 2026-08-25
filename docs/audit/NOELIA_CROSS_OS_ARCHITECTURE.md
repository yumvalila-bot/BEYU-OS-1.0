# NOELIA — Cross-OS Intelligence & Model Gateway / HIVE

**Status:** IMPLEMENTED (cross-OS + registry) · BLOCKED (external model providers)

## Cross-OS intelligence (section K)

`cross.os.intelligence` (stableId `cap-cross-os-intelligence`, `ai:analytics.read`):

- Requested domains: FINANCE, HCM, RISK, COMPLIANCE, GOVERNANCE, TAX, LEGAL
  (min 2, max 6 — strict Zod).
- **Each domain is independently authorized**: the capability holder must
  hold that domain's own permission (`finance:treasury.read`,
  `hcm:employee.read`, …) — possessing one permission never implies another.
- Each domain's tool is invoked through the registry (full
  RBAC/ABAC/scope/jurisdiction gates re-run per domain).
- Denied domains are reported (`denied` metadata + humanReviewRequired) —
  denial is evidence, not silence.
- **Cross-tenant aggregation is DENY by default**: the scope resolver never
  mixes tenants; every query carries tenant predicates; RLS is defence in
  depth.
- Cross-OS intelligence never implies cross-OS authority: outputs are
  tagged INFERENCE/RECOMMENDATION with per-domain provenance.

## Model Gateway (section X / 19)

`model.registry.read` (`ai:model.registry.read`, PLATFORM_ADMIN-owned) over
`model_registry`:

| Field | Purpose |
|---|---|
| provider/model/version (unique) | approved identity |
| classification | data-classification ceiling |
| jurisdictionRestrictions | allowed jurisdictions (empty = global config approval still required) |
| timeoutMs / retryPolicy | bounded invocation |
| costPerToken / tokenAccounting | cost policy fields (accounting accrues only when a provider is ratified) |
| status ACTIVE/SUSPENDED/RETIRED | lifecycle |

- **No external provider is connected.** Execution remains the deterministic
  internal HIVE analyst `beyu-hive-deterministic-analyst@2026.02` with prompt
  `2026.08` (v2.0.0). No BEYU data leaves the approved execution boundary.
- Registry is empty until an accountable human registers + activates a
  provider; activation is a governed write, not a config flag.
- Circuit-breaker/fallback: designed into metadata (timeout/retry);
  runtime activation BLOCKED pending governance.
