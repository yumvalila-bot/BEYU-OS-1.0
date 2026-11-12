-- FINANCE_OS tax return working papers. Drafts are never treated as filed,
-- accepted, or approved for CAP_POSTING.
CREATE TABLE IF NOT EXISTS "tax_return_drafts" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "legal_entity_id" text NOT NULL REFERENCES "legal_entities"("id"),
  "tax_type" text NOT NULL,
  "jurisdiction_code" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "due_date" date,
  "amount_payable" numeric(18,2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'TZS',
  "calculation_version" text NOT NULL,
  "calculation_payload" jsonb NOT NULL,
  "filing_pack" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "classification" "beyu_classification" NOT NULL DEFAULT 'CONFIDENTIAL',
  "idempotency_key" text NOT NULL,
  "created_by" text NOT NULL,
  "specialist_reviewer_id" text,
  "specialist_reviewed_at" timestamptz,
  "approved_by" text,
  "approved_at" timestamptz,
  "submitted_at" timestamptz,
  "submitted_by" text,
  "external_reference" text,
  "accepted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tax_return_drafts_period_ck" CHECK ("period_end" >= "period_start"),
  CONSTRAINT "tax_return_drafts_amount_ck" CHECK ("amount_payable" >= 0),
  CONSTRAINT "tax_return_drafts_currency_ck" CHECK ("currency" = 'TZS'),
  CONSTRAINT "tax_return_drafts_jurisdiction_ck" CHECK ("jurisdiction_code" = 'TZ_MAINLAND'),
  CONSTRAINT "tax_return_drafts_type_ck" CHECK ("tax_type" IN (
    'PAYE', 'CORPORATE_INCOME_TAX', 'PERSONAL_INCOME_TAX',
    'PRESUMPTIVE_INCOME_TAX', 'VAT', 'VAT_WITHHOLDING', 'WITHHOLDING_TAX', 'CUSTOMS_PROCESSING_FEE'
  )),
  CONSTRAINT "tax_return_drafts_status_ck" CHECK ("status" IN (
    'DRAFT', 'PENDING_SPECIALIST_REVIEW', 'SPECIALIST_REVIEWED_PROVISIONAL', 'PENDING_FINANCE_APPROVAL', 'APPROVED_FOR_SUBMISSION',
    'SUBMITTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'
  )),
  CONSTRAINT "tax_return_drafts_classification_ck" CHECK ("classification"::text IN (
    'PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'HIGHLY_RESTRICTED'
  )),
  CONSTRAINT "tax_return_drafts_specialist_review_gate_ck" CHECK (
    "status" NOT IN ('SPECIALIST_REVIEWED_PROVISIONAL', 'PENDING_FINANCE_APPROVAL', 'APPROVED_FOR_SUBMISSION', 'SUBMITTED', 'ACCEPTED')
    OR ("specialist_reviewer_id" IS NOT NULL AND "specialist_reviewed_at" IS NOT NULL)
  ),
  CONSTRAINT "tax_return_drafts_review_gate_ck" CHECK (
    "status" NOT IN ('APPROVED_FOR_SUBMISSION', 'SUBMITTED', 'ACCEPTED')
    OR (
      "specialist_reviewer_id" IS NOT NULL AND "specialist_reviewed_at" IS NOT NULL
      AND "approved_by" IS NOT NULL AND "approved_at" IS NOT NULL
    )
  ),
  CONSTRAINT "tax_return_drafts_submission_gate_ck" CHECK (
    "status" NOT IN ('SUBMITTED', 'ACCEPTED')
    OR ("submitted_at" IS NOT NULL AND "submitted_by" IS NOT NULL AND "external_reference" IS NOT NULL)
  ),
  CONSTRAINT "tax_return_drafts_acceptance_gate_ck" CHECK (
    "status" <> 'ACCEPTED' OR ("accepted_at" IS NOT NULL AND "external_reference" IS NOT NULL)
  ),
  CONSTRAINT "tax_return_drafts_filing_json_ck" CHECK (
    jsonb_typeof("calculation_payload") = 'object'
    AND jsonb_typeof("filing_pack") = 'object'
  )
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "tax_return_drafts_tenant_idempotency_uidx"
  ON "tax_return_drafts" ("tenant_id", "idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_return_drafts_tenant_entity_idx"
  ON "tax_return_drafts" ("tenant_id", "legal_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_return_drafts_due_status_idx"
  ON "tax_return_drafts" ("due_date", "status");--> statement-breakpoint

ALTER TABLE "tax_return_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tax_return_drafts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tax_return_drafts_scope" ON "tax_return_drafts";--> statement-breakpoint
CREATE POLICY "tax_return_drafts_scope" ON "tax_return_drafts"
  USING (
    "tenant_id" = ANY (beyu_tenant_ids())
    AND "classification"::text = ANY (string_to_array(current_setting('beyu.governance_classifications', true), ','))
    AND EXISTS (
      SELECT 1 FROM "legal_entities" e
      WHERE e."id" = "tax_return_drafts"."legal_entity_id"
        AND e."tenant_id" = "tax_return_drafts"."tenant_id"
    )
  )
  WITH CHECK (
    "tenant_id" = ANY (beyu_tenant_ids())
    AND "classification" = ANY (string_to_array(current_setting('beyu.governance_classifications', true), ','))
    AND EXISTS (
      SELECT 1 FROM "legal_entities" e
      WHERE e."id" = "tax_return_drafts"."legal_entity_id"
        AND e."tenant_id" = "tax_return_drafts"."tenant_id"
    )
  );--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beyu_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON "tax_return_drafts" TO beyu_runtime;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND c.relname = 'tax_return_drafts' AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'tax_return_drafts must have ENABLE and FORCE ROW LEVEL SECURITY';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tax_return_drafts_scope') THEN
    RAISE EXCEPTION 'tax_return_drafts tenant/classification isolation policy is required';
  END IF;
END $$;
