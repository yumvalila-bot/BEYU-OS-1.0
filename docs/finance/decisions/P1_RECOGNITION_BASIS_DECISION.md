# P1 — Recognition Basis — Decision Package

**Decision ID:** P1  
**Title:** Accounting Recognition Basis  
**Authority Required:** Group CFO (Constitution Art. 5)  
**Status:** **PENDING — NOT RATIFIED**  
**Date Prepared:** 2026-09-05  
**Baseline Commit:** 7481263  

---

## 1. Policy Question

When a capital transaction creates an economic obligation before cash settlement, what event triggers accounting recognition?

---

## 2. Current Authoritative Facts

- **[FACT]** IFRS is the accounting basis (`accounting_standard` NOT NULL, 8/8 entities)
- **[FACT]** No ratified recognition statement exists in the constitution, any policy, any control, any ADR or any resolution
- **[FACT]** Corrections are by reversal (Art. 5), enforced by migration `0005`
- **[FACT]** No invoice, purchase-order, goods-receipt, commitment or payment-terms concept exists in the schema

---

## 3. Options

| Option | Description | Recognition Event | IFRS Alignment | Implementation |
|--------|-------------|-------------------|----------------|----------------|
| **A** | Cash basis | Payment | Weak (IAS 16) | Simplest; requires cash first |
| **B** | Accrual at obligation | Invoice/contract | Strong | Two-stage; requires payable class |
| **C** | Accrual at control transfer | Receipt of goods/services | Strongest (IAS 16) | Requires goods-receipt concept |
| **D** | Staged/percentage-of-completion | Progress milestones | Conditional | Only if multi-period CAPEX exists |

---

## 4. Consequences

### Option A (Cash Basis)
- Debit asset, credit cash in one entry
- **Weak under IAS 16** (recognition should follow control, not payment)
- Requires cash to exist first → opening balances become a prerequisite
- No payable class needed

### Option B (Accrual at Obligation)
- Two stages: (1) debit asset, credit payable; (2) debit payable, credit cash
- **IFRS-consistent**
- Requires a payable class and an obligation-triggering artefact
- Recognition and settlement separately controllable — stronger SoD

### Option C (Accrual at Control Transfer)
- Technically most correct for IAS 16
- Requires a goods-receipt concept that does not exist
- Recognition fully decoupled from both approval and payment

### Option D (Staged)
- Only relevant if multi-period construction CAPEX exists — **[UNKNOWN]**

---

## 5. Recommendation

**[RECOMMENDATION]** B or C on IFRS merit; A is weak.

**Not a decision.** The fact that B removes the opening-cash blocker is a consequence, not a justification. The basis must be chosen on accounting merit.

---

## 6. Required Authority

**Group CFO** (Constitution Art. 5)

---

## 7. Exact Decision Wording

*"BEYU recognises capital expenditure on a `<cash / accrual>` basis. The recognition event is `<commitment / invoice receipt / receipt of goods or services / payment>`. Recognition is independent of governance approval and of cash settlement. Where an obligation is recognised before payment, the entity debits `<asset class>` and credits `<payable class>`; settlement is a separate posting."*

---

## 8. Evidence Summary

| Evidence Type | Found? | Source |
|---------------|--------|--------|
| Authoritative policy document | ❌ NONE | — |
| CFO ratification | ❌ NONE | — |
| Governance resolution | ❌ NONE | — |
| IFRS basis | ✅ Supporting | `entities.accounting_standard` |
| Reversal enforcement | ✅ Supporting | Migration 0005 |

---

## 9. Dependencies

P1 blocks: P2, P5, P7, P10, P11, and the posting service.

---

## 10. Historical Impact

- **Current ledger state:** Empty (0 accounts, 0 entries)
- **Reversibility:** Low once entries are posted
- **Comparability:** A later basis change creates a comparability break

---

## 11. Decision Sheet (Blank — For Authority Completion)

```
DECISION ID:            P1 — Accounting recognition basis
QUESTION:               What event triggers accounting recognition of a capital transaction?
RECOMMENDED OPTION:     [RECOMMENDATION] Accrual (B or C) on IFRS merit — not a decision
ALTERNATIVES:           A cash basis · B accrual at obligation · C accrual at control transfer · D staged
CONSEQUENCES:           Determines whether the first entry touches cash, whether a payable class is
                        required, and whether opening balances are a prerequisite.
EXACT RATIFICATION WORDING:
    "BEYU recognises capital expenditure on a <cash / accrual> basis. The recognition event is
     <commitment / invoice receipt / receipt of goods or services / payment>. Recognition is
     independent of governance approval and of cash settlement."
STATUS:                 PENDING
SIGNATORY:              __________
DATE:                   __________
EFFECTIVE DATE:         __________
SCOPE:                  __________
```

---

## 12. Ratification Status

**P1 = PENDING — NOT RATIFIED**

**END OF DECISION PACKAGE**
