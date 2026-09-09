CREATE TABLE "government_agencies" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country_code" text NOT NULL,
	"category" text NOT NULL,
	"consumers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"integration_status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"interface_kind" text DEFAULT 'UNVERIFIED' NOT NULL,
	"official_docs_url" text,
	"auth_model" text DEFAULT 'UNVERIFIED' NOT NULL,
	"credential_status" text DEFAULT 'NOT_ISSUED' NOT NULL,
	"credential_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sandbox_evidence" text,
	"uat_evidence" text,
	"production_evidence" text,
	"blocked_reason" text,
	"enabled_by" text,
	"enabled_at" timestamp with time zone,
	"approval_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "government_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"agency_code" text NOT NULL,
	"submission_type" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"payload_digest" text NOT NULL,
	"payload_ref" text,
	"response_digest" text,
	"external_reference" text,
	"idempotency_key" text NOT NULL,
	"correlation_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"submitted_by_user_id" text,
	"policy_version" text,
	"approval_reference" text,
	"audit_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "government_agencies" ADD CONSTRAINT "government_agencies_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "government_submissions" ADD CONSTRAINT "government_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "government_submissions" ADD CONSTRAINT "government_submissions_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "government_submissions" ADD CONSTRAINT "government_submissions_agency_code_government_agencies_code_fk" FOREIGN KEY ("agency_code") REFERENCES "public"."government_agencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "government_submissions" ADD CONSTRAINT "government_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "government_agencies_country_idx" ON "government_agencies" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "government_agencies_category_idx" ON "government_agencies" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "government_submissions_idem_uidx" ON "government_submissions" USING btree ("tenant_id","agency_code","idempotency_key");--> statement-breakpoint
CREATE INDEX "government_submissions_tenant_idx" ON "government_submissions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "government_submissions_agency_idx" ON "government_submissions" USING btree ("agency_code");--> statement-breakpoint
CREATE INDEX "government_submissions_status_idx" ON "government_submissions" USING btree ("status");
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Value integrity — every status is a closed catalogue (like payments 0028).
-- ---------------------------------------------------------------------------
ALTER TABLE "government_agencies" ADD CONSTRAINT "government_agencies_category_check"
  CHECK ("category" IN ('TAX_AUTHORITY','HEALTH_INSURER','IDENTITY_AUTHORITY','COMPANY_REGISTRY','HEALTH_REPORTING','REGULATOR','SOCIAL_SECURITY','SAFETY_AUTHORITY','OTHER_MDA'));--> statement-breakpoint
ALTER TABLE "government_agencies" ADD CONSTRAINT "government_agencies_integration_check"
  CHECK ("integration_status" IN ('NOT_STARTED','DISCOVERY','CONTRACT_PENDING','CONTRACT_VERIFIED','IMPLEMENTING','IMPLEMENTED','SANDBOX_READY','UAT_VERIFIED','PRODUCTION_AUTHORIZATION_PENDING','PRODUCTION_READY','LIVE','DEGRADED','EXTERNAL_BLOCKED','SUSPENDED'));--> statement-breakpoint
ALTER TABLE "government_agencies" ADD CONSTRAINT "government_agencies_interface_check"
  CHECK ("interface_kind" IN ('UNVERIFIED','REST_JSON','HTTP_XML','SOAP','PORTAL_ONLY','FILE_EXCHANGE','NONE_PUBLISHED'));--> statement-breakpoint
ALTER TABLE "government_agencies" ADD CONSTRAINT "government_agencies_auth_check"
  CHECK ("auth_model" IN ('UNVERIFIED','TOKEN_BEARER','BASIC_THEN_TOKEN','MTLS_CERT','SIGNED_XML','OAUTH2','PAT','NONE'));--> statement-breakpoint
ALTER TABLE "government_agencies" ADD CONSTRAINT "government_agencies_credential_check"
  CHECK ("credential_status" IN ('NOT_ISSUED','SANDBOX_ISSUED','PRODUCTION_ISSUED','ROTATION_REQUIRED','REFUSED'));--> statement-breakpoint

