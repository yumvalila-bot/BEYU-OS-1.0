# PRE-EXISTING BEYU INFRASTRUCTURE DEFECT — Authority timestamp comparison

**Baseline:** `0bf378ec9f484acb6100d24f166492ebd4bdfd9f`  
**Discovered by:** isolated Phase 15 security baseline on 2026-08-23  
**Impact:** fail-closed availability/integrity defect; valid governed authority could not advance beyond `APPROVED_NOT_EFFECTIVE`

`verifyDecisionAuthority()` compared Drizzle timestamp values with:

```ts
String(row.approvalDate).slice(0, 10)
String(row.effectiveFrom)
String(row.effectiveTo)
```

Drizzle returns these columns as JavaScript `Date` objects. `String(date)` begins with a weekday
(e.g. `Wed Jan...`), not `YYYY-MM-DD`; lexical comparison against an ISO server day therefore
classified a historical approval date as future. This was reproduced by three pre-existing
positive-control failures in `tests/security/activation-gate.test.ts`.

The remediation is deliberately narrow: `isoDay()` converts `Date` with `toISOString().slice(0,
10)` and preserves the existing handling of string values. No status, dependency, provenance,
activation or permission rule changed. The gate remains fail closed.

The positive controls were also corrected to provide the approval date now required by Phase 15
and to restore all mutated fixture columns in `finally`. The activation gate passed 25/25 twice in
isolation, then passed in the final Phase 15 common-platform run (125/125) and complete available
suite (1,589/1,589 across 65/65 files). Final typecheck, lint, optimized production build,
`drizzle-kit check`, and `git diff --check` also passed.
