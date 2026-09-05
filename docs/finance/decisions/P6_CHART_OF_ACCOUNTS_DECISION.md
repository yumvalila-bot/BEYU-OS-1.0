# P6 — Chart of Accounts — Decision Package

**Decision ID:** P6  
**Title:** Chart of Accounts Scope  
**Authority Required:** Group CFO + Architecture Review Board (Constitution Art. 11)  
**Status:** **PENDING — NOT RATIFIED**  
**Date Prepared:** 2026-09-05  
**Baseline Commit:** 7481263  

---

## 1. Policy Question

Is the canonical chart of accounts tenant/group-wide, entity-specific, a shared canonical chart with entity applicability, or another model?

---

## 2. Current Authoritative Facts

- **[FACT]** `ledger_accounts.tenant_id` NOT NULL; **no `legal_entity_id`**
- **[FACT]** `ledger_accounts.code` is **globally unique**
- **[FACT]** `financial_periods` and `journal_entries` are legal-entity scoped
- **[FACT]** 0 accounts exist
- **[FACT]** Account classes are fixed by enum: `ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE`
- **[FACT]** Schema inconsistency: accounts are tenant-scoped while everything consuming them is entity-scoped

---

## 3. Options

| Option | Description | Migration Required | Isolation | Consolidation |
|--------|-------------|-------------------|-----------|---------------|
| **A** | Tenant/group-wide | No | Weak | Natural |
| **B** | Entity-specific | Yes (code uniqueness) | Strongest | Requires mapping |
| **C** | Shared canonical with entity applicability | Yes (mapping table) | Strong | Best fit |
| **D** | Account plus entity-as-dimension | Yes (major departure) | Flexible | Complex |

---

## 4. Consequences

### Option A (Tenant-Wide)
- No migration; matches the schema as built
- Weak entity isolation
- One "Cash" account shared across USD and TZS entities
- Strains as jurisdictions grow

### Option B (Entity-Specific)
- Strongest isolation
- **Blocked by global uniqueness** unless codes are prefixed or the constraint changes — a migration
- Consolidation requires a mapping layer that does not exist

### Option C (Shared Canonical with Entity Applicability)
- Strongest consolidation (`OBL-IFRS-CONSOL` is ACTIVE)
- Best fit for TRUST(MU/USD) → HOLDING(AE/USD) → COUNTRY_HOLDING(TZ/TZS) → operating entities
- Requires a mapping table — a migration
- Heaviest for a first pilot

### Option D (Entity-as-Dimension)
- Flexible
- Largest departure from the existing model
- Migration required

---

## 5. Recommendation

**[RECOMMENDATION]** C is architecturally safest long term. A is the only zero-migration path and cheapest for a pilot, at the cost of near-certain rework.

**Not a decision. No account codes proposed. Schema not changed.**

---

## 6. Required Authority

**Group CFO + Architecture Review Board** (Constitution Art. 11)

---

## 7. Exact Decision Wording

*"The BEYU chart of accounts is `<tenant-wide / entity-specific / shared canonical with entity applicability / other>`. Account codes follow `<numbering scheme>`. Account creation is authorised by `<role>`."*

---

## 8. Evidence Summary

| Evidence Type | Found? | Source |
|---------------|--------|--------|
| Authoritative policy document | ❌ NONE | — |
| CFO ratification | ❌ NONE | — |
| ARB co-signature | ❌ NONE | — |
| Governance resolution | ❌ NONE | — |
| Tenant-scoped schema | ✅ Supporting | `ledger_accounts.tenant_id` |
| Entity-scoped consumption | ✅ Supporting | `journal_entries.legal_entity_id` |
| Global code uniqueness | ✅ Supporting | `ledger_accounts.code` |

---

## 9. Dependencies

P6 blocks: P5, all posting, and determines whether a migration is required.

---

## 10. Historical Impact

- **Current ledger state:** Empty (0 accounts)
- **Reversibility:** Low once accounts carry immutable entries
- **Schema impact:** Choosing A now and B/C later WOULD affect posted history

---

## 11. Decision Sheet (Blank — For Authority Completion)

```
DECISION ID:            P6 — Chart of accounts scope
QUESTION:               Is the CoA tenant-wide, entity-specific, shared canonical, or another model?
RECOMMENDED OPTION:     [RECOMMENDATION] C long-term; A is the only zero-migration path — not a decision
ALTERNATIVES:           A tenant-wide · B entity-specific · C shared canonical with entity applicability · D entity dimension
CONSEQUENCES:           Determines whether a migration is required and whether consolidation is
                        natural or requires a mapping layer. Low reversibility once accounts carry
                        immutable entries.
EXACT RATIFICATION WORDING:
    "The BEYU chart of accounts is <tenant-wide / entity-specific / shared canonical with entity
     applicability / other>. Account codes follow <numbering scheme>. Account creation is
     authorised by <role>."
STATUS:                 PENDING
SIGNATORY (CFO):        __________
CO-SIGNATORY (ARB):     __________
DATE:                   __________
EFFECTIVE DATE:         __________
SCOPE:                  __________
```

---

## 12. Ratification Status

**P6 = PENDING — NOT RATIFIED**

**END OF DECISION PACKAGE**
