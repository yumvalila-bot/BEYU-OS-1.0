-- Migration 045 DOWN — remove the operational-domain permission catalogue and
-- the backfilled front_desk role.
--
-- The id lists are the sets this migration's up file actually introduces: the
-- permissions it mints (the canonical catalogue minus what 001-044 already
-- seeded) and every permission it grants a role. Two safety rules apply:
--
--   * a permission ROW is removed only once nothing references it, so a
--     permission that a hand-made role also holds is never withdrawn here;
--   * the `front_desk` ROLE is dropped only when it carries no remaining
--     grants. `beyu_identity.roles` is identity data: a role can already be
--     attached to live users by the time a rollback runs, and dropping it
--     unconditionally would silently change how those accounts authorise.
--     An empty role grants nothing, so leaving it behind is the safe failure,
--     and re-applying 045 is idempotent.

BEGIN;

-- ── 1. every (role, permission) pair this migration granted ─────────────────
DELETE FROM beyu_identity.role_permissions rp
 USING (VALUES
  ('appointment:book'),('appointment:cancel'),('appointment:read'),('appointment:transition'),
  ('bed:allocate'),('bed:manage'),('bed:read'),('billing:read'),
  ('careplan:sign'),('careplan:write'),('checklist:sign'),('claim:read'),
  ('claim:reconcile'),('clinical:write'),('cmo'),('cno'),
  ('critical:ack'),('critical:write'),('dialysis:treat'),('discharge:write'),
  ('doctor'),('document:read'),('document:write'),('ems:dispatch'),
  ('encounter:complete'),('encounter:start'),('escalation:raise'),('escalation:respond'),
  ('flow:read'),('flow:write'),('front_desk'),('handover:accept'),
  ('handover:read'),('handover:write'),('identifier:write'),('insurance:read'),
  ('insurance:write'),('lab:result'),('lab:verify'),('message:read'),
  ('message:send'),('mfa.admin_reset'),('noelia:review'),('noelia:tool_grant'),
  ('nurse'),('ophthalmology:sign'),('optical:dispense'),('outbox:reconcile'),
  ('outbox:replay'),('patient:merge'),('patient:read'),('patient:register'),
  ('payment:receive'),('phi:read'),('portal:read_own'),('portal:release'),
  ('preauth:write'),('radiology:report'),('radiology:verify'),('referral:review'),
  ('referral:send'),('referral:write'),('report:addendum'),('report:read'),
  ('report:submit'),('resus:document'),('roster:read'),('roster:write'),
  ('rx:prescribe'),('study:import'),('task:complete'),('task:read'),
  ('telehealth:conduct'),('telehealth:manage'),('theatre:book'),('theatre:document'),
  ('theatre:read'),('triage:read'),('triage:write')
) AS d(permission_id)
 WHERE rp.permission_id = d.permission_id;

-- ── 2. the catalogue rows this migration minted, if now unreferenced ────────
DELETE FROM beyu_identity.permissions p
 USING (VALUES
  ('appointment:book'),('appointment:cancel'),('appointment:read'),('appointment:transition'),
  ('bed:allocate'),('bed:manage'),('bed:read'),('careplan:sign'),
  ('careplan:write'),('checklist:sign'),('claim:read'),('claim:reconcile'),
  ('clinical:write'),('critical:ack'),('critical:write'),('dialysis:treat'),
  ('discharge:write'),('document:read'),('document:write'),('ems:dispatch'),
  ('encounter:complete'),('encounter:start'),('escalation:raise'),('escalation:respond'),
  ('flow:read'),('flow:write'),('handover:accept'),('handover:read'),
  ('handover:write'),('identifier:write'),('insurance:read'),('insurance:write'),
  ('lab:result'),('lab:verify'),('message:read'),('message:send'),
  ('mfa.admin_reset'),('noelia:review'),('noelia:tool_grant'),('ophthalmology:sign'),
  ('optical:dispense'),('outbox:reconcile'),('outbox:replay'),('patient:merge'),
  ('portal:read_own'),('portal:release'),('preauth:write'),('radiology:report'),
  ('radiology:verify'),('referral:review'),('referral:send'),('referral:write'),
  ('report:addendum'),('report:read'),('report:submit'),('resus:document'),
  ('roster:read'),('roster:write'),('rx:prescribe'),('study:import'),
  ('task:complete'),('task:read'),('telehealth:conduct'),('telehealth:manage'),
  ('theatre:book'),('theatre:document'),('theatre:read'),('triage:read'),
  ('triage:write')
) AS d(permission_id)
 WHERE p.permission_id = d.permission_id
   AND NOT EXISTS (
     SELECT 1 FROM beyu_identity.role_permissions rp
      WHERE rp.permission_id = p.permission_id
   );

-- ── 3. the backfilled role, if it carries nothing ───────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM beyu_identity.roles WHERE role_id = 'front_desk')
     AND NOT EXISTS (
       SELECT 1 FROM beyu_identity.role_permissions WHERE role_id = 'front_desk'
     )
  THEN
    DELETE FROM beyu_identity.roles WHERE role_id = 'front_desk';
  END IF;
END $$;

COMMIT;
