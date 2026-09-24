-- 0070 — UJENZI_OS service-principal registry row.
--
-- UJENZI_OS is a canonical Sector OS (os_registry kind SECTOR_OS, lifecycle
-- ACTIVE; tenant BEYU-UJENZI; routes /os/ujenzi and /api/v1/ujenzi/*) and a
-- canonical internal-service issuer (INTERNAL_SERVICE_ISSUERS). Migration 0020
-- seeded one ACTIVE row per allowlisted issuer, but UJENZI_OS was allowlisted
-- after 0020 was written, so no row exists for it.
--
-- Absent row = governed by the static allowlist (backward compatible), so this
-- migration changes no allow/deny outcome today. It records the issuer
-- EXPLICITLY so per-issuer SUSPEND/REVOKE (the documented administrative
-- response for a decommissioned sector or compromised principal) works for
-- Ujenzi exactly as it does for every other sector: without a row there is
-- nothing to UPDATE.
--
-- Additive and expand-only: one idempotent INSERT, no DDL, no RLS change,
-- no privilege change.
INSERT INTO "service_principals" ("issuer", "status", "reason") VALUES
  ('UJENZI_OS', 'ACTIVE', 'seed: allowlisted issuer')
ON CONFLICT ("issuer") DO NOTHING;
