-- Migration 023: outbox operational metrics function (Phase 16 observability)
--
-- Narrow, read-only SECURITY DEFINER aggregate for the event runtime's
-- operational metrics (Phase 16): row counts per provider/status and the age
-- of the oldest undelivered row. Returns COUNTS AND AGES ONLY — no row data,
-- no tenant ids, no payloads — so cross-tenant aggregation is safe to expose
-- while all actual row access continues to flow through the outbox RLS
-- policy under the owning tenant's context.

CREATE OR REPLACE FUNCTION health.beyu_outbox_metrics()
RETURNS TABLE (
  provider text,
  status text,
  n bigint,
  oldest_created timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = health, pg_temp
AS $$
  SELECT o.provider, o.status, count(*) AS n, min(o.created_at) AS oldest_created
  FROM health.beyu_outbox o
  GROUP BY o.provider, o.status
$$;

REVOKE ALL ON FUNCTION health.beyu_outbox_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION health.beyu_outbox_metrics() TO PUBLIC;
