# BEYU OS — Compliance, privacy & data governance

## Compliance engine

`assurance.compliance_obligations` + `assurance.compliance_assessments` model regulatory
obligations per **framework, statutory reference, jurisdiction, legal entity, sector, frequency,
due date and owner**, each linked to controls and evidence documents.

Assessment states are explicit and never inferred:
`COMPLIANT` · `NON_COMPLIANT` · `PARTIALLY_COMPLIANT` · `NOT_ASSESSED` · `NOT_APPLICABLE` ·
`REQUIRES_HUMAN_REVIEW`.

Configured frameworks in the bootstrap: TRA (VAT, PAYE), Tanzania Personal Data Protection Act
2022, ISO 27001, AML/KYC (AMLA 2006), NHIF claims, IFRS 10, GDPR international transfers.
Additional frameworks (SOC 2, ISO 22301, ISO 42001, sector regulations) are configurable.

**BEYU OS makes no certification claims.** Frameworks are modelled as obligations with evidence;
compliance is never fabricated.

## Jurisdiction awareness

Rules may depend on country, state, municipality, regulator, legal entity, sector, taxpayer status,
date and transaction type. The tax engine hard-fails any attempt to apply a rule outside its
jurisdiction — a Tanzanian rule is never generalised globally. Policies carry an optional
`jurisdictionCode` and are only evaluated inside it.

## Privacy by design

- Purpose limitation and lawful basis recorded per data asset and per consent
  (`identity.consents`, `platform.data_assets.lawfulBasis`).
- Data minimisation: event payloads and AI inputs carry only what authorised consumers need.
- Classification-driven access: personal, family and clinical data default to RESTRICTED /
  HIGHLY_RESTRICTED and are suppressed from lower-clearance views (for example, compensation
  columns in HCM).
- Subject rights: access, correction, deletion where legally applicable, export and retention are
  supported by the data asset register and retention schedule.
- Breach management: incident runbook RB-07 plus statutory notification windows.

## Record retention

`platform.retention_policies` binds record type + jurisdiction → retention years + legal basis +
disposal action, with litigation hold overriding disposal. Documents carry `retentionCode` and a
`legalHold` flag.

## Data governance

Every critical data element has an **owner, steward, system of record, classification, lawful
basis, retention code, upstream/downstream lineage and quality rules**
(`platform.data_assets`). Metric definitions (`platform.metric_definitions`) bind every executive
KPI to a definition, source of truth, owner, calculation, period, unit, version and authority
status — no dashboard number exists without provenance.

## Financial control

Segregation of duties (role separation groups), maker/checker approvals, policy-driven approval
thresholds, immutable journals with reversal-only correction, period locking, reconciliation checks
in the self-test, and anomaly/fraud signals with evidence and confidence.

## Ethics

BEYU OS must not be used to conceal fraud, unlawfully hide beneficial ownership, manipulate
financial records, circumvent sanctions, launder money, evade taxes illegally, fabricate compliance
or abuse personal data (Constitution Art. 12). The tax engine hard-blocks positions classified as
`PROHIBITED_EVASION` and computes no benefit for them.
