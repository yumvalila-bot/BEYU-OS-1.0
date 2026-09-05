# Accounting Policy Evidence Matrix

**Date:** 2026-09-05  
**Baseline Commit:** 7481263  
**Status:** ALL EVIDENCE IS SUPPORTING — NO AUTHORITATIVE EVIDENCE EXISTS  

---

## 1. Evidence Classification Standards

### 1.1 Authoritative Evidence

Evidence that constitutes a ratified accounting policy decision:
- Signed CFO decision document
- Signed ARB co-signature (for P6)
- Governance resolution with APPROVED status
- Registry entry with `status = ACTIVATED`
- Approval record with maker/checker provenance
- Policy document with version, effective date, and scope

### 1.2 Supporting Evidence

Evidence that informs but does not constitute a decision:
- Schema constraints
- Implementation details
- Control requirements
- Constitutional provisions
- Existing obligations
- Technical architecture

### 1.3 Classification Rule

**Repository evidence is not a decision. Recommendations are not decisions. Implementation convenience is not accounting authority.**

---

## 2. Evidence Inventory

### 2.1 P1 — Recognition Basis

| ID | Evidence | Source | Location | Classification | Authoritative? |
|----|----------|--------|----------|----------------|----------------|
| EV-P1-001 | IFRS accounting basis | `entities.accounting_standard` | Database | SUPPORTING | ❌ NO |
| EV-P1-002 | Reversal-only correction | Migration 0005 | Code | SUPPORTING | ❌ NO |
| EV-P1-003 | Art. 5 corrections | Constitution | Governance | SUPPORTING | ❌ NO |
| EV-P1-004 | No invoice/PO/GR concept | Schema scan | Code | SUPPORTING | ❌ NO |

**Authoritative Evidence:** ❌ NONE

### 2.2 P6 — Chart of Accounts

| ID | Evidence | Source | Location | Classification | Authoritative? |
|----|----------|--------|----------|----------------|----------------|
| EV-P6-001 | Tenant-scoped accounts | `ledger_accounts.tenant_id` | Schema | SUPPORTING | ❌ NO |
| EV-P6-002 | Global code uniqueness | `ledger_accounts.code` | Schema | SUPPORTING | ❌ NO |
| EV-P6-003 | Entity-scoped consumption | `journal_entries.legal_entity_id` | Schema | SUPPORTING | ❌ NO |
| EV-P6-004 | 0 accounts exist | Database | Database | SUPPORTING | ❌ NO |
| EV-P6-005 | Account class enum | Schema | Code | SUPPORTING | ❌ NO |

**Authoritative Evidence:** ❌ NONE

### 2.3 P7 — Period Linkage

| ID | Evidence | Source | Location | Classification | Authoritative? |
|----|----------|--------|----------|----------------|----------------|
| EV-P7-001 | Nullable period_id | `journal_entries.period_id` | Schema | SUPPORTING | ❌ NO |
| EV-P7-002 | Entity-scoped entries | `journal_entries.legal_entity_id` | Schema | SUPPORTING | ❌ NO |
| EV-P7-003 | Monthly filing obligation | `OBL-TZ-VAT` | Obligations | SUPPORTING | ❌ NO |
| EV-P7-004 | 0 periods exist | Database | Database | SUPPORTING | ❌ NO |
| EV-P7-005 | No period permission | Permission catalogue | Code | SUPPORTING | ❌ NO |

**Authoritative Evidence:** ❌ NONE

### 2.4 P9 — Posting Controls

| ID | Evidence | Source | Location | Classification | Authoritative? |
|----|----------|--------|----------|----------------|----------------|
| EV-P9-001 | HIGH_RISK permission | `constants.ts` | Code | SUPPORTING | ❌ NO |
| EV-P9-002 | GROUP_CFO sole holder | RBAC config | Code | SUPPORTING | ❌ NO |
| EV-P9-003 | CEO wildcard exclusion | `constants.ts` | Code | SUPPORTING | ❌ NO |
| EV-P9-004 | Maker/checker control | `CTL-FIN-002` | Controls | SUPPORTING | ❌ NO |
| EV-P9-005 | AI denial | `CONST-AI-001 r3` | Governance | SUPPORTING | ❌ NO |
| EV-P9-006 | `finance:ledger.approve` missing | Schema + code | Code | SUPPORTING | ❌ NO |
| EV-P9-007 | `approved_by` unwritten | Schema | Database | SUPPORTING | ❌ NO |

**Authoritative Evidence:** ❌ NONE

---

## 3. Missing Evidence

### 3.1 P1 — Missing Evidence

| Required Evidence | Authority | Status |
|-------------------|-----------|--------|
| CFO ratification of recognition basis | Group CFO | ❌ AWAITING |
| Decision document with effective date | Group CFO | ❌ AWAITING |
| Governance resolution | Appropriate body | ❌ AWAITING |
| Registry update to ACTIVATED | System | ❌ AWAITING |

### 3.2 P6 — Missing Evidence

| Required Evidence | Authority | Status |
|-------------------|-----------|--------|
| CFO ratification of CoA model | Group CFO | ❌ AWAITING |
| ARB co-signature | Architecture Review Board | ❌ AWAITING |
| Decision document with effective date | Group CFO + ARB | ❌ AWAITING |
| Governance resolution | Appropriate body | ❌ AWAITING |
| Registry update to ACTIVATED | System | ❌ AWAITING |

### 3.3 P7 — Missing Evidence

| Required Evidence | Authority | Status |
|-------------------|-----------|--------|
| CFO ratification of period rule | Group CFO | ❌ AWAITING |
| Decision document with effective date | Group CFO | ❌ AWAITING |
| Governance resolution | Appropriate body | ❌ AWAITING |
| Registry update to ACTIVATED | System | ❌ AWAITING |

### 3.4 P9 — Missing Evidence

| Required Evidence | Authority | Status |
|-------------------|-----------|--------|
| CFO ratification of SoD model | Group CFO | ❌ AWAITING |
| Decision document with effective date | Group CFO | ❌ AWAITING |
| Governance resolution | Appropriate body | ❌ AWAITING |
| Registry update to ACTIVATED | System | ❌ AWAITING |

---

## 4. Evidence Sufficiency Assessment

### 4.1 Sufficiency Criteria

For a decision to be considered RATIFIED, the following evidence must exist:

1. ✅ Policy definition (complete)
2. ❌ Authoritative evidence (NONE exists)
3. ✅ Correct authority identified
4. ❌ Authority explicitly approved (NONE exists)
5. ❌ Approval provenance verified (NONE exists)
6. ❌ Correct policy version approved (NONE exists)
7. ❌ Effective date established (NONE exists)
8. ❌ Governance resolution (NONE exists)
9. ❌ Registry entry ACTIVATED (NONE exists)
10. ❌ Audit trail (INCOMPLETE)

### 4.2 Sufficiency Matrix

| Decision | Policy | Evidence | Authority | Approval | Provenance | Version | Date | Resolution | Registry | Audit | Result |
|----------|--------|----------|-----------|----------|------------|---------|------|-----------|---------|-------|--------|
| P1 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **NOT RATIFIED** |
| P6 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **NOT RATIFIED** |
| P7 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **NOT RATIFIED** |
| P9 | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **NOT RATIFIED** |

---

## 5. Conclusion

**NO AUTHORITATIVE EVIDENCE EXISTS FOR ANY ACCOUNTING POLICY DECISION.**

All evidence found is supporting (implementation details, schema constraints, control requirements). None constitutes authoritative accounting policy ratification.

**ALL FOUR DECISIONS REMAIN PENDING.**

---

**END OF EVIDENCE MATRIX**
