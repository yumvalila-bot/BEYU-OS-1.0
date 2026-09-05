# Accounting Policy Approval Matrix

**Date:** 2026-09-05  
**Baseline Commit:** 7481263  
**Status:** ALL APPROVALS AWAITING  

---

## 1. Approval Requirements

### 1.1 Approval Chain

For each accounting policy decision, the following approval chain must be completed:

1. **Policy Definition** — Complete (all four decisions have complete definitions)
2. **Authority Identification** — Complete (correct authorities identified)
3. **Authority Approval** — **AWAITING** (no CFO or ARB has approved)
4. **Governance Resolution** — **AWAITING** (no resolution exists)
5. **Registry Update** — **AWAITING** (all decisions remain PENDING)
6. **Effective Date** — **AWAITING** (no effective date established)
7. **Audit Trail** — **INCOMPLETE** (no approval provenance)

### 1.2 Approval Evidence Required

For each decision, the following evidence must be recorded:

- Decision maker identity (GlobalUserID)
- Decision date (timestamp)
- Supporting document reference (file path or external reference)
- Effective date (date)
- Policy version (version number)
- Scope (JSON: tenant, entity, country)
- Approval provenance (audit trail)
- Governance resolution link (resolution_id)

---

## 2. Approval Matrix

### 2.1 P1 — Recognition Basis

| Approval Step | Required By | Status | Evidence |
|---------------|-------------|--------|----------|
| Policy definition | Engineering | ✅ COMPLETE | This document |
| Authority identification | Engineering | ✅ COMPLETE | Group CFO (Art. 5) |
| CFO approval | Group CFO | ❌ AWAITING | NONE |
| Governance resolution | Appropriate body | ❌ AWAITING | NONE |
| Registry update | System | ❌ AWAITING | PENDING → ACTIVATED |
| Effective date | Group CFO | ❌ AWAITING | NONE |
| Audit trail | System | ❌ INCOMPLETE | No approval provenance |

**Result:** P1 NOT RATIFIED

### 2.2 P6 — Chart of Accounts

| Approval Step | Required By | Status | Evidence |
|---------------|-------------|--------|----------|
| Policy definition | Engineering | ✅ COMPLETE | This document |
| Authority identification | Engineering | ✅ COMPLETE | Group CFO + ARB (Art. 11) |
| CFO approval | Group CFO | ❌ AWAITING | NONE |
| ARB co-approval | Architecture Review Board | ❌ AWAITING | NONE |
| Governance resolution | Appropriate body | ❌ AWAITING | NONE |
| Registry update | System | ❌ AWAITING | PENDING → ACTIVATED |
| Effective date | Group CFO + ARB | ❌ AWAITING | NONE |
| Audit trail | System | ❌ INCOMPLETE | No approval provenance |

**Result:** P6 NOT RATIFIED

### 2.3 P7 — Period Linkage

| Approval Step | Required By | Status | Evidence |
|---------------|-------------|--------|----------|
| Policy definition | Engineering | ✅ COMPLETE | This document |
| Authority identification | Engineering | ✅ COMPLETE | Group CFO (Art. 5) |
| CFO approval | Group CFO | ❌ AWAITING | NONE |
| Governance resolution | Appropriate body | ❌ AWAITING | NONE |
| Registry update | System | ❌ AWAITING | PENDING → ACTIVATED |
| Effective date | Group CFO | ❌ AWAITING | NONE |
| Audit trail | System | ❌ INCOMPLETE | No approval provenance |

**Result:** P7 NOT RATIFIED

### 2.4 P9 — Posting Controls

| Approval Step | Required By | Status | Evidence |
|---------------|-------------|--------|----------|
| Policy definition | Engineering | ✅ COMPLETE | This document |
| Authority identification | Engineering | ✅ COMPLETE | Group CFO (Art. 5) |
| CFO approval | Group CFO | ❌ AWAITING | NONE |
| Governance resolution | Appropriate body | ❌ AWAITING | NONE |
| Registry update | System | ❌ AWAITING | PENDING → ACTIVATED |
| Effective date | Group CFO | ❌ AWAITING | NONE |
| Audit trail | System | ❌ INCOMPLETE | No approval provenance |

**Result:** P9 NOT RATIFIED

---

## 3. Actual Approvals Found

### 3.1 Approval Search Results

