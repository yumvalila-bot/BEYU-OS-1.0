# Deferred governance evidence visibility — 0059

## Reproduced failure

Invoker RLS correctly hid rows after transaction-local governance context,
classification clearance or tenant scope was narrowed. Five deferred guards,
however, treated an invisible evidence row as though no validation were necessary:
three used SELECT INTO followed by a nullable status test; two used an EXISTS
predicate that simply became false. A partial transition could therefore evade
the intended atomic projection check if scope changed before deferred validation.
This was a direct runtime-SQL boundary defect, not permission for a client to set
trusted context through the HTTP schemas.

The exact non-owner reproducers covered appointment activation (0051), body
establishment (0052), initial composition activation (0056), membership changes
(0057) and body lifecycle changes (0058). All **15 context-loss cases failed before
repair**: three visibility changes for each guard. Two unchanged-context partial
transition controls already rejected correctly. The reproductions forced deferred
constraints inside rollback-only transactions; they did not leave corrupted
partial transitions committed.

## Forward repair

0059 replaces only the five existing invoker functions. Each now requires its
current evidence row to remain visible before evaluating the original predicate.
All previous canonical member/body/charter/composition checks remain unchanged.
There is no SECURITY DEFINER, context bypass, grant expansion, trigger disabling,
new status, evidence rewrite, ledger repair or change to 0048–0058. The generated
0059 snapshot describes the unchanged schema; migration integrity remains explicit.

The fresh `beyu_body_lifecycle_secure_60` database applies all 60 migrations and
normal non-owner runtime provisioning. The combined repair run passed **97 tests
across eight files**, including all five actual non-owner SQL suites, body lifecycle
service tests and real 0057→0058 and 0058→0059 predecessor upgrades. All original
assertions remain and all fifteen new context-loss cases now deny with SQLSTATE
23514. The visibility rule also prevents an unvalidated proposal from silently
committing after its scope disappears.

## Validation discipline

The earlier broad 0058 run was stopped to investigate this security issue. It is
not a completed regression result. The production application is rebuilt at the
repair source; the complete root and browser suites must run against the fresh
60-migration database before completion is claimed. The final source-specific
checkpoint records those outcomes, exact GitHub observations and remaining gaps.

The existing role-assignment write prohibition is unchanged. Membership, body
status and decision evidence still do not grant RBAC, security, Finance, delegated
authority or CAP_POSTING. Noelia/HIVE remain non-authorizing. Production promotion
remains human-controlled.
