# NOELIA — Agent Skills and the Seven-Stage Lifecycle

**Module:** `src/lib/noelia/cognitive/agent-skills.ts`
**Suite:** `tests/noelia/cognitive-agent-skills.test.ts` (25 tests)
**Panel:** Command Centre → `AGENT SKILLS`

---

## 1. What a skill is here, and what it is not

A skill is **a declaration over the same governed capabilities a workforce specialist uses**,
plus an ordered record of how far a piece of work has actually got.

It is explicitly **not**:

| Not this | Why not |
|---|---|
| A second registry | The workforce registry is the one registry; a skill is bounded by it |
| A second agent runtime | A skill never executes; it records state |
| A plugin or tool loader | Skills cannot add capabilities, only reference existing ones |
| A workflow engine | The workflow system already exists and is untouched |
| A persona | NOELIA has one canonical identity; a skill is not a second voice |

The design consequence matters: **introducing a skill cannot widen what NOELIA can reach.**
Every capability a skill names must already be held by at least one declared specialist, which
in turn must resolve in the live tool registry, which in turn must be authorized for the caller.
Three nested bounds, each independently tested.

---

## 2. The lifecycle

```
SPECIFY → PLAN → BUILD → TEST → REVIEW → SIMPLIFY → SHIP
```

Seven stages. In order. There is no eighth.

**SHIP does not mean shipped.** It means *"ready for a human to decide"*. The word was chosen
deliberately: the mission lifecycle ends here because merging is a human act that an assistant
must not perform. The field is named `readyForHumanGate` rather than `shipped` for the same
reason — a field called `shipped: true` would eventually be set by a script.

### Stage states

| State | Meaning |
|---|---|
| `NOT_STARTED` | Nothing done. The default. |
| `IN_PROGRESS` | Work has begun but is not finished. |
| `COMPLETE` | Finished, with evidence recorded. |
| `BLOCKED` | Cannot proceed. **Requires a `blockedReason`.** |
| `SKIPPED` | Deliberately not done, with the decision recorded. |

`BLOCKED` is a first-class state, and the guard refuses a block without a reason. This is not
pedantry: work that cannot proceed for an external reason must be representable, or it will be
silently reported as merely pending, and "pending" reads as "we'll get to it" rather than "this
needs a decision".

---

## 3. Ordering is enforced, not documented

`assertSkillLifecycleOrder` rejects a skill that marks a later stage `COMPLETE` while an earlier
one is not. Without it, a catalogue can claim `SHIP: COMPLETE` while `BUILD` was never started —
which is precisely the failure mode this whole document exists to prevent.

This guard **caught two real falsehoods in the first draft of the catalogue**:

1. `ZERO_COST_MODEL_GOVERNANCE` marked `SIMPLIFY: COMPLETE` while `REVIEW` was `IN_PROGRESS`.
2. `LOCAL_SEMANTIC_RETRIEVAL` did the same.

Both were corrected to `SIMPLIFY: NOT_STARTED`. Independent review is a human act; an assistant
claiming to have completed review of its own work is exactly the claim that must not stand. The
guard did its job on the author of the guard, which is the only convincing evidence that it works.

A third error was caught by the brain-binding check: two skills were assigned the brain id
`GOVERNANCE`, which is **not a brain**. The eight brains are `EXECUTIVE`, `INSTITUTIONAL`,
`KNOWLEDGE`, `ANALYTICAL`, `OPERATIONAL`, `LEARNING`, `COLLECTIVE`, `PERSONAL_CONTEXT`. Governance
work belongs to `INSTITUTIONAL`. The type system accepted the string because the field was wide;
the runtime guard rejected it.

---

## 4. The catalogue

| Skill | Brain | Reached | Blocked at |
|---|---|---|---|
| `ZERO_COST_MODEL_GOVERNANCE` | INSTITUTIONAL | REVIEW (in progress) | SHIP — human merge |
| `LOCAL_SEMANTIC_RETRIEVAL` | KNOWLEDGE | REVIEW (in progress) | SHIP — human merge |
| `TENANT_ISOLATION_HARDENING` | INSTITUTIONAL | REVIEW (in progress) | SHIP — human merge |
| `LOCAL_INFERENCE_VERIFICATION` | KNOWLEDGE | BUILD | **TEST — no Ollama runtime** |

`LOCAL_INFERENCE_VERIFICATION` is the honest one. The adapter is built and tested against
injected HTTP doubles, but no model exists in this environment, so no inference has ever run.
A skill that reported `TEST: COMPLETE` here would be claiming a verification that did not
happen. It shows `BLOCKED` with the reason attached, and `atHumanGate: false`.

---

## 5. Guards

| Guard | Enforces |
|---|---|
| `assertSkillLifecycleOrder` | No stage is `COMPLETE` past an incomplete one; every `BLOCKED` has a reason |
| `assertSkillRegistryIntegrity` | Unique codes, declared brains, registered capabilities, exact seven stages in order, gate reachability |
| `skillCapabilitiesWithinWorkforce` | Every named capability is held by a declared specialist |
| `skillRegistrySummary` | Derives `atHumanGate` from the stages so it cannot drift from them |

The Command Centre reads `skillRegistrySummary()`, so the panel cannot show a state the guards
would reject.

---

## 6. What this does not prove

- **The evidence pointers are not verified.** The guard checks that a stage marked `COMPLETE`
  cites a path; it cannot check that the path supports the claim. A `COMPLETE` stage with a
  wrong evidence file is still possible.
- **No skill executes anything.** There is no execution path to test, which is the point, but
  it also means these tests prove structure and honesty, not runtime behaviour.
- **The catalogue is small.** Four skills, not forty. That is deliberate: a skill registry
  inflated with entries would be a list of intentions, and this one is a list of work with a
  recorded frontier.
