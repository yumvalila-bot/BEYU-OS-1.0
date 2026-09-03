-- 021: Health OS service principal (canonical identity federation transport).
--
-- Service-to-service calls to the BEYU control plane (canonical identity
-- provisioning at registration, canonical status lookups) are initiated by
-- the Health OS SERVICE, not by a human. The outbox and the audit ledger
-- require a real tenant and (audit) a real actor row, so the service
-- principal is a first-class, permanently non-loginable identity:
--
--   * tenant  HEALTH-OS-SERVICE  — attribution bucket for service-level
--             outbox/audit rows (RLS-isolated like every other tenant).
--   * user    00000000-...-09ee  — account_status 'suspended', unusable
--             password: it can NEVER authenticate interactively. It exists
--             solely so audit rows satisfy the actor FK honestly.
--
-- Idempotent (ON CONFLICT DO NOTHING). Runs as the migration role (table
-- owner), so RLS does not block the inserts.
BEGIN;

INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, status)
VALUES (
  '00000000-0000-0000-0000-0000000009ef',
  'HEALTH-OS-SERVICE',
  'Health OS Service Principal (BEYU federation transport)',
  'active'
)
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash, account_status)
VALUES (
  '00000000-0000-0000-0000-0000000009ee',
  'service@health-os.internal',
  'Health OS Service Principal',
  -- Unusable by construction: no hashing format, never a valid bcrypt hash,
  -- and the account is suspended anyway. This is not a credential.
  'SERVICE-PRINCIPAL-NO-LOGIN',
  'suspended'
)
ON CONFLICT (global_user_id) DO NOTHING;

COMMIT;
