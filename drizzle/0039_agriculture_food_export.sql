-- 0039 — Agriculture OS Food Export capability (additive)
-- Extends Agriculture OS with export orders, lot allocations, compliance,
-- document linking, export shipments and governed holds.
-- Reuses existing buyers, products, inventory_lots, trace_batches, warehouses,
-- shipments, documents, inspections, certificates.
-- No Finance posting, no duplicate stock, CAP_POSTING stays LOCKED.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_export_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  legal_entity_id TEXT REFERENCES legal_entities(id),
  code TEXT NOT NULL,
  buyer_id TEXT NOT NULL REFERENCES agriculture_buyers(id),
  product_id TEXT REFERENCES agriculture_products(id),
  quantity NUMERIC(16,4) NOT NULL,
  uom TEXT NOT NULL DEFAULT 'KG',
  grade_spec TEXT,
  destination TEXT,
  destination_country_code TEXT NOT NULL REFERENCES countries(code),
  requested_shipment_date TEXT,
  commercial_terms TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_export_orders_tenant_code_uidx ON agriculture_export_orders (tenant_id, code);
CREATE INDEX IF NOT EXISTS agriculture_export_orders_tenant_idx ON agriculture_export_orders (tenant_id);
CREATE INDEX IF NOT EXISTS agriculture_export_orders_buyer_idx ON agriculture_export_orders (buyer_id);
CREATE INDEX IF NOT EXISTS agriculture_export_orders_product_idx ON agriculture_export_orders (product_id);
CREATE INDEX IF NOT EXISTS agriculture_export_orders_status_idx ON agriculture_export_orders (status);
CREATE INDEX IF NOT EXISTS agriculture_export_orders_dest_country_idx ON agriculture_export_orders (destination_country_code);
ALTER TABLE agriculture_export_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_export_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_export_orders_tenant_isolation ON agriculture_export_orders;
CREATE POLICY agriculture_export_orders_tenant_isolation ON agriculture_export_orders
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_export_lot_allocations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  export_order_id TEXT NOT NULL REFERENCES agriculture_export_orders(id),
  inventory_lot_id TEXT REFERENCES agriculture_inventory_lots(id),
  trace_batch_id TEXT REFERENCES agriculture_trace_batches(id),
  qty_allocated NUMERIC(16,4) NOT NULL CHECK (qty_allocated > 0),
  status TEXT NOT NULL DEFAULT 'ALLOCATED',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agriculture_export_alloc_has_lot_or_batch CHECK (inventory_lot_id IS NOT NULL OR trace_batch_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS agriculture_export_lot_allocations_tenant_idx ON agriculture_export_lot_allocations (tenant_id);
CREATE INDEX IF NOT EXISTS agriculture_export_lot_allocations_order_idx ON agriculture_export_lot_allocations (export_order_id);
CREATE INDEX IF NOT EXISTS agriculture_export_lot_allocations_inv_lot_idx ON agriculture_export_lot_allocations (inventory_lot_id);
CREATE INDEX IF NOT EXISTS agriculture_export_lot_allocations_batch_idx ON agriculture_export_lot_allocations (trace_batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_export_alloc_order_inv_lot_uidx ON agriculture_export_lot_allocations (export_order_id, inventory_lot_id) WHERE inventory_lot_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_export_alloc_order_batch_uidx ON agriculture_export_lot_allocations (export_order_id, trace_batch_id) WHERE trace_batch_id IS NOT NULL;
ALTER TABLE agriculture_export_lot_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_export_lot_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_export_lot_allocations_tenant_isolation ON agriculture_export_lot_allocations;
CREATE POLICY agriculture_export_lot_allocations_tenant_isolation ON agriculture_export_lot_allocations
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_export_compliance_requirements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  country_code TEXT REFERENCES countries(code),
  product_id TEXT REFERENCES agriculture_products(id),
  destination_market TEXT,
  shipment_type TEXT,
  buyer_id TEXT REFERENCES agriculture_buyers(id),
  document_type TEXT NOT NULL,
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_export_req_tenant_code_uidx ON agriculture_export_compliance_requirements (tenant_id, code);
CREATE INDEX IF NOT EXISTS agriculture_export_req_tenant_idx ON agriculture_export_compliance_requirements (tenant_id);
CREATE INDEX IF NOT EXISTS agriculture_export_req_country_idx ON agriculture_export_compliance_requirements (country_code);
CREATE INDEX IF NOT EXISTS agriculture_export_req_product_idx ON agriculture_export_compliance_requirements (product_id);
CREATE INDEX IF NOT EXISTS agriculture_export_req_buyer_idx ON agriculture_export_compliance_requirements (buyer_id);
ALTER TABLE agriculture_export_compliance_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_export_compliance_requirements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_export_compliance_requirements_tenant_isolation ON agriculture_export_compliance_requirements;
CREATE POLICY agriculture_export_compliance_requirements_tenant_isolation ON agriculture_export_compliance_requirements
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_export_compliance_checks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  export_order_id TEXT NOT NULL REFERENCES agriculture_export_orders(id),
  requirement_id TEXT NOT NULL REFERENCES agriculture_export_compliance_requirements(id),
  status TEXT NOT NULL DEFAULT 'MISSING',
  evidence_document_id TEXT REFERENCES agriculture_documents(id),
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_export_checks_order_req_uidx ON agriculture_export_compliance_checks (export_order_id, requirement_id);
CREATE INDEX IF NOT EXISTS agriculture_export_checks_tenant_idx ON agriculture_export_compliance_checks (tenant_id);
CREATE INDEX IF NOT EXISTS agriculture_export_checks_order_idx ON agriculture_export_compliance_checks (export_order_id);
CREATE INDEX IF NOT EXISTS agriculture_export_checks_req_idx ON agriculture_export_compliance_checks (requirement_id);
CREATE INDEX IF NOT EXISTS agriculture_export_checks_status_idx ON agriculture_export_compliance_checks (status);
ALTER TABLE agriculture_export_compliance_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_export_compliance_checks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_export_compliance_checks_tenant_isolation ON agriculture_export_compliance_checks;
CREATE POLICY agriculture_export_compliance_checks_tenant_isolation ON agriculture_export_compliance_checks
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_export_shipments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  shipment_id TEXT NOT NULL REFERENCES agriculture_shipments(id),
  export_order_id TEXT NOT NULL REFERENCES agriculture_export_orders(id),
  destination_country_code TEXT NOT NULL REFERENCES countries(code),
  destination_text TEXT,
  transport_mode TEXT,
  commercial_terms TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  classification TEXT NOT NULL DEFAULT 'INTERNAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agriculture_export_shipments_shipment_uidx ON agriculture_export_shipments (shipment_id);
CREATE INDEX IF NOT EXISTS agriculture_export_shipments_tenant_idx ON agriculture_export_shipments (tenant_id);
CREATE INDEX IF NOT EXISTS agriculture_export_shipments_order_idx ON agriculture_export_shipments (export_order_id);
CREATE INDEX IF NOT EXISTS agriculture_export_shipments_dest_country_idx ON agriculture_export_shipments (destination_country_code);
CREATE INDEX IF NOT EXISTS agriculture_export_shipments_status_idx ON agriculture_export_shipments (status);
ALTER TABLE agriculture_export_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_export_shipments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_export_shipments_tenant_isolation ON agriculture_export_shipments;
CREATE POLICY agriculture_export_shipments_tenant_isolation ON agriculture_export_shipments
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_export_document_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  export_order_id TEXT REFERENCES agriculture_export_orders(id),
  shipment_id TEXT REFERENCES agriculture_shipments(id),
  export_shipment_id TEXT REFERENCES agriculture_export_shipments(id),
  document_id TEXT NOT NULL REFERENCES agriculture_documents(id),
  document_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agriculture_export_doc_links_has_parent CHECK (export_order_id IS NOT NULL OR shipment_id IS NOT NULL OR export_shipment_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS agriculture_export_doc_links_tenant_idx ON agriculture_export_document_links (tenant_id);
CREATE INDEX IF NOT EXISTS agriculture_export_doc_links_order_idx ON agriculture_export_document_links (export_order_id);
CREATE INDEX IF NOT EXISTS agriculture_export_doc_links_shipment_idx ON agriculture_export_document_links (shipment_id);
CREATE INDEX IF NOT EXISTS agriculture_export_doc_links_exp_ship_idx ON agriculture_export_document_links (export_shipment_id);
CREATE INDEX IF NOT EXISTS agriculture_export_doc_links_doc_idx ON agriculture_export_document_links (document_id);
ALTER TABLE agriculture_export_document_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_export_document_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_export_document_links_tenant_isolation ON agriculture_export_document_links;
CREATE POLICY agriculture_export_document_links_tenant_isolation ON agriculture_export_document_links
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agriculture_export_holds (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  export_order_id TEXT REFERENCES agriculture_export_orders(id),
  shipment_id TEXT REFERENCES agriculture_shipments(id),
  export_shipment_id TEXT REFERENCES agriculture_export_shipments(id),
  hold_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT NOT NULL,
  released_by TEXT,
  released_at TIMESTAMPTZ,
  classification TEXT NOT NULL DEFAULT 'RESTRICTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agriculture_export_holds_has_parent CHECK (export_order_id IS NOT NULL OR shipment_id IS NOT NULL OR export_shipment_id IS NOT NULL),
  CONSTRAINT agriculture_export_holds_type_check CHECK (hold_type IN ('QUALITY_HOLD','COMPLIANCE_HOLD','DOCUMENT_HOLD','LOT_HOLD','QUANTITY_HOLD','SECURITY_HOLD')),
  CONSTRAINT agriculture_export_holds_status_check CHECK (status IN ('ACTIVE','RELEASED'))
);
CREATE INDEX IF NOT EXISTS agriculture_export_holds_tenant_idx ON agriculture_export_holds (tenant_id);
CREATE INDEX IF NOT EXISTS agriculture_export_holds_order_idx ON agriculture_export_holds (export_order_id);
CREATE INDEX IF NOT EXISTS agriculture_export_holds_shipment_idx ON agriculture_export_holds (shipment_id);
CREATE INDEX IF NOT EXISTS agriculture_export_holds_exp_ship_idx ON agriculture_export_holds (export_shipment_id);
CREATE INDEX IF NOT EXISTS agriculture_export_holds_status_idx ON agriculture_export_holds (status);
CREATE INDEX IF NOT EXISTS agriculture_export_holds_type_idx ON agriculture_export_holds (hold_type);
ALTER TABLE agriculture_export_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE agriculture_export_holds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agriculture_export_holds_tenant_isolation ON agriculture_export_holds;
CREATE POLICY agriculture_export_holds_tenant_isolation ON agriculture_export_holds
  USING (tenant_id = ANY (beyu_tenant_ids()))
  WITH CHECK (tenant_id = ANY (beyu_tenant_ids()));

--> statement-breakpoint
-- Grants to runtime role
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON agriculture_export_orders, agriculture_export_lot_allocations, agriculture_export_compliance_requirements, agriculture_export_compliance_checks, agriculture_export_shipments, agriculture_export_document_links, agriculture_export_holds TO %I', r.rolname);
  END LOOP;
END
$$;

--> statement-breakpoint
-- Verification: every new table has RLS using beyu_tenant_ids()
DO $$
DECLARE
  table_name text;
  policy_count int;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY['agriculture_export_orders','agriculture_export_lot_allocations','agriculture_export_compliance_requirements','agriculture_export_compliance_checks','agriculture_export_shipments','agriculture_export_document_links','agriculture_export_holds'])
  LOOP
    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = table_name
      AND qual LIKE '%beyu_tenant_ids()%';
    IF policy_count = 0 THEN
      RAISE EXCEPTION 'Migration 0039 verification failed: % missing beyu_tenant_ids() policy', table_name;
    END IF;
  END LOOP;
END $$;
