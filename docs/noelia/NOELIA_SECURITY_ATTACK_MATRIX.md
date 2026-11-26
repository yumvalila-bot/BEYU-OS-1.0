# NOELIA — Security Matrix: Prompt Injection and the Eighteen Attacks

**Suite:** `tests/noelia/security/attack-matrix.test.ts` (20 tests)
**Companion:** `tests/noelia/adversarial-ai-security.test.ts` (real PostgreSQL, real runtime role)
**Status:** ENFORCED. Every attack below has a test that fails if the defence is removed.

---

## 1. How to read this document

An attack matrix is only useful if it distinguishes three different kinds of "safe":

| Kind | Meaning | How it is proven |
|---|---|---|
| **Tested** | A real code path runs and returns a refusal | An assertion on the returned value |
| **Structural** | The capability does not exist to be exploited | A type, a guard, or an absent field |
| **Unproven** | We believe it is safe but have not shown it | Stated as unproven, never counted as a pass |

A structural defence is genuinely stronger than a tested one — you cannot bypass a field that
was never written. But it is also easier to over-claim, because "there is no test for a bypass"
and "there is no bypass" look identical in a report. Both are labelled below.

---

## 2. Prompt injection: where trust is decided

The defence is not a blocklist on the user's message. It is a **provenance rule**: content
carries a kind, and only two kinds may express policy.

```ts
type PromptSegmentKind =
  | "SYSTEM_POLICY" | "NOELIA_POLICY"          // trusted: may state rules
  | "USER" | "RETRIEVED" | "EXTERNAL"
  | "TOOL_OUTPUT" | "MODEL_OUTPUT";            // untrusted: scanned, never authoritative
```

`PromptGovernor.evaluate()` scans **every non-policy segment** for injection markers. That is
the important design choice: a poisoned document in the governed corpus (a `RETRIEVED`
segment) is treated exactly like a malicious user, because from the model's point of view they
are the same text arriving in the same context window.

### The marker families

Ten families, each targeting a distinct goal:

| Goal | Marker family |
|---|---|
| Instruction override | `ignore (all )?(previous|prior|above) (instructions|messages|directions|rules)` |
| Role hijack | `you are (now|no longer) (a|an|not)` |
| Prompt exfiltration | `reveal your (system|developer|hidden|internal) prompt` |
| Prompt replay | `repeat your (system|developer) (prompt|instructions|message)` |
| Policy erasure | `forget (all )?(previous|your) (instructions|rules|policy)` |
| Approval bypass | `override (the )?(policy|role|authorization|approval|permissions)` |
| Boundary change | `change (my \|the )?(tenant&vert;entity&vert;country&vert;os&vert;permission&vert;approval)` |
| Unfiltered persona | `act as an (unrestricted|unfiltered|unconstrained) (ai|assistant|agent)` |
| Rule rejection | `do not follow (any )?(rules|policies|instructions)` |
| Disregard | `disregard (the \|your )?(system&vert;developer&vert;policy) (prompt&vert;instructions&vert;messages)` |

### A second, independent check

A blocklist can be paraphrased around. So the governor also rejects **boundary-changing actions
by canonical name**, independent of phrasing:

```
TENANT_CHANGE  ENTITY_CHANGE  COUNTRY_CHANGE  OS_CHANGE  PERMISSION_CHANGE
APPROVAL_CHANGE  AUTHORIZATION_CHANGE  IDENTITY_CHANGE
SECURITY_CONTROL_CHANGE  POLICY_CHANGE
```

This is why the defence does not depend on the regexes being clever: an attacker who defeats
every marker still has to request one of ten actions, and all ten are refused by name.

---

## 3. The eighteen attacks

