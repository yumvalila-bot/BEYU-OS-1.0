# Accounting Policy Governance Resolution — Template

**Purpose:** This template provides the formal structure for a governance resolution to ratify accounting policy decisions.

**Status:** TEMPLATE — NOT YET RATIFIED

**Note:** This is a BLANK TEMPLATE. No accounting policy has been ratified. This document must be completed by the appropriate authority (Group CFO, Architecture Review Board, or Group Board) before any accounting policy can be considered ratified.

---

## Resolution Header

```
RESOLUTION ID:          BEYU-[BODY]-[YEAR]-[NUMBER]
BODY:                   [Governance Body Name]
MEETING DATE:           [YYYY-MM-DD]
RESOLUTION TYPE:        Accounting Policy Ratification
STATUS:                 [DRAFT | PROPOSED | APPROVED | REJECTED]
```

---

## Preamble

```
WHEREAS, the BEYU Group requires a formal accounting policy framework to govern
ledger posting, financial period management, and capital transaction recognition;

WHEREAS, the Constitution of BEYU Group vests financial authority in the Group
CFO (Article 5) and architecture authority in the Architecture Review Board
(Article 11);

WHEREAS, four critical accounting policy decisions (P1, P6, P7, P9) have been
identified as prerequisites for the activation of journal posting capabilities;

WHEREAS, these decisions require explicit ratification by the appropriate
authority before any ledger posting may occur;

NOW, THEREFORE, BE IT RESOLVED that the following accounting policy decisions
are hereby [ratified / rejected / tabled]:
```

---

## P1 — Recognition Basis

```
DECISION ID:            P1
TITLE:                  Accounting Recognition Basis
QUESTION:               When a capital transaction creates an economic obligation
                        before cash settlement, what event triggers accounting
                        recognition?

DECISION:               [Option A / B / C / D]

EXACT WORDING:          "BEYU recognises capital expenditure on a [cash / accrual]
                        basis. The recognition event is [commitment / invoice
                        receipt / receipt of goods or services / payment].
                        Recognition is independent of governance approval and of
                        cash settlement. Where an obligation is recognised before
                        payment, the entity debits [asset class] and credits
                        [payable class]; settlement is a separate posting."

EFFECTIVE DATE:         [YYYY-MM-DD]
SCOPE:                  [Tenant-wide / Entity-specific / Global]
APPROVING AUTHORITY:    Group CFO (Constitution Art. 5)
DECISION MAKER:         [Name, GlobalUserID]
DECISION DATE:          [YYYY-MM-DD]
SUPPORTING DOCUMENT:    [Document reference]
PROVENANCE:             GOVERNED
```

---

## P6 — Chart of Accounts

```
DECISION ID:            P6
TITLE:                  Chart of Accounts Scope
QUESTION:               Is the canonical chart of accounts tenant/group-wide,
                        entity-specific, a shared canonical chart with entity
                        applicability, or another model?

DECISION:               [Option A / B / C / D]

EXACT WORDING:          "The BEYU chart of accounts is [tenant-wide / entity-specific
                        / shared canonical with entity applicability / other].
                        Account codes follow [numbering scheme]. Account creation
                        is authorised by [role]."

EFFECTIVE DATE:         [YYYY-MM-DD]
SCOPE:                  [Tenant-wide / Entity-specific / Global]
APPROVING AUTHORITY:    Group CFO + Architecture Review Board (Art. 5 + Art. 11)
DECISION MAKER (CFO):   [Name, GlobalUserID]
DECISION MAKER (ARB):   [Name, GlobalUserID]
DECISION DATE:          [YYYY-MM-DD]
SUPPORTING DOCUMENT:    [Document reference]
PROVENANCE:             GOVERNED
```

---

## P7 — Period Linkage

```
DECISION ID:            P7
TITLE:                  Period-Mandatory Rule
QUESTION:               Must every journal posting belong to an open, entity-valid
                        financial period?

DECISION:               [Option A / B / C]

EXACT WORDING:          "Every journal entry must reference a financial period of
                        the same legal entity in status [OPEN]. Postings are
                        rejected where no such period exists. The period is
                        selected by the [transaction / posting] date. Where a
                        period is reopened, [only reversing entries / all entries]
                        may be posted."

EFFECTIVE DATE:         [YYYY-MM-DD]
SCOPE:                  [Tenant-wide / Entity-specific / Global]
APPROVING AUTHORITY:    Group CFO (Constitution Art. 5)
DECISION MAKER:         [Name, GlobalUserID]
DECISION DATE:          [YYYY-MM-DD]
SUPPORTING DOCUMENT:    [Document reference]
PROVENANCE:             GOVERNED
```

---

## P9 — Posting Controls

