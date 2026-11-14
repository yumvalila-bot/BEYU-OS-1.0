-- ============================================================================
-- 0077 — MULTI_COMPANY_MANAGEMENT: RESTRICTIVE RLS HARDENING (FORWARD FIX)
--
-- WHY THIS MIGRATION EXISTS. 0076 created the twenty MCM tables with
-- tenant-scoped RLS, but its RESTRICTIVE hardening block covered only the tables
-- whose rows are unambiguously immutable evidence. A review of the resulting
-- `pg_policies` state found ten MCM tables where DELETE remained permitted to
-- every tenant-scoped role, including the runtime role:
--
--   legal_entity_profiles        a company profile carries the verification
--                                evidence for a registration. Deleting it would
--                                erase the fact that a registration was checked.
--   entity_relationships         effective-dated chronology. An end-dated
--                                relationship is history; deleting it makes a
--                                past group structure un-reconstructable.
--   mcm_statutory_filings        the statutory filing register IS the evidence of
--                                filing. A filing is withdrawn by status
--                                (WAIVED), never by deletion.
--   intercompany_agreements      the instrument that authorises a related-party
--                                flow. A cancelled agreement is CANCELLED.
--   consolidation_entities       children of a reviewed run.
--   consolidation_adjustments    children of a reviewed run.
--   mcm_capital_allocations      a governance decision. A reversed allocation is
--                                a new proposal, never a deleted row.
--   mcm_module_links             provenance: which legal entity a shared-module
--                                record belongs to. Deleting a link silently
--                                detaches a risk, contract or obligation from the
--                                company that owns it.
--
-- The three OPERATIONAL registers keep DELETE on purpose:
--
--   mcm_procurement_register, mcm_asset_register, mcm_project_portfolio
--
-- These hold forward-looking operating records, not evidence. A mis-keyed draft
-- captured before anything references it must be withdrawable, otherwise the only
-- remedy is a falsified row. Their life cycle is expressed by `status`, and every
-- mutation is still audited by the service layer.
--
-- Migration 0076 is NOT edited: it is recorded with a checksum in
-- BEYU_MIGRATIONS, and rewriting an applied migration would break that record on
-- every existing environment. This forward migration is the correct fix.
--
-- The restrictive policies bind EVERY role, including roles provisioned after
-- this migration: a PERMISSIVE tenant-scope policy cannot re-grant what a
-- RESTRICTIVE policy denies.
-- ============================================================================

CREATE POLICY "legal_entity_profiles_no_delete" ON "legal_entity_profiles" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
CREATE POLICY "entity_relationships_no_delete" ON "entity_relationships" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
CREATE POLICY "mcm_statutory_filings_no_delete" ON "mcm_statutory_filings" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
CREATE POLICY "intercompany_agreements_no_delete" ON "intercompany_agreements" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
CREATE POLICY "consolidation_entities_no_delete" ON "consolidation_entities" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
CREATE POLICY "consolidation_adjustments_no_delete" ON "consolidation_adjustments" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
CREATE POLICY "mcm_capital_allocations_no_delete" ON "mcm_capital_allocations" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint
CREATE POLICY "mcm_module_links_no_delete" ON "mcm_module_links" AS RESTRICTIVE FOR DELETE USING (false);--> statement-breakpoint

-- A profile that has been VERIFIED cannot be silently un-verified by editing the
-- evidence pointer back to null; a re-verification is a new governed act.
CREATE POLICY "legal_entity_profiles_verified_immutable" ON "legal_entity_profiles" AS RESTRICTIVE FOR UPDATE
  USING (true)
  WITH CHECK (
    verification_state <> 'VERIFIED'
    OR (verified_by_user_id IS NOT NULL AND verification_evidence_document_id IS NOT NULL)
  );--> statement-breakpoint

-- An ownership validation is a recorded finding. Its verdict is immutable; only
-- annotations may be added. (The append-only trigger from 0076 already refuses
-- UPDATE outright on `ownership_validations`; this policy documents the intent in
-- the RLS layer too, so a future trigger change cannot silently widen it.)
CREATE POLICY "ownership_validations_no_update" ON "ownership_validations" AS RESTRICTIVE FOR UPDATE
  USING (false) WITH CHECK (false);--> statement-breakpoint
