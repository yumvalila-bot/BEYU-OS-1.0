-- Phase 6C — pre-ratification decision and capability registry.
--
-- PURPOSE. BEYU OS has repeatedly reached the same boundary: no accounting authority exists, so
-- no accounting capability may execute. That blocks EXECUTION. It does not block building the
-- rails that a future ratification will run on. This migration creates the minimum structure
-- needed to RECEIVE, VERIFY and ACTIVATE a future authoritative decision, while keeping every
-- unratified capability locked.
--
-- WHAT THIS DOES NOT DO. It encodes no accounting policy. Every policy-dependent column
-- (approving body, decision maker, approval date, effective dates, scope, conditions, evidence)
-- is NULLABLE and is seeded NULL. No recognition basis, chart of accounts, period, rate,
-- threshold, fiscal year or treatment appears anywhere in this migration. The registry records
-- that a decision is PENDING and who must make it — never what the answer is.
--
-- NEW ENUM JUSTIFICATION (adding a status is otherwise prohibited). beyu_version_status describes
-- document versions and cannot separate EFFECTIVE from RATIFIED. beyu_decision_status is the
-- resolution voting lifecycle and ends at the vote. beyu_authority_status is closest but collapses
-- RATIFIED and ACTIVATED into AUTHORITATIVE, and is already used by four unrelated tables, so
-- widening it would silently change their meaning. The registry must preserve
-- PENDING != RATIFIED, RATIFIED != ACTIVATED, APPROVED != EXECUTION AUTHORITY.
--
-- FAIL-CLOSED. activation_status defaults to 'LOCKED' on both tables. A capability becomes
-- executable only by an explicit transition, never implicitly.
--
-- resolution_id carries ON DELETE RESTRICT, matching migrations 0007 and 0009: a decision may
-- cite only governance evidence that exists, and that evidence cannot later be deleted.

CREATE TYPE "public"."beyu_decision_activation_state" AS ENUM('PENDING', 'APPROVED', 'EFFECTIVE', 'RATIFIED', 'ACTIVATION_READY', 'ACTIVATED', 'SUSPENDED', 'SUPERSEDED', 'RETIRED');--> statement-breakpoint

CREATE TABLE "governance_decision_registry" (
  "decision_id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "status" "beyu_decision_activation_state" DEFAULT 'PENDING' NOT NULL,
  "required_authority" text NOT NULL,
  "approving_body" text,
  "decision_maker" text,
  "resolution_id" text,
  "provenance" text,
  "approval_date" timestamp with time zone,
  "effective_from" date,
  "effective_to" date,
  "scope" jsonb,
  "conditions" text,
  "evidence" text,
  "supersedes" text,
  "audit_reference" text,
  "dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "acceptance_criteria" text NOT NULL,
  "implementation_status" text DEFAULT 'NOT_IMPLEMENTED' NOT NULL,
  "activation_status" text DEFAULT 'LOCKED' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "governance_capability_registry" (
  "capability_code" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "required_decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "activation_status" text DEFAULT 'LOCKED' NOT NULL,
  "execution_permission" text,
  "implementation_status" text DEFAULT 'NOT_IMPLEMENTED' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "governance_decision_registry" ADD CONSTRAINT "governance_decision_registry_resolution_id_resolutions_id_fk"
  FOREIGN KEY ("resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE restrict;--> statement-breakpoint

-- Fail-closed invariants. A decision cannot claim to be activated without the authority that
-- would justify it, and cannot cite an effective window that is inverted.
ALTER TABLE "governance_decision_registry" ADD CONSTRAINT "decision_registry_activation_requires_authority"
  CHECK (activation_status <> 'ACTIVATED' OR (status = 'ACTIVATED' AND resolution_id IS NOT NULL));--> statement-breakpoint
ALTER TABLE "governance_decision_registry" ADD CONSTRAINT "decision_registry_effective_window_ordered"
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from);--> statement-breakpoint
ALTER TABLE "governance_decision_registry" ADD CONSTRAINT "decision_registry_activation_status_valid"
  CHECK (activation_status IN ('LOCKED', 'ACTIVATION_READY', 'ACTIVATED'));--> statement-breakpoint
ALTER TABLE "governance_capability_registry" ADD CONSTRAINT "capability_registry_activation_status_valid"
  CHECK (activation_status IN ('LOCKED', 'ACTIVATION_READY', 'ACTIVATED'));--> statement-breakpoint

CREATE INDEX "governance_decision_registry_status_idx" ON "governance_decision_registry" USING btree ("status");--> statement-breakpoint
CREATE INDEX "governance_decision_registry_activation_idx" ON "governance_decision_registry" USING btree ("activation_status");--> statement-breakpoint
CREATE INDEX "governance_capability_registry_activation_idx" ON "governance_capability_registry" USING btree ("activation_status");
