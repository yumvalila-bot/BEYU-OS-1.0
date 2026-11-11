-- 035 down — remove the narrow bootstrap resolver.
DROP FUNCTION IF EXISTS beyu_identity.resolve_beyu_authorization(text, text);
