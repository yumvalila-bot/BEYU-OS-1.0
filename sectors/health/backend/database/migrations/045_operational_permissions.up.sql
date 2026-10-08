-- Migration 045 — Permission catalogue for the operational domains
-- (capacity, continuity, referrals, emergency, theatre, insurance/RCM,
-- imaging, workforce, portal, governed virtual care, Noelia).
--
-- WHY THIS EXISTS
--   Every new domain route is guarded by @RequirePermission, so a permission
--   that no role holds would make the capability unreachable, and a permission
--   granted too broadly would leak clinical authority. This migration is the
--   DB mirror of the canonical catalogue in
--   `src/common/security/permissions.ts`; the two are kept in parity by
--   permission-catalogue-parity.spec.ts, which FAILS if either side drifts.
--
--   The pre-existing `claim:submit` permission finally has a claim to submit.
--   `order:procedure` (001) now has a theatre booking behind it.
--
-- LEAST PRIVILEGE, DELIBERATELY
--   * trustee / board / patient gain NO clinical or financial write here. The
--     existing spec asserts trustee is read-only on PHI and that stays true.
--   * `noelia:tool_grant` (change what the AI may do) is held only by
--     ai-safety-officer, cto and cmo, and every use is audited.
--   * `bed:allocate` (move a patient) is separate from `bed:manage` (change the
--     ward/bed registry): a charge nurse can allocate without redrawing the
--     hospital's bed list.
--   * `portal:release` is a disclosure act and is NOT granted to front_desk or
--     finance, even though both can see billing/registration screens.
--
-- Idempotent: every insert is ON CONFLICT DO NOTHING.

BEGIN;

-- `front_desk` is a canonical role in the server catalogue
-- (`src/common/security/permissions.ts`) but was never seeded into
-- `beyu_identity.roles` by migration 001, so `role_permissions.role_id`'s FK
-- had no row to point at. Backfilled here rather than silently granted.
INSERT INTO beyu_identity.roles (role_id, label, cadre)
VALUES ('front_desk', 'Front Desk / Registration', 'Operations')
ON CONFLICT (role_id) DO NOTHING;

-- ── the permission catalogue, completed ──────────────────────────────────────
-- `beyu_identity.permissions` held 42 rows: every permission any migration had
-- needed a grant for. The canonical server catalogue (the `Permission` union in
-- `src/common/security/permissions.ts`) declared many more, and because
-- `role_permissions.permission_id` is a foreign key onto that table, a role
-- could not be granted — or even audited for — a permission the catalogue had
-- never heard of. Inserting the full catalogue here is what makes the two
-- authorities reconcilable at all; permission-catalogue-parity.spec.ts fails if
-- either side grows without the other.
--
-- Note what this does NOT do: minting a permission grants nothing. Rows are
-- added to the catalogue only; the capability a role has is exactly the set of
-- (role, permission) pairs granted below and in 001.
INSERT INTO beyu_identity.permissions (permission_id) VALUES
  ('ai:configure'),('ai:killswitch'),('ai:override'),('appointment:book'),
  ('appointment:cancel'),('appointment:read'),('appointment:transition'),('audit:export'),
  ('audit:read'),('bed:allocate'),('bed:manage'),('bed:read'),
  ('billing:read'),('billing:write'),('board:vote'),('breakglass:approve'),
  ('breakglass:request'),('careplan:sign'),('careplan:write'),('checklist:sign'),
  ('claim:read'),('claim:reconcile'),('claim:submit'),('clinical:write'),
  ('contract:anchor'),('contract:sign'),('critical:ack'),('critical:write'),
  ('dialysis:treat'),('discharge:approve'),('discharge:write'),('document:read'),
  ('document:write'),('ems:dispatch'),('encounter:complete'),('encounter:start'),
  ('escalation:raise'),('escalation:respond'),('flow:read'),('flow:write'),
  ('handover:accept'),('handover:read'),('handover:write'),('hr:read'),
  ('hr:write'),('identifier:write'),('insurance:read'),('insurance:write'),
  ('inventory:read'),('inventory:write'),('lab:result'),('lab:verify'),
  ('message:read'),('message:send'),('mfa.admin_reset'),('noelia:review'),
  ('noelia:tool_grant'),('note:sign'),('note:write'),('ophthalmology:sign'),
  ('optical:dispense'),('order:imaging'),('order:lab'),('order:procedure'),
  ('outbox:reconcile'),('outbox:replay'),('patient:merge'),('patient:read'),
  ('patient:register'),('patient:write'),('payment:receive'),('payroll:run'),
  ('ph:outbreak-declare'),('ph:surveillance'),('phi:export'),('phi:read'),
  ('phi:write'),('po:approve'),('portal:read_own'),('portal:release'),
  ('preauth:write'),('radiology:report'),('radiology:verify'),('rbac:read'),
  ('rbac:write'),('referral:review'),('referral:send'),('referral:write'),
  ('report:addendum'),('report:read'),('report:submit'),('resus:document'),
  ('roster:read'),('roster:write'),('rx:controlled'),('rx:dispense'),
  ('rx:prescribe'),('rx:write'),('study:import'),('task:complete'),
  ('task:read'),('telehealth:conduct'),('telehealth:manage'),('tenant:admin'),
  ('tenant:switch'),('theatre:book'),('theatre:document'),('theatre:read'),
  ('triage:read'),('triage:write'),('trustee:veto')
