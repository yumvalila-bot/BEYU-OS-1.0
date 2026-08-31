-- Migration 016: Grant patient:register permission to doctor role.
-- Doctors need to register patients as part of clinical workflow.
INSERT INTO beyu_identity.role_permissions (role_id, permission_id)
VALUES ('doctor', 'patient:register')
ON CONFLICT DO NOTHING;
