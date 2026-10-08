-- Migration 044 down — remove the Noelia governed-operations layer.
-- health.ai_invocations (011) is untouched: the governed AI audit surface stays.
BEGIN;
DROP TABLE IF EXISTS health.noelia_recommendations;
DROP TABLE IF EXISTS health.noelia_tool_grants;
DELETE FROM health.noelia_tools WHERE tenant_id IS NULL;
DROP TABLE IF EXISTS health.noelia_tools;

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES ('noelia_tools'),('noelia_tool_grants'),('noelia_recommendations')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
  END LOOP;
END $$;
COMMIT;
