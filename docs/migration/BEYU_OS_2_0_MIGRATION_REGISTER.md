# BEYU OS 2.0 MIGRATION REGISTER

Date: 2026-09-05
Source SHA: `b9c94d4f8ce7c3466cc3c27242eaa6a1650f0b72`
Destination SHA: `6c2ec2663c4f704fd6ca4054d0f9ddedb8fb3878`

Status: `DISCOVERED`, `BASELINED`, `MIGRATING`, `MIGRATED`, `VERIFIED`, `CERTIFIED`, `BLOCKED`, `REJECTED`

| ID | Capability | Source | Source SHA | Dest path | Original | New | Type | Data migration | API impact | Security impact | Tests before | Tests after | Regression | Agent | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-000 | Reality audit | both | both | docs/migration/PHASE_00_REALITY_AUDIT.md | — | evidence doc | AUDIT | none | none | none | — | — | — | X10THINK | BASELINED | measured runs |
| M-001 | 1.0 non-DB baseline | 1.0 | 6c2ec26 | docs/migration/BEYU_OS_1_0_BASELINE.md | — | evidence doc | AUDIT | none | none | none | 1109 pass/450 fail/816 skip (no DB) | — | — | X10THINK | BASELINED | logs |
| M-002 | 1.0 Health baseline | 1.0 | 6c2ec26 | docs/migration/BEYU_OS_1_0_BASELINE.md | — | evidence doc | AUDIT | none | none | none | 488 pass/15 skip | — | — | X10THINK | BASELINED | jest run |
| M-003 | New baseline | NEW | b9c94d4 | docs/migration/NEW_REPOSITORY_BASELINE.md | — | evidence doc | AUDIT | none | none | none | 299 pass/0 fail | — | — | X10THINK | BASELINED | turbo run |
| M-004 | Capability matrix | both | both | docs/migration/BEYU_OS_2_0_CAPABILITY_MATRIX.md | — | evidence doc | AUDIT | none | none | none | — | — | — | X10THINK | BASELINED | measured |
| M-010 | Monorepo package boundaries | NEW | b9c94d4 | `apps/services/packages` (target) | root Next + sectors | monorepo target | REFACTOR | none | high (if moved before parity) | low | — | — | — | X10THINK | BLOCKED | no DB-backed parity run |
| M-011 | `packages/types` | NEW | b9c94d4 | `packages/types` (target) | src/lib | shared types | ADOPT/REFACTOR | none | medium | low | source 30 | — | — | X10THINK | BLOCKED | not wired |
| M-012 | `packages/events` | NEW | b9c94d4 | `packages/events` (target) | internal events/receipts | governed envelope | MERGE | none | medium | low | source 18 | — | — | X10THINK | BLOCKED | not wired |
| M-013 | `packages/auth` | NEW | b9c94d4 | `packages/auth` (target) | src/lib/authz | policy contract | MERGE | none | medium | medium | source 43 | — | — | X10THINK | BLOCKED | not wired |
| M-014 | `packages/security` | NEW | b9c94d4 | `packages/security` (target) | src/lib/audit,crypto | shared security | MERGE | none | medium | medium | source 34 | — | — | X10THINK | BLOCKED | not wired |
| M-015 | `packages/health-types` | NEW | b9c94d4 | `packages/health-types` (target) | sectors/health entities | shared health types | MERGE | none | low | low | source 0 | — | — | X10THINK | BLOCKED | not wired |
| M-016 | `packages/health-api-client` | NEW | b9c94d4 | `packages/health-api-client` (target) | — | typed client | ADOPT | none | low | low | source 0 | — | — | X10THINK | BLOCKED | not wired |
| M-020 | Health OS swap | NEW | b9c94d4 | `services/beyu-health-api` | `sectors/health/backend` | health API | REPLACE_AFTER_PROOF | **REJECTED** | would weaken | high | 488 (dest) vs 7 (source) | N/A | N/A | X10THINK | REJECTED | dest wins |
| M-021 | Health web swap | NEW | b9c94d4 | `apps/beyu-health-web` | `sectors/health` | health web | REPLACE_AFTER_PROOF | **REJECTED** | would weaken | low | 14 (dest) vs 0 (source) | N/A | N/A | X10THINK | REJECTED | dest wins |
| M-022 | Flutter swap | NEW | b9c94d4 | `apps/beyu-health-mobile` | `mobile/flutter` | mobile | REPLACE_AFTER_PROOF | **REJECTED** | would replace real Dart with pubspec | medium | dest real client vs source scaffold | N/A | N/A | X10THINK | REJECTED | source scaffold |
| M-023 | Control-plane runtime swap | NEW | b9c94d4 | `services/beyu-api` | root Next API routes | runtime | MERGE/REFACTOR | none | high | medium | 149 (source) vs 1109+ (dest) | N/A | N/A | X10THINK | BLOCKED | not paritied |
| M-030 | Finance OS | 1.0 | 6c2ec26 | src/lib/finance | — | — | KEEP_1_0 | none | none | none | 20+ suites | N/A | — | X10THINK | VERIFIED (tests exist) | no change made |
| M-031 | CAP_POSTING | 1.0 | 6c2ec26 | src/lib/finance | — | — | KEEP_1_0 | none | none | none | capital-governance suites | N/A | — | X10THINK | BLOCKED | DB required |
| M-032 | Ledger immutability | 1.0 | 6c2ec26 | drizzle 0005 | — | — | KEEP_1_0 | none | none | none | ledger-integrity | N/A | — | X10THINK | BLOCKED | DB required |
| M-033 | Governance / family office | 1.0 | 6c2ec26 | src/lib/governance, src/lib/family | — | — | KEEP_1_0 | none | none | none | governance/family suites | N/A | — | X10THINK | BLOCKED (DB suites) | unchanged |
| M-040 | Audit chain | 1.0 | 6c2ec26 | src/lib/audit.ts | — | — | KEEP_1_0 | none | none | none | audit suites | N/A | — | X10THINK | BLOCKED (DB) | unchanged |
| M-050 | RLS | 1.0 | 6c2ec26 | drizzle/health RLS | — | — | KEEP_1_0 | none | none | none | rls suites | N/A | — | X10THINK | BLOCKED (DB) | unchanged |
| M-060 | Infra adoption | NEW | b9c94d4 | `infra/` (target) | — | docker/k8s/terraform/supabase/vercel | ADOPT | none | low | medium | source partial | N/A | N/A | X10THINK | BLOCKED | no real deployment |
| M-070 | Production cert | both | both | docs/migration/BEYU_OS_2_0_FINAL_CERTIFICATION.md | — | — | CERT | none | none | none | — | — | — | X10THINK | BLOCKED | not certifiable |

---

## Progress summary

| Status | Count |
|---|---|
| BASELINED | 4 |
| REJECTED | 3 |
| BLOCKED | 9 |
| VERIFIED | 1 |
| MIGRATED / VERIFIED end-to-end | 0 |
| CERTIFIED | 0 |
