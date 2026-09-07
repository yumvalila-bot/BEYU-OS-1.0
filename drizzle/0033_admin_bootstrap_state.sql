CREATE TABLE "admin_bootstrap_state" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"admin_user_id" text,
	"enrollment_started_at" timestamp with time zone,
	"sealed_at" timestamp with time zone,
	"sealed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_enrollment_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"admin_user_id" text NOT NULL,
	"email" text NOT NULL,
	"step" text DEFAULT 'MFA_PENDING' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"password_hash" text NOT NULL,
	"password_algo" text DEFAULT 'scrypt' NOT NULL,
	"mfa_secret_encrypted" text NOT NULL,
	"mfa_recovery_codes_hash" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mfa_last_accepted_step" integer,
	"mfa_failed_attempts" integer DEFAULT 0 NOT NULL,
	"mfa_locked_until" timestamp with time zone,
	"ip_address" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_bootstrap_state" ADD CONSTRAINT "admin_bootstrap_state_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_bootstrap_state" ADD CONSTRAINT "admin_bootstrap_state_sealed_by_user_id_users_id_fk" FOREIGN KEY ("sealed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_enrollment_sessions" ADD CONSTRAINT "admin_enrollment_sessions_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_enrollment_sessions_token_uidx" ON "admin_enrollment_sessions" USING btree ("token_hash");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- BEYU OS secure first-administrator bootstrap — durability & safety guards.
--
-- These constraints and the seal-terminal trigger are the load-bearing
-- invariants of the one-time enrollment ceremony. They are enforced in the
-- DATABASE so they hold even against a compromised runtime role or a logic
-- regression in the application layer.
-- ---------------------------------------------------------------------------

-- Exactly one bootstrap-state row can ever exist (single control record).
ALTER TABLE "admin_bootstrap_state"
  ADD CONSTRAINT "admin_bootstrap_state_singleton_chk" CHECK ("id" = 'SINGLETON');--> statement-breakpoint

-- Only the three defined lifecycle states are representable.
ALTER TABLE "admin_bootstrap_state"
  ADD CONSTRAINT "admin_bootstrap_state_status_chk"
  CHECK ("status" IN ('AVAILABLE', 'IN_PROGRESS', 'SEALED'));--> statement-breakpoint

-- A SEALED state must always record who sealed it and when — no anonymous seal.
ALTER TABLE "admin_bootstrap_state"
  ADD CONSTRAINT "admin_bootstrap_state_sealed_evidence_chk"
  CHECK (
    "status" <> 'SEALED'
    OR ("sealed_at" IS NOT NULL AND "sealed_by_user_id" IS NOT NULL AND "admin_user_id" IS NOT NULL)
  );--> statement-breakpoint

ALTER TABLE "admin_enrollment_sessions"
  ADD CONSTRAINT "admin_enrollment_sessions_step_chk"
  CHECK ("step" IN ('MFA_PENDING', 'MFA_VERIFIED', 'CONSUMED'));--> statement-breakpoint

ALTER TABLE "admin_enrollment_sessions"
  ADD CONSTRAINT "admin_enrollment_sessions_status_chk"
  CHECK ("status" IN ('ACTIVE', 'CONSUMED', 'EXPIRED'));--> statement-breakpoint

-- SEAL IS TERMINAL. Once the bootstrap is SEALED it can never be updated or
-- deleted. This is the database-level guarantee that a normal authenticated
-- user (or a compromised runtime role) cannot re-open the enrollment path.
CREATE OR REPLACE FUNCTION beyu_admin_bootstrap_seal_is_terminal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BEYU OS bootstrap state is permanent and cannot be deleted';
  END IF;
  IF OLD.status = 'SEALED' THEN
    RAISE EXCEPTION 'BEYU OS bootstrap has been sealed and cannot be reopened';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS beyu_admin_bootstrap_seal_guard ON "admin_bootstrap_state";--> statement-breakpoint
CREATE TRIGGER beyu_admin_bootstrap_seal_guard
  BEFORE UPDATE OR DELETE ON "admin_bootstrap_state"
  FOR EACH ROW EXECUTE FUNCTION beyu_admin_bootstrap_seal_is_terminal();--> statement-breakpoint

COMMENT ON TABLE "admin_bootstrap_state" IS
  'Secure first-admin bootstrap control record (singleton). SEALED is terminal (DB trigger): the enrollment ceremony cannot be reopened once an administrator is activated.';--> statement-breakpoint
COMMENT ON TABLE "admin_enrollment_sessions" IS
  'Short-lived, single-use administrator enrollment ceremonies. Stores only the SHA-256 hash of the enrollment token and staged (encrypted) MFA material; never a plaintext credential.';
