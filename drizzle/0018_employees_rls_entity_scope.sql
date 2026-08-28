-- C-02 remediation: align employees RLS with the application authorization model.
--
-- The employee master is a SHARED HCM master: employee rows are held at the
-- enterprise/group tenant (employees.tenant_id = TEN_BEYU_GROUP) while the
-- EMPLOYING legal entity lives in a country/operating tenant. The application
-- authorizes a principal to read an employee when the EMPLOYING LEGAL ENTITY's
-- tenant is inside the principal's tenant scope (src/lib/hcm.ts listWorkforce
-- filters on legal_entities.tenant_id), NOT on employees.tenant_id.
--
-- The previous RLS policy scoped employees strictly by employees.tenant_id, so
-- a sector operator whose entity tenant differs from the shared-master tenant
-- was over-restricted by the database backstop (defense-in-depth was therefore
-- narrower than the application's own authorization). This migration makes the
-- RLS policy ENTITY-AWARE so the database backstop enforces the same boundary
-- the application enforces: an employee is visible iff its tenant is in scope
-- OR its employing legal entity's tenant is in scope.
--
-- This is NOT a weakening: it does not grant any cross-tenant access the
-- application does not already authorize. It only stops the database from
-- hiding rows the application legitimately authorizes for a shared master.
--> statement-breakpoint
DROP POLICY IF EXISTS employees_tenant_isolation ON employees;
--> statement-breakpoint
CREATE POLICY employees_tenant_isolation ON employees
  USING (
    tenant_id = ANY(beyu_tenant_ids())
    OR legal_entity_id IN (SELECT id FROM legal_entities WHERE tenant_id = ANY(beyu_tenant_ids()))
    OR beyu_global_scope()
  )
  WITH CHECK (
    tenant_id = ANY(beyu_tenant_ids())
    OR legal_entity_id IN (SELECT id FROM legal_entities WHERE tenant_id = ANY(beyu_tenant_ids()))
    OR beyu_global_scope()
  );
--> statement-breakpoint
