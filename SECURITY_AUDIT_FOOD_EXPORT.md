# Security Audit — Agriculture OS Food Export Capability (0039)

Date: 2026-09-13
Branch: arena/01a09b87-beyu-os-1-0
Scope: Food Export extension inside existing Agriculture OS

## 1. Source-of-Truth Hierarchy Compliance
- Repo state > schema/migrations > code/tests > security/authz > BEYU constitutional > Agriculture conventions > prompt > history — respected.
- Zero destructive change: existing tables, RLS, APIs, UI preserved. Additive migration 0039 only.
- Working-tree protection: no git reset --hard, clean -fd, checkout -- ., restore .

## 2. Zero-Repetition / Reuse Verification
- Checked existence before creation:
  - buyers → agriculture_buyers (reused)
  - products → agriculture_products (reused)
  - inventory_lots → agriculture_inventory_lots (reused)
  - trace_batches → agriculture_trace_batches (reused)
  - warehouses, shipments, documents, inspections, certificates (reused)
  - offline → agriculture_sync_envelopes (reused)
- No duplicate OS, no second stock balance, no duplicate buyer/product/country models.
- New tables minimum delta:
  - agriculture_export_orders
  - agriculture_export_lot_allocations
  - agriculture_export_compliance_requirements
  - agriculture_export_compliance_checks
  - agriculture_export_shipments
  - agriculture_export_document_links
  - agriculture_export_holds

## 3. Schema Safety
- Searched semantic equivalents before creating export_orders etc. — confirmed no equivalent.
- Migration 0039:
  - All tables have tenant_id FK, RLS ENABLE + FORCE, policy USING/WITH CHECK tenant_id = ANY (beyu_tenant_ids())
  - Verification DO block checks policy count for each table
  - Grants to beyu_runtime for SELECT/INSERT/UPDATE/DELETE
  - Check constraints: qty_allocated >0, has_lot_or_batch, has_parent, hold_type IN (...), status IN (ACTIVE,RELEASED)
  - Unique indexes with WHERE to prevent duplicate allocation
- No Finance tables touched, no HCM tables touched.

## 4. Finance Boundary — CAP_POSTING LOCKED
- export.ts and index.ts emit journalsPosted: false, financeBoundary: FINANCE_OS_ONLY
- No insertion into journalEntries, capitalRequests, ledger, treasury
- Events: EXPORT_ORDER_CREATED, EXPORT_LOT_ALLOCATED, EXPORT_SHIPMENT_PREPARED, EXPORT_SHIPMENT_DISPATCHED, EXPORT_COMPLIANCE_HOLD/CLEARED — all with journalsPosted false
- API routes: no finance posting, only audit with agriculture:data.manage
- UI metrics: FINANCE_OS_ONLY, CAP_POSTING LOCKED
- Noelia read-services: headline notes harvests HARVEST_RECORDED and export EXPORT_* events never post journals
- TypeScript: tsc --noEmit passes

## 5. RBAC/ABAC/RLS Enforcement
- All export API routes use guarded() with permission agriculture:data.read or manage
- Tenant isolation via eq(tenantId) and RLS policy beyu_tenant_ids()
- Actor tenant check: assertActorTenant
- Legal entity and country validation for export orders (buyer/product/country existence)
- Buyer, product, country FKs validated
- No self-auth: actor from agriActor(ctx) which uses principal from guarded context

## 6. Noelia/HIVE Governed
- 6 tools registered in agriculture-export-tools.ts:
  - agriculture.export.orders.summary
  - agriculture.export.traceability.query
  - agriculture.export.compliance.readiness
  - agriculture.export.documents.missing
  - agriculture.export.shipment.exceptions
  - agriculture.export.analytics
- All tools:
  - permission agriculture:data.read
  - classification CONFIDENTIAL
  - risk LOW
  - sideEffects NONE, idempotent true, timeout 8-10s
  - auditRequirements event NOELIA_TOOL_INVOKED objectType AI_DECISION
  - Require canonical DB context via hasDatabaseTransactionContext()
  - No write, no approval, no hold release, no shipment authorization, no finance posting
  - Findings use NoeliaEpistemicStatus OBSERVED/REQUIRES_HUMAN_REVIEW/UNAVAILABLE
- Hold release block:
  - releaseHold() checks actor.userId prefix NOELIA/HIVE/noelia/hive and throws SCOPE
  - API route export-holds POST release uses same function
  - Noelia tools never call releaseHold
- Read-services agriculture() uses agricultureDashboardWithExport, headline includes export count, findings add Export holds with REQUIRES_HUMAN_REVIEW if active

## 7. Country-Aware, No Hardcoded Tanzania
- destinationCountryCode is FK to countries(code), configurable per order
- applicableRequirementsForOrder filters by countryCode, productId, buyerId — all nullable configurable
- No hardcoded "TZ" in export.ts core logic (verified via grep)
- UI shows destinationCountryCode as provided, not hardcoded
- Noelia analytics groups by destination country dynamically

## 8. Government Integrations — DISABLED/SANDBOX/MOCK
- No fetch to government APIs, no customs/phytosanitary live calls
- Code comments: government submission requires human authority, Noelia cannot certify or submit
- Compliance checks are internal derived, verification requires human actor

## 9. TLS Verification — No Bypass
- No rejectUnauthorized: false in export code
- No custom https Agent disabling verification
- All DB connections use standard pool

## 10. Secrets — No Secrets in Source
- No password, secret, api_key in export.ts or API routes
- No env secrets read

## 11. Offline Reconciliation
- Reuses agriculture_sync_envelopes table (existing offline queue)
- acceptSyncEnvelope idempotent via envelopeId unique index
- processOfflineExportOperation:
  - Checks tenant mismatch
  - Rejects stale >7 days with REJECTED_STALE and throws INVALID_STATE
  - Idempotent replay via existing check
  - Actor userId recorded
