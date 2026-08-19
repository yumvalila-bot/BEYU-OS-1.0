CREATE TABLE "idempotency_records" (
	"scope" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"state" text DEFAULT 'IN_FLIGHT' NOT NULL,
	"status_code" integer,
	"response_body" jsonb,
	"tenant_id" text,
	"actor_user_id" text,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_records_scope_idempotency_key_pk" PRIMARY KEY("scope","idempotency_key")
);
--> statement-breakpoint
CREATE INDEX "idempotency_expiry_idx" ON "idempotency_records" USING btree ("expires_at");