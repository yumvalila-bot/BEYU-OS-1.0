ALTER TYPE "public"."beyu_decision_status" ADD VALUE 'DEADLOCKED';--> statement-breakpoint
ALTER TABLE "resolutions" ADD COLUMN "voting_opens_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "resolutions" ADD COLUMN "voting_closes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "resolutions" ADD COLUMN "tabled_by_member_id" text;--> statement-breakpoint
ALTER TABLE "resolutions" ADD COLUMN "tabled_at" timestamp with time zone;