- Sync API POST /api/v1/agriculture/sync already handles generic offline operations including export

## 12. Event & Audit Contracts
- All writes use withAuditTransaction with auditBase:
  - tenantId, actorUserId, actorType HUMAN, action, objectType AGRICULTURE_EXPORT_*, outcome SUCCESS, authority agriculture:data.manage, traceId, ip, userAgent
- Events via eventBase:
  - type EXPORT_*, source beyu-os/agriculture/export, domain AGRICULTURE, operation, tenantId, subjectType, subjectId, actorType HUMAN/SERVICE, classification INTERNAL, payload with journalsPosted false, financeBoundary FINANCE_OS_ONLY, traceId, correlationId, authorityContext permissionCode
- No journal posting, no hidden side effects

## 13. State Machine — Fail-Closed
- EXPORT_ORDER_STATUSES 14 states defined
- ALLOWED_TRANSITIONS map explicit, no wildcard
- transitionExportOrder:
  - Validates target status in list
  - Checks allowed transition from current
  - LOT_ALLOCATED requires allocatedQty >= order qty
  - QUALITY_REVIEW blocks if QUALITY_HOLD or LOT_HOLD active
  - COMPLIANCE_REVIEW blocks if QUALITY_HOLD
  - READY_FOR_SHIPMENT requires complianceReadiness ready && no active holds
  - SHIPMENT_PREPARED blocks if active holds
  - General: if current != ON_HOLD and target != ON_HOLD, active holds block transition
  - Uses AgriDomainError with code INVALID_STATE, NOT_FOUND, SCOPE — mapped to 404/403/409 in APIs
- Over-allocation prevention:
  - qtyReservedForLot calculates reserved qty excluding current order
  - Checks available qty from inventory_lots qtyOnHand or trace_batches qty
  - Checks blocked lot status REJECTED/BLOCKED/QUARANTINE
  - Checks duplicate allocation via unique index and explicit query
  - Checks order total not exceeded
- Hold creation:
  - holdType validated against HOLD_TYPES
  - reason must be >=5 chars explicit
  - Parent required (exportOrderId/shipmentId/exportShipmentId)
  - Tenant scope validated for referenced order
  - Auto transitions order to ON_HOLD if not CLOSED/CANCELLED/REJECTED
- Hold release:
  - Blocked for Noelia/HIVE principals
  - Only ACTIVE holds can be released
  - Records releasedBy, releasedAt
  - Does NOT auto-transition from ON_HOLD — requires explicit transition (governed)

## 14. UI Preservation
- src/app/os/agriculture/page.tsx extended additively:
  - Imports exportOrders, exportHolds, exportShipments
  - Calls exportDashboard with catch fallback (zero regression if migration not applied)
  - Adds 2 metric grids: Export orders/draft/ready/holds and shipments/finance/traceability/documents
  - Adds 3 panels: Export orders lifecycle, Export holds governed, Export shipments reuse logistics
  - Existing farms/cycles/harvests/herds/work/hazards/cases unchanged
  - Uses requireAccess agriculture:data.read, withTenantDatabaseContext

## 15. Test Coverage
- New file tests/agriculture/export.test.ts — 19 tests, all passing:
  - Reuse verification, finance boundary, lifecycle states, holds explicit, Noelia/HIVE block, country-aware, no gov integration, no TLS bypass, no secrets, offline reuse, events never journals, traceability reuse, documents reuse, API guarded, Noelia tools registered governed read-only, migration RLS, UI imports, read-services includes export
- Existing architecture invariants still pass (28 passed non-DB)
- TypeScript passes

## 16. Continuous Reconciliation
- exportDashboard counts total/draft/ready/holds/shipments — operational truth
- complianceReadiness derived from applicable requirements and checks — recalculated on transition to READY_FOR_SHIPMENT
- Traceability lineage derived from existing trace_links, harvests, farms — no second graph
- Document links count vs applicable requirements — missing detection

## 17. Deployment
- Migration 0039 additive, IF NOT EXISTS, safe for rerun
- Grants to beyu_runtime
- RLS verification DO block fails deployment if policy missing
- No new env vars, no new external services

## 18. Residual Risks & Mitigations
- Risk: Over-allocation race condition under concurrent allocations
  - Mitigation: unique partial indexes + qty check in transaction; consider SERIALIZABLE or advisory lock in future
- Risk: Stale offline operation >7 days rejected but not reconciled automatically
  - Mitigation: REJECTED_STALE status visible, requires human re-submission
- Risk: Noelia tools could be used to infer sensitive buyer data
  - Mitigation: tools require agriculture:data.read, CONFIDENTIAL classification, RLS tenant isolation, clearance check via visibleClassifications
- Risk: Export holds auto-transition to ON_HOLD but release does not auto-transition back
  - Mitigation: intentional governed behavior — requires explicit human transition after hold clearance

## Conclusion
Food Export capability extends Agriculture OS safely, preserves all existing functionality, schema, security, compliance, offline, event, UI, API, deployment contracts. Lifecycle Producer→Farm/Production→Harvest→Lot→Aggregation→Quality→Processing→Packaging→Export Order→Compliance→Shipment→Destination→Buyer implemented via reuse of existing order/commercial, lot/inventory, traceability, quality, compliance, document, shipment, buyer, offline, events, RLS, RBAC/ABAC. Finance boundary CAP_POSTING LOCKED, Noelia/HIVE governed, country-aware, no hardcoded Tanzania, no live government integrations, no TLS bypass, no secrets, zero-destructive-change, zero-regression, fail-closed, continuous reconciliation.