| # | Attack | Defence | Kind | Test |
|---|---|---|---|---|
| A1 | Instruction override in the user turn | Markers + scan of `USER` | Tested | ✓ |
| A2 | System-prompt exfiltration | Exfiltration marker family | Tested | ✓ |
| A3 | Injection via a poisoned retrieved document | `RETRIEVED` is scanned | Tested | ✓ |
| A4 | Injection via tool output | `TOOL_OUTPUT` is scanned | Tested | ✓ |
| A5 | Model output impersonating policy | `MODEL_OUTPUT` is scanned | Tested | ✓ |
| A6 | *(control)* a clean request must still succeed | Guard is not a blanket denial | Tested | ✓ |
| A7 | Driving generation without user intent | `USER` segment required | Tested | ✓ |
| A8 | Boundary change by canonical action name | `BOUNDARY_ACTIONS` | Tested | ✓ |
| A9 | Permission escalation | `PERMISSION_CHANGE` | Tested | ✓ |
| A10 | Approval bypass | `APPROVAL_CHANGE` | Tested | ✓ |
| A11 | Any of the ten boundary actions | All ten, enumerated | Tested | ✓ |
| A12 | Gaining posting authority via a specialist | `mayPost: false`, `riskCeiling: LOW` | **Structural** | ✓ |
| A13 | Reaching a write capability via a skill | No skill names a write capability | **Structural** | ✓ |
| A14 | Executing an approved but paid model | Cost gate, separate from approval | Tested | ✓ |
| A15 | Executing an unclassified model | UNKNOWN is treated as billable | Tested | ✓ |
| A16 | Executing a free-hosted model | Remote inference disabled by default | Tested | ✓ |
| A17 | Self-labelled "free" provider needing a card | Declaration cannot widen permission | Tested | ✓ |
| A18 | A forged skill claiming an undeclared brain | Brain ID is a closed union | **Structural** | ✓ |

**A6 is a control, not an attack.** It is included deliberately: a defence that refuses
everything is an outage wearing a security badge, and would pass every other test in this file.

**A12, A13 and A18 are structural.** They assert an *absence* — no posting authority, no write
capability, no undeclared brain. There is no bypass to test because the field cannot hold a
dangerous value. The suite records this distinction in its own test so the count of eighteen
cannot be read as eighteen runtime refusals.

---

## 4. The zero-cost attacks (A14–A17) in detail

These deserve their own explanation because they are the attacks specific to this programme.

**A14 — the model is legitimate.** A frontier model is genuinely approved, genuinely useful, and
genuinely costs money. Approval and cost are separate gates on purpose. The cost gate refuses it,
and the refusal names the reason (`ZERO_COST_POLICY`) so an operator can tell "too expensive"
apart from "unauthorised".

**A15 — the fail-open trap.** The dangerous shape is `if (cost === "PAID") deny()` — which
allows every model whose cost nobody filled in. `UNKNOWN` is therefore treated as **billable**,
not as free. This inverts the usual default and is the single most important line in the policy.

**A16 — free is not free.** A hosted free tier requires no card *today*. Remote inference is
disabled by default, so even a verified-free hosted model does not run without an owner
decision.

**A17 — the label is not evidence.** A provider declaring itself `LOCAL_FREE` while requiring a
payment instrument is reclassified. A declaration may only make the outcome **stricter**,
never more permissive. This is asserted directly, because it is the boundary between a
configuration value and an authorisation.

---

## 5. What this matrix does NOT prove

Stated plainly, because a security document that only lists wins is a marketing document.

| Not proven | Why | Consequence |
|---|---|---|
| Network-layer prompt filtering | No ingress proxy is exercised in unit tests | An attacker reaching the API directly bypasses nothing here, but the *transport* is untested at this layer |
| Browser-side injection (XSS → prompt) | No browser available | **Unproven** |
| Model-behaviour injection | No model runs in this environment | A sufficiently novel paraphrase may pass the markers; the canonical-action check is the backstop, and it too is unproven against an adaptive attacker |
| Multi-turn / stateful injection | The governor evaluates one request | **Unproven** |
| Unicode homoglyph and invisible-character tricks | Markers are ASCII-normalised | **Unproven** — a realistic gap |
| Timing side channels | Not measured | **Unproven** |

The honest summary: **the refusal paths are tested; the adversarial robustness of the
detection is not.** A determined attacker with model access and iteration would probably find a
paraphrase the markers miss. The canonical-action gate is what limits the damage when that
happens, and it is why NOELIA is advisory — a successful injection still cannot post, pay, or
move money.

---

## 6. Related controls (already covered elsewhere)

| Control | Document |
|---|---|
| Tenant isolation through the runtime role, verified with real PostgreSQL | `NOELIA_SECURITY_MODEL.md` |
| RLS forced on governed tables, policies asserting `beyu_tenant_ids` | `NOELIA_MIGRATION_DISCIPLINE.md` |
| Server-side authorisation, tenant context throws when absent | `CLAUDE.md`, `AGENTS.md` |
| Hermes restricted runtime | `NOELIA_HERMES_RESTRICTED_RUNTIME.md` |
| Tool governance and capability registry | `NOELIA_TOOL_GOVERNANCE.md` |
