-- 033 down — remove Health-local BEYU assertion replay protection.
-- Only use through the governed Health migration rollback after all services
-- have been rolled back to a version that does not require assertion replay.
DROP TABLE IF EXISTS beyu_identity.authorization_assertion_replays;
