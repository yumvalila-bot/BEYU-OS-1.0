# NOELIA — Governance Control Plane

**Status:** IMPLEMENTED
**Related:** `NOELIA_SECURITY_MODEL.md` (mechanism), `NOELIA_THREAT_MODEL.md` (attacks),
`NOELIA_TOOL_GOVERNANCE.md` (capability rules)

---

## 1. Principle

Governance is **not a step**. It is the medium every NOELIA action travels through.

A NOELIA request is never "perform then check". It is "resolve authority, then perform within
that authority, then record what authority permitted".

---

## 2. The control plane components

| Component | Implementation | Effect |
|---|---|---|
| Identity | `GlobalUserID`, canonical principal | One identity per human across all OSs |
| RBAC | Permission codes on roles | Coarse gate |
| ABAC | Attribute predicates (classification, entity, country, jurisdiction) | Fine gate |
| RLS | `FORCE ROW LEVEL SECURITY` on every NOELIA table | Database-level backstop |
| Classification | `beyu_classification` enum, ordered | Access ceiling per principal |
| MFA | Enforced for sensitive scopes | Step-up for material reads |
| Consent | Exploit-consent records for personal data | Lawful basis documented |
| Audit | Append-only ledger with trace ids | Attributable and complete |
| SoD | Maker/checker on approvals and workflows | No single actor completes a material act |
| Hermes restriction | `hermes-runtime.ts` capability ceiling | High-risk capabilities stay disabled |
| Kill switch | HIVE boundary global switch | Immediate halt |

---

## 3. Authorization order (implemented, not aspirational)

`NoeliaToolRegistry.invoke()` evaluates in this order, failing closed at each step:

```
1. Capability declared and registered?      → else UNKNOWN_CAPABILITY
2. Input conforms to declared schema?       → else CONTRACT_VIOLATION (422)
3. Principal holds the permission?          → else DENIED (403)
4. Tenant matches?                          → else DENIED
5. Entity within authorized set?            → else DENIED
6. Country within authorized set?           → else DENIED
7. Jurisdiction permitted?                  → else DENIED
8. Classification ≤ clearance?              → else DENIED
9. Approval requirement satisfied?          → else APPROVAL_REQUIRED
10. Rate limit respected?                   → else RATE_LIMITED
11. Execute
12. Output conforms to declared schema?     → else CONTRACT_VIOLATION (422)
13. Audit append
```

Steps 1–10 all run **before** any record is read. That ordering is what makes
"authorization enforced before retrieval" a fact rather than an intention.

---

## 4. Capability risk classes

| Class | Examples | Gate |
|---|---|---|
| `READ_LOW` | Reference lookups | Permission only |
| `READ_SENSITIVE` | Financial positions, personal context | Permission + classification + MFA |
| `ADVISORY_WRITE` | Draft a recommendation | Permission + audit |
| `GOVERNED_WRITE` | Record a decision, advance workflow | Permission + SoD + human approval |
| `PROHIBITED` | Post ledger entry, move funds, alter trust | **Locked. Fail-closed. No activation path.** |

The last class is not "requires extra approval" — it is **unreachable**. `CAP_POSTING` and its
peers have no implementation wired to NOELIA dispatch.

---

## 5. Autonomy level

NOELIA operates at **L2–L3**: observe and advise. It may assemble evidence, form hypotheses,
produce recommendations and request approvals. It may not execute a material institutional act.

L6 (unattended autonomous action) is **disabled** and cannot be enabled by configuration — only
by a code change that adds an execution path, which would be a constitutional amendment, not a
setting.

---

## 6. Institutional boundaries encoded as code

| Boundary | Code evidence |
|---|---|
| NOELIA cannot move funds | No transfer capability registered |
| Cannot post accounting entries | `CAP_POSTING` locked; none of the 8 new capabilities write |
| Cannot approve investments | No approval capability; approvals require a human role |
| Cannot execute capital allocation | No waterfall or capital-execution capability |
| Cannot alter trust arrangements | No trust-mutation capability; Foundation surfaces are separate |
| Cannot override financial controls | Control evaluation is read-only |
| Cannot approve material decisions | `noelia.decision_memory.query` is read-only; `EFFECTIVE` requires a human act |

---

## 7. Auditability

Every material invocation writes an audit entry with:

- `traceId`, principal, role, tenant, entity, country
- capability name, risk class, decision (allow/deny), reason
- input hash, output hash, duration
- the authorization facts that permitted it

Query surface: `/os/audit`, plus the AI-specific ledger at `/os/noelia/governance`.

A denial is audited as fully as an allow — denials are the more interesting signal.

---

## 8. Governance is verifiable

`tests/noelia/cognitive-http.test.ts` asserts the boundary over real HTTP:

- unauthenticated call to each of the 5 routes → `401`
- unknown field → `422` (schema is `.strict()`)
- denial is `403`, contract violation is `422`, and internal errors never leak text
- the Council always returns `humanReviewRequired: true`

`tests/noelia/agent-surface-guard.test.ts` freezes the capability inventory so a new capability
cannot be added silently.
