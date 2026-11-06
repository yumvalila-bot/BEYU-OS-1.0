# PR #114 remediation stage ledger

This ledger records existing commits rather than duplicating or rewriting them. See the blocker register and exception register for unresolved acceptance gates. Commit identifiers refer to the PR branch; a commit does not by itself certify production readiness.

| Stage | Existing commit(s) | Summary / evidence |
|---|---|---|
| Public entry | `263851b`, `4d60d14` | Reference-led homepage and canonical brand. |
| Canonical identity and routing | `0187024`, `94b556e` | Shared sign-in, allowlisted continuations, launcher and browser review. Hostnames are not authority. |
| Foundation and dependency review | `7046166` | Foundation denial hardening and Zod update; gaps recorded. |
| Shared request boundary and accessibility | `89762de`, `6d0a956` | Bounded shared JSON parsing, regression reconciliation and selected Foundation accessibility. |
| Credentials and webhooks | `a66424c` | Strict credential caps and streamed existing webhook caps, inventory and responsive matrix. |
| NOELIA fixture | `8fc176d` | Unique search fixture and audit assertion. |
| Foundation preflight, Communications replay | `66b197e` | Pre-stream Foundation refusal and single-read Communications idempotency. |
| Bootstrap authority investigation | `763feec` | Isolated restricted-role failure documented, not fixed. |
| Entry layout | `011ba3c` | 568×320 landscape overflow fix. |
| Regression contract correction | `40b33f1` | Require real Foundation 403 in stale suites. Correctly configured isolated full regression: 5,909 passed, 12 skipped, 31 TODO; earlier misconfigured run failed one with 39 extra skips. |
| Bootstrap boundary mitigation | `ca96560` | Sanitized, no-store 503 for four endpoint dependency failures; transactional test reset and skipped-suite cleanup. Restricted runtime remains unable to perform the ceremony. |
| Communications strict validation | `190cb0e` | Fifteen mutations enforce strict bounded JSON before idempotency. HTTP malformed/media probes ran on all 15; contacts additionally covered replay, conflicts, size, UTF-8 and complexity. |
| Foundation future routes | `bc698af` | Unknown paths fail closed with generic no-store 404. Recursive catalogue parity and mocked registry revocation between preflight/render; late HTTP status race remains. |

## Continuation verification and boundaries

On the source at `bc698af`, lint and typecheck passed, as did the production build, tracked-file secret scan and SCG mechanical checks (lint has one existing image warning). Production npm audit reported zero vulnerabilities; the full tree reported 14 moderate. Real isolated HTTP tests passed 30 tests across Foundation, session revocation, Communications and credential boundaries, followed by the all-15 Communications malformed/media HTTP test. Four actual bootstrap endpoints returned no-store sanitized 503 with retry hints against an unavailable database. Entry and Foundation browser verification passed 35 tests; this is not a manual WCAG certification.

Restricted enrollment was independently rerun against a newly migrated disposable database, with the application runtime and the privileged fixture targeting the same database and separate non-bypass runtime and governance roles: 3 passed, 2 failed (503 instead of 422/201). A runtime privilege probe independently received PostgreSQL 42501 for locking, updating and deleting the bootstrap singleton. No broad privileges were granted. The earlier isolated run's fixture used the original disposable test database while the server used a second disposable database; its 3/2 result is historical diagnostic evidence only, superseded by this same-database rerun. A no-secret skipped run verified the disposable admin/bootstrap fixture digest unchanged.

Full regression and GitHub checks must be associated with their exact final SHA and are reported separately in the PR, not inferred from the targeted tests. Skips and TODOs are not passes. Approved Health federation and persisted workspace authority remain unavailable; both stay fail-closed. No production migration, configuration or credential was changed. Existing repository automation may create a Vercel **preview** on push; no manual deployment or production release was requested by this work.
