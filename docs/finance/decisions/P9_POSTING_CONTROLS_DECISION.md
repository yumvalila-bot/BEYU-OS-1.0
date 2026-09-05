# P9 — Posting Controls — Decision Package

**Decision ID:** P9  
**Title:** Posting Controls (Maker/Checker Model)  
**Authority Required:** Group CFO (Constitution Art. 5)  
**Status:** **PENDING — NOT RATIFIED**  
**Date Prepared:** 2026-09-05  
**Baseline Commit:** 7481263  

---

## 1. Policy Question

What is the segregation-of-duties model for journal posting, and may the Group CFO post and approve the same entry?

---

## 2. Current Authoritative Facts

- **[FACT]** `finance:ledger.post` is a **single HIGH_RISK permission** held by **GROUP_CFO only**
- **[FACT]** GROUP_CEO does **not** hold it — one of exactly 3 wildcard exclusions
- **[FACT]** `finance:ledger.approve` **does not exist** in any role and was not created
- **[FACT]** `journal_entries.approved_by` exists and is written by **no code path**
- **[FACT]** No draft/pending/rejected state exists on `journal_entries`
- **[FACT]** A `delegations` table exists
- **[FACT]** `CTL-FIN-002` requires maker/checker on **all** journal postings, with no materiality threshold
- **[FACT]** `CONST-AI-001 r3` denies AI `finance:ledger.post` **by name**

---

## 3. The Eleven Required Answers (All PENDING)

1. Who may prepare/post?
2. Who may check?
3. May the same person post and approve?
4. May the CFO self-approve?
5. Does approval vary by amount?
6. Does approval vary by entity?
7. How are reversals handled?
8. Emergency corrections?
9. May delegated authority be used?
10. What evidence must be recorded?
11. What role may AI/HIVE/Noelia play?

---

## 4. Options

| Option | Description | SoD | SOC2 | Implementation |
|--------|-------------|-----|------|----------------|
| **A** | CFO posts and self-approves | None | FAIL | Works today, zero changes |
| **B** | Separate finance maker/checker roles | Genuine | PASS | Blocked: only one authorized person |
| **C** | Delegated checker authority | Genuine | PASS | Requires delegation mechanism |
| **D** | Threshold-based approval | Conditional | PASS | New permission required |
| **E** | Governance + accounting approval | Strongest | PASS | Conflates governance with accounting |
| **F** | Other | — | — | — |

---

## 5. Consequences

### Option A (CFO Self-Approves)
- Works today with zero changes
- **No segregation of duties**
- A failure under SOC2, which `CTL-FIN-002` itself cites as a framework

### Option B/C/D (Separate Roles)
- Genuine SoD
- **BLOCKED:** since GROUP_CFO is the *only* holder, prohibiting self-approval **makes posting impossible** until a second authorised human exists

### Conditional Consequence if a New Permission is Required

**NEW PERMISSION REQUIRED — POLICY DECISION ONLY.**

Two silent failure modes must be closed in the same decision:

**(i)** The GROUP_CEO wildcard grants all permissions except 3 named exclusions, so a new permission would be **auto-granted to the role deliberately denied posting**

**(ii)** `CONST-AI-001 r3` names `finance:ledger.post` only, so a new permission would **not** be covered and AI would formally be able to approve journals

---

## 6. Recommendation

**[RECOMMENDATION]** B or D.

**Not a decision. No permission created.**

---

## 7. Required Authority

**Group CFO** (Constitution Art. 5); **Group Board** if posting or approval authority moves outside the CFO

---

## 8. Exact Decision Wording

*"Journal posting requires a maker holding `<permission>` and a checker holding `<permission>`. The same natural person `<may / may not>` act as both maker and checker `<unconditionally / below <threshold>>`. The Group CFO `<may / may not>` self-approve. Reversing entries `<require / do not require>` independent approval. Delegated checker authority `<is / is not>` permitted under the existing delegation model. AI-initiated actions may `<not>` act as maker or checker."*

---

## 9. Evidence Summary

| Evidence Type | Found? | Source |
|---------------|--------|--------|
| Authoritative policy document | ❌ NONE | — |
| CFO ratification | ❌ NONE | — |
| Governance resolution | ❌ NONE | — |
| HIGH_RISK permission | ✅ Supporting | `constants.ts` |
| Maker/checker control | ✅ Supporting | `CTL-FIN-002` |
| AI denial | ✅ Supporting | `CONST-AI-001 r3` |

---

## 10. Dependencies

P9 blocks: the posting service design and all posting operations.

---

## 11. Historical Impact

- **Current ledger state:** Empty (0 entries)
- **Reversibility:** Permission grants are reversible; entries approved under a weak model are not

---

## 12. Decision Sheet (Blank — For Authority Completion)

```
DECISION ID:            P9 — Maker/checker
QUESTION:               What is the SoD model, and may the CFO post and approve the same entry?
RECOMMENDED OPTION:     [RECOMMENDATION] B or D — not a decision; no permission created
ALTERNATIVES:           A CFO self-approves · B separate roles · C delegated checker · D threshold-based
                        · E governance + accounting approval · F other
CONSEQUENCES:           GROUP_CFO is the only holder of finance:ledger.post, so prohibiting
                        self-approval makes posting impossible without a second authorised human.
EXACT RATIFICATION WORDING:
    "Journal posting requires a maker holding <permission> and a checker holding <permission>.
     The same natural person <may / may not> act as both. The Group CFO <may / may not>
     self-approve. Reversing entries <require / do not require> independent approval.
     AI-initiated actions may not act as maker or checker."
STATUS:                 PENDING
SIGNATORY:              __________
DATE:                   __________
EFFECTIVE DATE:         __________
SCOPE:                  __________
```

---

## 13. Ratification Status

**P9 = PENDING — NOT RATIFIED**

**END OF DECISION PACKAGE**
