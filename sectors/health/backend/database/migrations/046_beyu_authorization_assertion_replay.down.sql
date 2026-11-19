-- Forward-only security evidence: do not erase replay history on rollback.
-- Removing this migration requires an independently reviewed retention plan.
DO $$ BEGIN
  RAISE EXCEPTION '046 is forward-only; replay evidence must be retained';
END $$;
