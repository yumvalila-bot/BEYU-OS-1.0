BEGIN;
DROP TRIGGER IF EXISTS trg_stock_movement ON health.stock_ledger;
DROP FUNCTION IF EXISTS health.apply_stock_movement();
DROP POLICY IF EXISTS health_integration_status_isolation ON health.integration_status;
DROP POLICY IF EXISTS health_telehealth_sessions_isolation ON health.telehealth_sessions;
DROP POLICY IF EXISTS health_ambulance_requests_isolation ON health.ambulance_requests;
DROP POLICY IF EXISTS health_vehicles_isolation ON health.vehicles;
DROP POLICY IF EXISTS health_finance_events_isolation ON health.finance_events;
DROP POLICY IF EXISTS health_payment_allocations_isolation ON health.payment_allocations;
DROP POLICY IF EXISTS health_payments_isolation ON health.payments;
DROP POLICY IF EXISTS health_invoice_items_isolation ON health.invoice_items;
DROP POLICY IF EXISTS health_invoices_isolation ON health.invoices;
DROP POLICY IF EXISTS health_billable_services_isolation ON health.billable_services;
DROP POLICY IF EXISTS health_eye_exams_isolation ON health.eye_exams;
DROP POLICY IF EXISTS health_imaging_reports_isolation ON health.imaging_reports;
DROP POLICY IF EXISTS health_imaging_orders_isolation ON health.imaging_orders;
DROP POLICY IF EXISTS health_lab_order_items_isolation ON health.lab_order_items;
DROP POLICY IF EXISTS health_lab_orders_isolation ON health.lab_orders;
DROP POLICY IF EXISTS health_lab_tests_isolation ON health.lab_tests;
DROP POLICY IF EXISTS health_dispenses_isolation ON health.dispenses;
DROP POLICY IF EXISTS health_stock_levels_isolation ON health.stock_levels;
DROP POLICY IF EXISTS health_stock_ledger_isolation ON health.stock_ledger;
DROP POLICY IF EXISTS health_pharmacy_batches_isolation ON health.pharmacy_batches;
DROP POLICY IF EXISTS health_pharmacy_items_isolation ON health.pharmacy_items;

DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES
    ('integration_status'),('telehealth_sessions'),('ambulance_requests'),('vehicles'),
    ('finance_events'),('payment_allocations'),('payments'),('invoice_items'),('invoices'),
    ('billable_services'),('eye_exams'),('imaging_reports'),('imaging_orders'),
    ('lab_order_items'),('lab_orders'),('lab_tests'),('dispenses'),('stock_levels'),
    ('stock_ledger'),('pharmacy_batches'),('pharmacy_items')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
  END LOOP;
END $$;

DROP TABLE IF EXISTS health.integration_status;
DROP TABLE IF EXISTS health.telehealth_sessions;
DROP TABLE IF EXISTS health.ambulance_requests;
DROP TABLE IF EXISTS health.vehicles;
DROP TABLE IF EXISTS health.finance_events;
DROP TABLE IF EXISTS health.payment_allocations;
DROP TABLE IF EXISTS health.payments;
DROP TABLE IF EXISTS health.invoice_items;
DROP TABLE IF EXISTS health.invoices;
DROP TABLE IF EXISTS health.billable_services;
DROP TABLE IF EXISTS health.eye_exams;
DROP TABLE IF EXISTS health.imaging_reports;
DROP TABLE IF EXISTS health.imaging_orders;
DROP TABLE IF EXISTS health.lab_order_items;
DROP TABLE IF EXISTS health.lab_orders;
DROP TABLE IF EXISTS health.lab_tests;
DROP TABLE IF EXISTS health.dispenses;
DROP TABLE IF EXISTS health.stock_levels;
DROP TABLE IF EXISTS health.stock_ledger;
DROP TABLE IF EXISTS health.pharmacy_batches;
DROP TABLE IF EXISTS health.pharmacy_items;
COMMIT;
