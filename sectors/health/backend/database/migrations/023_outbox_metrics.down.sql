-- Migration 023 DOWN: remove the outbox metrics function.
DROP FUNCTION IF EXISTS health.beyu_outbox_metrics();
