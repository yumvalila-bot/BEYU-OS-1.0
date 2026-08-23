-- Phase 5R — governance provenance referential integrity (policy-independent).
--
-- Phase 5P added a foreign key to policies.approved_by_resolution_id after proving a policy
-- could cite a fabricated resolution id. That audit fixed ONE column. Phase 5R re-ran the same
-- attack across the whole schema and found the defect is systemic: SEVEN further columns claim
-- governance provenance ("this object was approved by that resolution") with no referential
-- integrity at all. A capital request for USD 999,999 was successfully persisted in a scratch
-- database citing 'RES_DOES_NOT_EXIST_AT_ALL'.
--
-- Constitution Art. 4, verbatim: "Every material decision must be traceable to who, what, when,
-- why, under which authority, on which data, under which policy, with which approvals and with
-- which consequences." A citation that points at nothing is not traceability.
--
-- This migration is POLICY-INDEPENDENT. It asserts only that a cited resolution must EXIST.
-- It deliberately does NOT assert:
--   * that the column be NOT NULL (that would require governance to decide that provenance is
--     mandatory, and would immediately invalidate existing rows), or
--   * that the referenced resolution be APPROVED (that would encode an unratified rule about
--     what "approved by" means, and CAP-2025-004 currently cites a TABLED resolution).
-- Both remain [GOVERNANCE DECISION REQUIRED] — see
-- docs/governance/GOVERNANCE_AUTHORITY_GAP_REGISTER.md.
--
-- ON DELETE RESTRICT matches the precedent set by 0007: governance evidence cannot be destroyed
-- while a dependent object still relies on it.
--
-- Verified before writing: 0 orphaned references exist across all seven columns, so every
-- constraint below validates against current data without repair. Non-destructive and reversible
-- (each can be dropped without data loss).

ALTER TABLE beneficiaries DROP CONSTRAINT IF EXISTS beneficiaries_approved_by_resolution_id_resolutions_id_fk;--> statement-breakpoint
ALTER TABLE beneficiaries ADD CONSTRAINT beneficiaries_approved_by_resolution_id_resolutions_id_fk
  FOREIGN KEY (approved_by_resolution_id) REFERENCES resolutions(id) ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE capital_requests DROP CONSTRAINT IF EXISTS capital_requests_resolution_id_resolutions_id_fk;--> statement-breakpoint
ALTER TABLE capital_requests ADD CONSTRAINT capital_requests_resolution_id_resolutions_id_fk
  FOREIGN KEY (resolution_id) REFERENCES resolutions(id) ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE foundation_programs DROP CONSTRAINT IF EXISTS foundation_programs_funding_resolution_id_resolutions_id_fk;--> statement-breakpoint
ALTER TABLE foundation_programs ADD CONSTRAINT foundation_programs_funding_resolution_id_resolutions_id_fk
  FOREIGN KEY (funding_resolution_id) REFERENCES resolutions(id) ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE regulatory_changes DROP CONSTRAINT IF EXISTS regulatory_changes_adoption_resolution_id_resolutions_id_fk;--> statement-breakpoint
ALTER TABLE regulatory_changes ADD CONSTRAINT regulatory_changes_adoption_resolution_id_resolutions_id_fk
  FOREIGN KEY (adoption_resolution_id) REFERENCES resolutions(id) ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE tax_strategy_assessments DROP CONSTRAINT IF EXISTS tax_strategy_assessments_approved_by_resolution_id_resolutions_id_fk;--> statement-breakpoint
ALTER TABLE tax_strategy_assessments ADD CONSTRAINT tax_strategy_assessments_approved_by_resolution_id_resolutions_id_fk
  FOREIGN KEY (approved_by_resolution_id) REFERENCES resolutions(id) ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE waterfall_configs DROP CONSTRAINT IF EXISTS waterfall_configs_approved_by_resolution_id_resolutions_id_fk;--> statement-breakpoint
ALTER TABLE waterfall_configs ADD CONSTRAINT waterfall_configs_approved_by_resolution_id_resolutions_id_fk
  FOREIGN KEY (approved_by_resolution_id) REFERENCES resolutions(id) ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE waterfall_runs DROP CONSTRAINT IF EXISTS waterfall_runs_approved_by_resolution_id_resolutions_id_fk;--> statement-breakpoint
ALTER TABLE waterfall_runs ADD CONSTRAINT waterfall_runs_approved_by_resolution_id_resolutions_id_fk
  FOREIGN KEY (approved_by_resolution_id) REFERENCES resolutions(id) ON DELETE RESTRICT;
