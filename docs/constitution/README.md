# BEYU OS Constitution

The Constitution is stored in the database (`governance.constitution_articles`), rendered at
`/os/constitution`, and referenced by policies through `constitution_article_id`. It is the highest
authority in the ecosystem.

| # | Article | Domain |
| - | ------- | ------ |
| 1 | Supremacy of the Constitution | GOVERNANCE |
| 2 | Single Source of Truth | DATA |
| 3 | Identity and Least Privilege | SECURITY |
| 4 | Governance of Material Decisions | GOVERNANCE |
| 5 | Financial Authority and Integrity | FINANCE |
| 6 | AI Authority and Human Accountability | AI |
| 7 | Jurisdictional Compliance | COMPLIANCE |
| 8 | Auditability and Non-Repudiation | AUDIT |
| 9 | Tenant Isolation | SECURITY |
| 10 | Emergency Powers and Continuity | CONTINUITY |
| 11 | Change Control | ARCHITECTURE |
| 12 | Lawful and Ethical Operation | ETHICS |

## Module charter requirements

Every module and Sector OS must declare: purpose, authority, ownership, scope, dependencies,
inputs, outputs, policies, controls, audit requirements, data classification, API contracts, event
contracts, security requirements and compliance requirements. These are recorded in
`core.os_registry` and surfaced at `/os/registry`. **No module may exceed its constitutional
authority.**

## Conflict priority

1. BEYU Constitution
2. Legal / regulatory requirements
3. Security and privacy
4. Governance
5. Data integrity
6. Source-of-truth authority
7. Auditability
8. Business continuity
9. Operational requirements
10. User convenience

## Amendment procedure

Two-thirds majority of the Group Board plus Family Council consent, recorded as a resolution and an
Architecture Decision Record. Amendments are versioned and effective-dated; superseded articles are
retained, never deleted.

## Emergency governance

`identity.emergency_access_grants` implements break-glass access: authorised roles only,
time-limited, permission-scoped, logged, notified and subject to recorded post-event review.
Emergency powers can never permanently suspend constitutional controls.
