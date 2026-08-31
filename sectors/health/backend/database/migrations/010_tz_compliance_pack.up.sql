-- Phase 3 — Tanzania Compliance Pack (registry seeds)
--
-- Machine-readable control references for Tanzania's legal/regulatory
-- framework. Statuses are evidence_required / external_dependency /
-- not_implemented — never "compliant". Operators must attach evidence
-- (tests, external verification, approvals) before promoting to
-- 'implemented'. No clinical guideline content is encoded here —
-- guidelines must be loaded into health.clinical_guidelines via a
-- controlled import process by clinical governance.

-- (No explicit BEGIN: PGlite tests run statements individually.)

INSERT INTO health.compliance_controls
  (control_id, authority, jurisdiction, category, requirement, version,
   implementation_status, evidence_reference, owner_role, risk_level,
   applicability, external_dependency, approval_required, notes)
VALUES
  ('TZ-PDPA-01', 'Tanzania Personal Data Protection Act 2022', 'TZ', 'privacy',
   'Lawful basis established for all PHI processing; consent recorded where consent is the basis.',
   '2022', 'partially_implemented', 'consent.service', 'dpo', 'critical', 'all', false, true,
   'Consent engine captures non-boolean purpose/scope/recipient/legal_basis; DPO approval required for cross-border transfers.'),

  ('TZ-PDPA-02', 'Tanzania PDPA 2022', 'TZ', 'security',
   'Access to personal data must be logged and auditable.', '2022',
   'implemented', 'audit.service', 'dpo', 'high', 'all', false, false,
   'Every PHI write flows through health.audit_log with actor/tenant/correlation IDs.'),

  ('TZ-PDPA-03', 'Tanzania PDPA 2022', 'TZ', 'security',
   'Data retention periods observed; deletion/erasure respected except where legal hold applies.', '2022',
   'partially_implemented', 'retention_policies', 'dpo', 'high', 'all', false, true,
   'Seed retention policies exist; erasure workflow requires legal-hold gating (blocked on legal_holds governance).'),

  ('TZ-PHARM-01', 'Pharmacy Act 2011 (Tanzania) / Pharmacy Council', 'TZ', 'pharmacy',
   'Prescribers and dispensers must hold valid Council-issued licences; controlled substances double-sign.', '2011',
   'external_dependency', NULL, 'pharmacy_director', 'critical', 'pharmacy', true, true,
   'Practitioner registry created (health.practitioners); verification against Pharmacy Council requires external adapter.'),

  ('TZ-TMDA-01', 'Tanzania Medicines and Medical Devices Authority (TMDA)', 'TZ', 'pharmacy',
   'Medicines/medical devices listed in inventory must reference valid TMDA registration; adverse events reportable.', '2023',
   'external_dependency', 'integrations:tmda', 'pharmacy_director', 'critical', 'pharmacy,devices', true, true,
   'TMDA adapter is a fail-closed stub (unavailable); no fabricated TMDA registration numbers are invented.'),

  ('TZ-MCT-01', 'Medical Council of Tanganyika (MCT)', 'TZ', 'workforce',
   'Doctors/specialists hold valid MCT licence; scope of practice enforced.', '2023',
   'external_dependency', NULL, 'clinical_director', 'critical', 'clinical', true, true,
   'Practitioner registry stores license_number + licensing_authority; default status = external_verification_required; MCT adapter external-blocked.'),

  ('TZ-TNMC-01', 'Tanzania Nursing and Midwifery Council (TNMC)', 'TZ', 'workforce',
   'Nurses/midwives hold valid TNMC licence; scope enforced.', '2023',
   'external_dependency', NULL, 'nursing_director', 'high', 'clinical', true, true,
   'Practitioner registry supports TNMC cadre; external verification adapter blocked on credentials.'),

  ('TZ-NHIF-01', 'National Health Insurance Fund (NHIF) Tanzania', 'TZ', 'billing',
   'Claims submitted to NHIF with valid provider credentials and member verification.', '2024',
   'external_dependency', 'integrations:nhif', 'billing_manager', 'high', 'billing', true, true,
   'NHIF adapter is a fail-closed stub (unavailable); system never returns "submitted" without a real acknowledgment.'),

  ('TZ-TRA-01', 'Tanzania Revenue Authority (TRA)', 'TZ', 'finance',
   'Tax-compliant invoicing (EFD/receipts) and financial records retained 7 years.', '2024',
   'external_dependency', 'integrations:tra', 'finance_manager', 'high', 'billing,finance', true, true,
   'TRA adapter is fail-closed; finance module is not the canonical ledger.'),

  ('TZ-MOH-MTUHA-01', 'Ministry of Health Tanzania — MTUHA / Health Management Information System', 'TZ', 'clinical',
   'Notifiable and routine reports submitted to MTUHA with provider identification.', '2023',
   'external_dependency', 'integrations:mtuha_submission', 'records_officer', 'high', 'reporting', true, true,
   'MTUHA book/section mapping + mark-submitted audit exist; actual submission adapter is fail-closed pending MoH endpoint specs.'),

  ('TZ-MOH-NOTIFIABLE-01', 'Public Health Act 2009 — Notifiable Diseases', 'TZ', 'public_health',
   'Notifiable disease events recorded and submitted to MoH within statutory windows.', '2009',
   'partially_implemented', 'public_health_events', 'medical_officer', 'critical', 'public_health', true, true,
   'health.public_health_events table + status machine (draft|validated|submitted|acknowledged|rejected|blocked); submission adapter fail-closed.'),

  ('TZ-LAB-ISO15189-01', 'ISO 15189 (lab quality) / Health Laboratory Practitioners Council TZ', 'TZ', 'lab',
   'Specimen chain-of-custody tracked; analyzer QC/calibration verified before result release.', '2012',
   'partially_implemented', 'lab_analyzers', 'lab_manager', 'high', 'lab', false, true,
   'health.lab_analyzers and chain_of_custody columns exist; QC gate in LabResultsService pending.'),

  ('TZ-RAD-RADIATION-01', 'Tanzania Atomic Energy Commission (TAEC) — Radiation Protection', 'TZ', 'radiology',
   'Ionizing studies record equipment, accession/DICOM UID, and dose; equipment QC/calibration.', '2004',
   'partially_implemented', 'imaging_equipment', 'radiology_head', 'high', 'radiology', true, true,
   'health.imaging_equipment registry exists; dose/accession/dicom_study_uid columns on imaging_orders; PACS/DICOM adapter fail-closed.'),

  ('TZ-DIALYSIS-01', 'MOH TZ / Hospital dialysis standards', 'TZ', 'clinical',
   'Dialysis machines registered; water-quality tests within 30 days; maintenance current; sessions fully auditable.', '2023',
   'implemented', 'dialysis.service', 'nephrology_head', 'high', 'dialysis', false, true,
   'DialysisService enforces maintenance/water-quality gates, state machine, adverse event capture.'),

  ('TZ-AI-01', 'MOH TZ / AI Governance (Noelia/HIVE)', 'TZ', 'ai',
   'AI-assisted outputs carry model/version/confidence and human review; no self-authorization.', '2025',
   'partially_implemented', 'ai.module', 'clinical_director', 'high', 'ai', false, true,
   'HIVE module is stub; audit fields for model/version/human-reviewer in place pending clinical decision hooks.'),

  ('ISO27799-AUD-01', 'ISO 27799 (Health informatics — information security)', 'INT', 'security',
   'PHI access audit trail captured for ≥ 7 years; integrity protected.', '2016',
   'implemented', 'audit.service', 'security_officer', 'high', 'all', false, false,
   'audit_log append-only with retention_policy = audit_logs (7 years); tamper attempts blocked by RLS.'),

  ('ISO27001-SEC-01', 'ISO/IEC 27001', 'INT', 'security',
   'Strict CSP, HSTS, COOP/COEP/CORP, Referrer-Policy applied at HTTP layer.', '2022',
   'implemented', 'main.ts', 'security_officer', 'medium', 'edge', false, false,
   'Helmet CSP/HSTS hardened; auth cookies httpOnly+secure+sameSite=lax.'),

  ('NABH-CLIN-01', 'NABH 5th Edition (reference, NOT accreditation)', 'INT', 'clinical',
   'Patient identification, consent, medication safety, incident reporting controls in place.', '5th',
   'partially_implemented', 'incidents.service,consent.service', 'quality_head', 'medium', 'clinical', false, true,
   'Controls ALIGNED with NABH chapters; no accreditation claim is made.'),

  ('FIN-PCI-01', 'PCI-DSS / BoTZ payment integration', 'INT', 'finance',
   'Cardholder data never stored; payment gateway interaction via adapter only.', '4.0',
   'external_dependency', 'integrations:payment_gateway', 'finance_manager', 'critical', 'billing', true, true,
   'Payment gateway adapter fail-closed; finance module never holds PAN/CVV.'),

  ('IETF-CORRELATION-01', 'BEYU OS Observability Standard', 'INT', 'security',
   'Every request has correlationId/requestId/causationId propagated into tx → audit → external call.', '1.0',
   'partially_implemented', 'correlation-id.middleware', 'platform', 'medium', 'all', false, false,
   'Correlation middleware populates ALS; audit writes correlation/request IDs; causation_id available; external adapter propagation pending.')

ON CONFLICT (control_id) DO UPDATE SET
  authority=EXCLUDED.authority, category=EXCLUDED.category, requirement=EXCLUDED.requirement,
  implementation_status=EXCLUDED.implementation_status, risk_level=EXCLUDED.risk_level,
  external_dependency=EXCLUDED.external_dependency, approval_required=EXCLUDED.approval_required,
  notes=EXCLUDED.notes, updated_at=now();