**Search Scope:**
- `governance_decision_registry` — All decisions PENDING
- `resolutions` — No resolution references P1, P6, P7, or P9
- `approvals` — No approval records for accounting policy
- Documentation — No signed policy documents
- Audit trail — No approval provenance

**Result:** NO APPROVALS FOUND

### 3.2 Existing Resolutions (Non-Relevant)

| Resolution | Status | Subject | Relevance |
|------------|--------|---------|-----------|
| BEYU-BRD-2025-014 | APPROVED | Waterfall config | Not accounting policy |
| BEYU-FC-2025-007 | APPROVED | Beneficiary class | Not accounting policy |
| BEYU-IC-2025-021 | TABLED | Capital allocation | Not approved |
| BEYU-TGC-2025-031 | DRAFT | Capital allowance | Not approved |

**Finding:** No resolution authorizes accounting policy ratification

---

## 4. Missing Approvals

### 4.1 Approval Summary

| Decision | Required Approval | Authority | Status | Blocker |
|----------|------------------|-----------|--------|---------|
| P1 | Recognition basis ratification | Group CFO | AWAITING | No CFO decision |
| P6 | Chart of accounts ratification | Group CFO + ARB | AWAITING | No CFO + ARB decision |
| P7 | Period linkage ratification | Group CFO | AWAITING | No CFO decision |
| P9 | Posting controls ratification | Group CFO | AWAITING | No CFO decision |

### 4.2 Approval Blockers

1. **No governance resolution exists** — No formal resolution authorizes any accounting policy
2. **No CFO has signed a policy decision** — No CFO ratification document exists
3. **No ARB has co-signed P6** — No ARB co-signature for CoA model
4. **No effective date has been established** — No decision has an effective date
5. **No policy version has been approved** — No version control exists
6. **No audit trail is complete** — No approval provenance recorded

---

## 5. Approval Authority Verification

### 5.1 Constitutional Authority

**Article 4:** Vests material decisions in governance bodies  
**Article 5:** Vests financial consequences in the CFO  
**Article 8:** Internal Audit reports to Risk & Audit Committee  
**Article 11:** Architecture Review Board authority

### 5.2 Authority Mapping

| Decision | Required Authority | Constitutional Basis | Verified? |
|----------|-------------------|---------------------|-----------|
| P1 | Group CFO | Art. 5 | ✅ YES |
| P6 | Group CFO + ARB | Art. 5 + Art. 11 | ✅ YES |
| P7 | Group CFO | Art. 5 | ✅ YES |
| P9 | Group CFO | Art. 5 | ✅ YES |

### 5.3 Authority Verification Result

**Correct authorities identified:** ✅ YES  
**Authorities explicitly approved:** ❌ NO

---

## 6. Approval Provenance

### 6.1 Provenance Requirements

For an approval to be considered valid, the following provenance must be established:

1. **Who approved** — Decision maker identity (GlobalUserID)
2. **When approved** — Decision date (timestamp)
3. **What was approved** — Policy version and scope
4. **How approved** — Governance resolution or formal document
5. **Why approved** — Policy rationale (optional but recommended)

### 6.2 Provenance Status

| Decision | Who | When | What | How | Why | Result |
|----------|-----|------|------|-----|-----|--------|
| P1 | ❌ UNKNOWN | ❌ UNKNOWN | ❌ UNKNOWN | ❌ UNKNOWN | ❌ UNKNOWN | **NO PROVENANCE** |
| P6 | ❌ UNKNOWN | ❌ UNKNOWN | ❌ UNKNOWN | ❌ UNKNOWN | ❌ UNKNOWN | **NO PROVENANCE** |
| P7 | ❌ UNKNOWN | ❌ UNKNOWN | ❌ UNKNOWN | ❌ UNKNOWN | ❌ UNKNOWN | **NO PROVENANCE** |
| P9 | ❌ UNKNOWN | ❌ UNKNOWN | ❌ UNKNOWN | ❌ UNKNOWN | ❌ UNKNOWN | **NO PROVENANCE** |

**Result:** NO APPROVAL PROVENANCE EXISTS

---

## 7. Conclusion

**NO APPROVALS HAVE BEEN GRANTED FOR ANY ACCOUNTING POLICY DECISION.**

All four decisions remain PENDING with no authoritative approval evidence. CAP_POSTING MUST REMAIN LOCKED until proper governance approval is obtained.

---

**END OF APPROVAL MATRIX**