ON CONFLICT (permission_id) DO NOTHING;

-- ── doctor / cmo (clinician authority) ───────────────────────────────────────
INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM (VALUES ('doctor'),('cmo')) AS r(role_id)
 CROSS JOIN (VALUES
   ('bed:read'),('bed:allocate'),('flow:read'),('flow:write'),
   ('careplan:write'),('careplan:sign'),('task:read'),('task:complete'),
   ('document:read'),('document:write'),('discharge:write'),
   ('referral:write'),('referral:send'),
   ('triage:read'),('triage:write'),('escalation:raise'),('handover:write'),('handover:accept'),('handover:read'),
   ('resus:document'),('theatre:read'),('theatre:document'),('checklist:sign'),
   ('study:import'),('report:addendum'),('critical:ack'),
   ('roster:read'),('message:send'),('message:read'),('telehealth:manage'),
   ('portal:release'),('identifier:write'),('noelia:review')
 ) AS p(permission_id)
ON CONFLICT DO NOTHING;

-- ── cmo additionally: clinical operations authority ─────────────────────────
INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'cmo', p.permission_id FROM (VALUES
  ('escalation:respond'),('theatre:book'),('bed:manage'),('roster:write'),('claim:read')
) AS p(permission_id)
ON CONFLICT DO NOTHING;

-- ── nurse / cno (nursing authority) ─────────────────────────────────────────
INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM (VALUES ('nurse'),('cno')) AS r(role_id)
 CROSS JOIN (VALUES
   ('bed:read'),('bed:allocate'),('flow:read'),('flow:write'),('careplan:write'),('task:read'),('task:complete'),
   ('document:read'),('triage:read'),('triage:write'),('escalation:raise'),
   ('handover:write'),('handover:accept'),('handover:read'),('resus:document'),('theatre:read'),
   ('critical:ack'),('roster:read'),('message:send'),('message:read'),
   ('portal:release'),('identifier:write')
 ) AS p(permission_id)
ON CONFLICT DO NOTHING;

INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'cno', p.permission_id FROM (VALUES
  ('careplan:sign'),('discharge:write'),('document:write'),('escalation:respond'),
  ('bed:manage'),('roster:write')
) AS p(permission_id)
ON CONFLICT DO NOTHING;

-- ── admin (hospital operations, no clinical writing) ─────────────────────────
INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'admin', p.permission_id FROM (VALUES
  ('bed:read'),('bed:manage'),('bed:allocate'),('flow:read'),('flow:write'),
  ('document:read'),('document:write'),('task:read'),
  ('referral:write'),('referral:send'),('referral:review'),
  ('triage:read'),('escalation:raise'),
  ('theatre:read'),('theatre:book'),
  ('roster:read'),('roster:write'),
  ('insurance:read'),('insurance:write'),('preauth:write'),('claim:read'),
  ('identifier:write'),('patient:merge'),('portal:release'),
  ('telehealth:manage'),('critical:ack'),('noelia:review')
) AS p(permission_id)
ON CONFLICT DO NOTHING;

-- ── allied health, minimal scopes ────────────────────────────────────────────
INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'pharmacy', p.permission_id FROM (VALUES
  ('task:read'),('task:complete'),('document:read'),('message:send'),('message:read')
) AS p(permission_id)
ON CONFLICT DO NOTHING;

INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'lab', p.permission_id FROM (VALUES
  ('critical:write'),('task:read'),('task:complete'),('message:read')
) AS p(permission_id)
ON CONFLICT DO NOTHING;

INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'radiology', p.permission_id FROM (VALUES
  ('study:import'),('report:addendum'),('critical:write'),('critical:ack'),
  ('task:read'),('message:read')
) AS p(permission_id)
ON CONFLICT DO NOTHING;

INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'finance', p.permission_id FROM (VALUES
  ('insurance:read'),('claim:read'),('claim:reconcile'),('document:read')
) AS p(permission_id)
ON CONFLICT DO NOTHING;

INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'hr-director', p.permission_id FROM (VALUES ('roster:read'),('roster:write')) AS p(permission_id)
ON CONFLICT DO NOTHING;

INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'front_desk', p.permission_id FROM (VALUES
  ('bed:read'),('flow:read'),('flow:write'),('referral:write'),('message:send'),('identifier:write')
) AS p(permission_id)
ON CONFLICT DO NOTHING;

INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'auditor', p.permission_id FROM (VALUES
  ('bed:read'),('flow:read'),('theatre:read'),('claim:read'),('triage:read')
) AS p(permission_id)
ON CONFLICT DO NOTHING;

-- ── AI governance: who may change what Noelia is allowed to do ───────────────
INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT r.role_id, 'noelia:tool_grant'
  FROM (VALUES ('ai-safety-officer'),('cto'),('cmo')) AS r(role_id)
ON CONFLICT DO NOTHING;

-- ── executive read/oversight ─────────────────────────────────────────────────
INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'ceo', p.permission_id FROM (VALUES
  ('bed:read'),('flow:read'),('roster:read'),('noelia:review')
) AS p(permission_id)
ON CONFLICT DO NOTHING;

-- ── patient: own record only, released content only ──────────────────────────
INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'patient', p.permission_id FROM (VALUES
  ('portal:read_own'),('message:send'),('message:read')
) AS p(permission_id)
ON CONFLICT DO NOTHING;

-- ── backfill: catalogue promises that migration 001 never seeded ────────────
-- Found by permission-catalogue-parity.spec.ts, not by hand. `beyu_identity
-- .role_permissions` is joined at login to build a user's explicit grants, while
-- the guard consults ROLE_DEFINITIONS, so an unseeded promise made the two
-- authorities disagree about what a role may do: the permission worked at the
-- gate and appeared nowhere in the identity store, so no reviewer, export or
-- access review could see that the role held it. Seeding makes the database
-- tell the truth about the capability that already exists.
--
-- `trustee` is the deliberate exception: the catalogue listed outbox replay and
-- reconciliation for a trust-oversight role, which is an operations duty. Those
-- two entries were REMOVED from the catalogue rather than seeded here.
INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
  FROM (VALUES ('doctor'),('nurse'),('cmo')) AS r(role_id)
 CROSS JOIN (VALUES
   ('appointment:read'),('appointment:transition'),
   ('encounter:start'),('encounter:complete')
 ) AS p(permission_id)
ON CONFLICT DO NOTHING;

INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'doctor', 'report:read'
ON CONFLICT DO NOTHING;

INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'moh-official', p.permission_id FROM (VALUES
  ('report:read'),('report:submit')
) AS p(permission_id)
ON CONFLICT DO NOTHING;

INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'admin', p.permission_id FROM (VALUES
  ('appointment:read'),('appointment:book'),('appointment:transition'),
  ('appointment:cancel'),('outbox:replay'),('outbox:reconcile')
) AS p(permission_id)
ON CONFLICT DO NOTHING;

-- front_desk had no row in beyu_identity.roles before this migration, so none of
-- its catalogue permissions could be seeded by 001. They are granted here in
-- full: registration, appointment handling and payment receipt are the job.
-- Note what is NOT included: `phi:read`. A receptionist reads the registration
-- record (`patient:read`), not the clinical chart.
INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
SELECT 'front_desk', p.permission_id FROM (VALUES
  ('patient:read'),('patient:register'),
  ('appointment:read'),('appointment:book'),('appointment:transition'),
  ('appointment:cancel'),('billing:read'),('payment:receive')
) AS p(permission_id)
ON CONFLICT DO NOTHING;

COMMIT;