-- Verified statuses require recorded evidence — a claim without evidence is
-- unrepresentable (never convert BLOCKED into PASS because code exists).
ALTER TABLE "government_agencies" ADD CONSTRAINT "government_agencies_uat_needs_evidence"
  CHECK ("integration_status" NOT IN ('UAT_VERIFIED','PRODUCTION_READY','LIVE') OR "uat_evidence" IS NOT NULL OR "production_evidence" IS NOT NULL);--> statement-breakpoint
-- Production activation is a HUMAN decision: LIVE / PRODUCTION_READY require
-- a named approver and an approval reference.
ALTER TABLE "government_agencies" ADD CONSTRAINT "government_agencies_prod_needs_approval"
  CHECK ("integration_status" NOT IN ('PRODUCTION_READY','LIVE') OR ("enabled_by" IS NOT NULL AND "approval_reference" IS NOT NULL));--> statement-breakpoint
-- EXTERNAL_BLOCKED must say exactly what is blocked (§42).
ALTER TABLE "government_agencies" ADD CONSTRAINT "government_agencies_blocked_needs_reason"
  CHECK ("integration_status" <> 'EXTERNAL_BLOCKED' OR "blocked_reason" IS NOT NULL);--> statement-breakpoint

ALTER TABLE "government_submissions" ADD CONSTRAINT "government_submissions_status_check"
  CHECK ("status" IN ('DRAFT','PENDING_EXTERNAL','SUBMITTED','ACCEPTED','REJECTED','FAILED','RETRY_REQUIRED','RECONCILIATION_REQUIRED','EXTERNAL_UNAVAILABLE','EXTERNAL_BLOCKED'));--> statement-breakpoint
-- FAIL-CLOSED (§16.9): acceptance cannot be fabricated. ACCEPTED requires the
-- government system's own reference AND a recorded response digest.
ALTER TABLE "government_submissions" ADD CONSTRAINT "government_submissions_accept_needs_reference"
  CHECK ("status" <> 'ACCEPTED' OR ("external_reference" IS NOT NULL AND "response_digest" IS NOT NULL));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Registry: global reference data, world-readable inside the database,
-- runtime-immutable (SELECT-only policy + REVOKE below), like payment_providers.
ALTER TABLE "government_agencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "government_agencies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "government_agencies_read_only" ON "government_agencies";--> statement-breakpoint
CREATE POLICY "government_agencies_read_only" ON "government_agencies" FOR SELECT
  USING (true);--> statement-breakpoint

-- Submissions: tenant + entity isolation on every command.
ALTER TABLE "government_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "government_submissions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "government_submissions_tenant_entity_isolation" ON "government_submissions";--> statement-breakpoint
CREATE POLICY "government_submissions_tenant_entity_isolation" ON "government_submissions" FOR ALL
  USING (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "government_submissions"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  )
  WITH CHECK (
    ("tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    AND EXISTS (
      SELECT 1 FROM "legal_entities" le
      WHERE le."id" = "government_submissions"."legal_entity_id"
        AND (le."tenant_id" = ANY(beyu_tenant_ids()) OR beyu_global_scope())
    )
  );--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Role grants — mirror 0028/0030: registry is runtime-immutable configuration;
-- submissions are runtime-writable (INSERT/UPDATE; no DELETE — the record of a
-- government interaction is never erased by the application).
-- Conditional on role existence so the migration replays on any environment.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT ON government_agencies TO %I', r.rolname);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON government_agencies FROM %I', r.rolname);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON government_submissions TO %I', r.rolname);
    EXECUTE format('REVOKE DELETE ON government_submissions FROM %I', r.rolname);
  END LOOP;
END
$$;
--> statement-breakpoint

-- Verification — RLS present on both tables; fail the migration otherwise.
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('government_agencies','government_submissions')
    AND rowsecurity = true;
  IF n <> 2 THEN
    RAISE EXCEPTION 'Migration 0036 verification failed: RLS missing on government tables (found %)', n;
  END IF;
END $$;