```
DECISION ID:            P9
TITLE:                  Posting Controls (Maker/Checker Model)
QUESTION:               What is the segregation-of-duties model for journal
                        posting, and may the Group CFO post and approve the same
                        entry?

DECISION:               [Option A / B / C / D / E / F]

EXACT WORDING:          "Journal posting requires a maker holding [permission] and
                        a checker holding [permission]. The same natural person
                        [may / may not] act as both maker and checker
                        [unconditionally / below threshold]. The Group CFO [may /
                        may not] self-approve. Reversing entries [require / do not
                        require] independent approval. Delegated checker authority
                        [is / is not] permitted under the existing delegation
                        model. AI-initiated actions may not act as maker or
                        checker."

EFFECTIVE DATE:         [YYYY-MM-DD]
SCOPE:                  [Tenant-wide / Entity-specific / Global]
APPROVING AUTHORITY:    Group CFO (Constitution Art. 5)
DECISION MAKER:         [Name, GlobalUserID]
DECISION DATE:          [YYYY-MM-DD]
SUPPORTING DOCUMENT:    [Document reference]
PROVENANCE:             GOVERNED
```

---

## Conditional Decisions (If Required)

### B-04 — Fiscal Year Convention (Component of P6)

```
DECISION ID:            B-04
TITLE:                  Fiscal Year Convention
QUESTION:               What is BEYU's fiscal year end?

DECISION:               [Calendar year / TZ statutory year / Other]

EXACT WORDING:          "The BEYU Group fiscal year ends on [date], applicable to
                        [all entities / listed entities]."

EFFECTIVE DATE:         [YYYY-MM-DD]
SCOPE:                  [Group-wide / Entity-specific]
APPROVING AUTHORITY:    Group Board
DECISION MAKER:         [Name, GlobalUserID]
DECISION DATE:          [YYYY-MM-DD]
SUPPORTING DOCUMENT:    [Document reference]
PROVENANCE:             GOVERNED
```

### B-09 — New Capability Creation (Conditional on P8/P9)

```
DECISION ID:            B-09
TITLE:                  New Capability Creation
QUESTION:               Does the Board authorise creating a new finance capability?

DECISION:               [Authorise / Decline]

EXACT WORDING:          "The Group Board [authorises / declines] the creation of
                        [permission], excluded from the GROUP_CEO permission set
                        and denied to AI-initiated actions under CONST-AI-001."

EFFECTIVE DATE:         [YYYY-MM-DD]
SCOPE:                  [Group-wide]
APPROVING AUTHORITY:    Group Board
DECISION MAKER:         [Name, GlobalUserID]
DECISION DATE:          [YYYY-MM-DD]
SUPPORTING DOCUMENT:    [Document reference]
PROVENANCE:             GOVERNED
```

---

## Activation Authorization

```
UPON RATIFICATION of the above accounting policy decisions, the following
capabilities are hereby authorized for activation:

CAPABILITY:             CAP_POSTING
DESCRIPTION:            Journal posting to the ledger
REQUIRED DECISIONS:     P1, P6, P7, P9
ACTIVATION STATUS:      [LOCKED / ACTIVATION_READY / ACTIVATED]
EFFECTIVE DATE:         [YYYY-MM-DD]
AUTHORIZING AUTHORITY:  [As per individual decisions above]
CONDITIONS:             [Any conditions or restrictions]
```

---

## Voting Record

```
VOTING BODY:            [Governance Body Name]
MEETING DATE:           [YYYY-MM-DD]
QUORUM:                 [Yes / No]

MEMBERS PRESENT:
- [Name, Role, GlobalUserID]
- [Name, Role, GlobalUserID]
- [Name, Role, GlobalUserID]

VOTES:
- IN FAVOUR:            [Count]
- AGAINST:              [Count]
- ABSTentions:          [Count]

RESULT:                 [APPROVED / REJECTED / TABLED]
```

---

## Signatures

```
APPROVED BY:

_________________________
[Name]
[Role]
[GlobalUserID]
Date: [YYYY-MM-DD]

_________________________
[Name]
[Role]
[GlobalUserID]
Date: [YYYY-MM-DD]

(Additional signatures as required)
```

---

## Implementation Instructions

```
UPON APPROVAL of this resolution, the following actions shall be taken:

1. Update governance_decision_registry:
   - Set status = ACTIVATED for P1, P6, P7, P9
   - Set activation_status = ACTIVATED
   - Populate approving_body, decision_maker, resolution_id
   - Populate approval_date, effective_from, scope, provenance

2. Update governance_capability_registry:
   - Set activation_status = ACTIVATED for CAP_POSTING
   - Populate activated_at, activated_by

3. Notify relevant stakeholders:
   - Group CFO
   - Architecture Review Board (for P6)
   - Internal Audit
   - Engineering team

4. Execute activation:
   - Run full test suite
   - Monitor initial postings
   - Verify authorization enforcement
   - Verify audit trail completeness
```

---

## Certification

```
I hereby certify that this resolution has been properly authorized by the
appropriate governance body and that all required approvals have been obtained.

CERTIFIED BY:

_________________________
[Name]
[Role]
[GlobalUserID]
Date: [YYYY-MM-DD]
```

---

## Important Notes

1. **This is a TEMPLATE.** No accounting policy has been ratified using this template.

2. **No pre-filled values.** All fields are blank and must be completed by the appropriate authority.

3. **No engineering assumptions.** Engineering implementation does not constitute policy ratification.

4. **No AI approval.** AI cannot create approvals or forge governance provenance.

5. **CAP_POSTING remains LOCKED** until this resolution is properly completed and approved.

---

**END OF TEMPLATE**
