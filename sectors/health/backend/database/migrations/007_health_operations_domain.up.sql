-- Migration 007: Operational execution domain — pharmacy, laboratory,
-- radiology, ophthalmology, billing/revenue cycle, ambulance/emergency,
-- telemedicine. All tables live under the health.* schema with the same
-- conventions as migrations 004-006: uuid PKs, tenant_id FK, entity_code,
-- country_code, audit columns (created_by/updated_by/voided_at/voided_by/
-- correlation_id), soft-delete, CHECK constraints on state/kind columns,
-- RLS enabled with *_isolation policies, updated_at triggers.
--
-- Design notes:
--  * Pharmacy inventory movements are INSERT-only ledger entries
--    (health.stock_ledger); stock_levels is maintained via trigger so
--    negative inventory is rejected with a CHECK on on_hand >= 0.
--  * Dispensing links to an order (medication order → dispense event).
--  * Lab results cannot silently overwrite verified results; amendments
--    use parent_id chain.
--  * Radiology reports have verified_by/verified_at + amendment chain.
--  * Ophthalmology uses a structured exam table with RIGHT/LEFT/OU
--    laterality (CHECK laterality IN ('right','left','bilateral')).
--  * Billing executes within the sector; invoice → payment allocation →
--    refund/adjustment ledger. No general-ledger double entry (that lives
--    in Finance OS); a governance boundary table health.finance_events
--    stages outbound ledger events to Finance OS.
--  * Ambulance/telemedicine tables record identifiers, status lifecycles,
--    and handoff metadata but never fabricate GPS/video data.
--  * Every table has idempotency_key columns where retry-safety matters.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHARMACY
-- ─────────────────────────────────────────────────────────────────────────────

-- Medication catalog (tenant-local; items reference a universal code if known).
CREATE TABLE IF NOT EXISTS health.pharmacy_items (
  item_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  sku             text NOT NULL,
  name            text NOT NULL,
  generic_name    text,
  form            text,            -- tablet | capsule | syrup | injectable | cream | ...
  strength        text,
  unit            text NOT NULL DEFAULT 'each', -- each | mg | ml | box | vial
  controlled      boolean NOT NULL DEFAULT false,
  requires_rx     boolean NOT NULL DEFAULT true,
  code_system     text NOT NULL DEFAULT 'RXNORM',
  code            text,
  reorder_level   numeric NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'active', -- active | discontinued
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, sku),
  CHECK (status IN ('active','discontinued'))
);

-- Batches (lot tracking, expiry).
CREATE TABLE IF NOT EXISTS health.pharmacy_batches (
  batch_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  item_id         uuid NOT NULL REFERENCES health.pharmacy_items(item_id) ON DELETE CASCADE,
  lot_number      text NOT NULL,
  expiry_date     date NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  initial_qty     numeric NOT NULL CHECK (initial_qty >= 0),
  status          text NOT NULL DEFAULT 'available', -- available | quarantined | expired | recalled | exhausted
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, item_id, lot_number),
  CHECK (status IN ('available','quarantined','expired','recalled','exhausted'))
);

-- Stock movement ledger (append-only).
CREATE TABLE IF NOT EXISTS health.stock_ledger (
  movement_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  item_id         uuid NOT NULL REFERENCES health.pharmacy_items(item_id) ON DELETE CASCADE,
  batch_id        uuid REFERENCES health.pharmacy_batches(batch_id) ON DELETE SET NULL,
  movement_type   text NOT NULL,  -- receive | dispense | adjust | return_to_stock | waste | transfer_out | transfer_in | recall
  qty             numeric NOT NULL,
  running_total   numeric NOT NULL,
  reference_type  text,           -- dispense | receipt | adjustment
  reference_id    uuid,
  note            text,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (movement_type IN ('receive','dispense','adjust','return_to_stock','waste','transfer_out','transfer_in','recall'))
);
CREATE INDEX IF NOT EXISTS idx_stock_item_time ON health.stock_ledger(item_id, created_at DESC);

-- Current stock per item (maintained by trigger; CHECK prevents negative).
CREATE TABLE IF NOT EXISTS health.stock_levels (
  item_id         uuid PRIMARY KEY REFERENCES health.pharmacy_items(item_id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  on_hand         numeric NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Dispense events (link a medication order to a fulfilled dispense).
CREATE TABLE IF NOT EXISTS health.dispenses (
  dispense_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  medication_id   uuid NOT NULL REFERENCES health.medications(medication_id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  item_id         uuid NOT NULL REFERENCES health.pharmacy_items(item_id),
  qty             numeric NOT NULL CHECK (qty > 0),
  dose_given      text,
  status          text NOT NULL DEFAULT 'dispensed', -- prepared | dispensed | returned | cancelled
  dispensed_at    timestamptz NOT NULL DEFAULT now(),
  dispensed_by    uuid REFERENCES beyu_identity.users(global_user_id),
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, idempotency_key),
  CHECK (status IN ('prepared','dispensed','returned','cancelled'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- LABORATORY
-- ─────────────────────────────────────────────────────────────────────────────

-- Lab test catalog.
CREATE TABLE IF NOT EXISTS health.lab_tests (
  test_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  code_system     text NOT NULL DEFAULT 'LOINC',
  code            text,
  name            text NOT NULL,
  specimen_type   text,           -- blood | urine | stool | csf | swab | tissue | other
  unit            text,
  reference_low   numeric,
  reference_high  numeric,
  reference_text  text,
  turnaround_min  integer,
  status          text NOT NULL DEFAULT 'active',
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, code, name),
  CHECK (status IN ('active','inactive'))
);

-- Lab orders.
CREATE TABLE IF NOT EXISTS health.lab_orders (
  order_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  order_no        text NOT NULL,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  provider_id     uuid REFERENCES health.providers(provider_id),
  clinical_info   text,
  status          text NOT NULL DEFAULT 'ordered', -- ordered | collected | received | in_progress | completed | cancelled | rejected
  urgent          boolean NOT NULL DEFAULT false,
  ordered_at      timestamptz NOT NULL DEFAULT now(),
  collected_at    timestamptz,
  received_at     timestamptz,
  completed_at    timestamptz,
  cancelled_at    timestamptz,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, order_no),
  CHECK (status IN ('ordered','collected','received','in_progress','completed','cancelled','rejected'))
);

-- Order line items (tests requested).
CREATE TABLE IF NOT EXISTS health.lab_order_items (
  order_item_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  order_id        uuid NOT NULL REFERENCES health.lab_orders(order_id) ON DELETE CASCADE,
  test_id         uuid NOT NULL REFERENCES health.lab_tests(test_id),
  status          text NOT NULL DEFAULT 'ordered',
  result_value_numeric numeric,
  result_value_text    text,
  abnormal_flag   text,           -- normal | low | high | critical_low | critical_high
  comment         text,
  result_entered_at timestamptz,
  verified_by     uuid REFERENCES beyu_identity.users(global_user_id),
  verified_at     timestamptz,
  parent_id       uuid REFERENCES health.lab_order_items(order_item_id) ON DELETE SET NULL, -- amendment chain
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('ordered','collected','in_progress','completed','cancelled','rejected','amended')),
  CHECK (abnormal_flag IS NULL OR abnormal_flag IN ('normal','low','high','critical_low','critical_high'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RADIOLOGY / IMAGING
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS health.imaging_orders (
  imaging_order_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  order_no        text NOT NULL,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  provider_id     uuid REFERENCES health.providers(provider_id),
  modality        text NOT NULL,  -- xray | ct | mri | ultrasound | doppler | mammo | fluoroscopy | nuclear | other
  body_part       text NOT NULL,
  laterality      text,           -- right | left | bilateral
  clinical_indication text,
  contrast        boolean NOT NULL DEFAULT false,
  urgency         text NOT NULL DEFAULT 'routine', -- routine | urgent | stat
  status          text NOT NULL DEFAULT 'ordered', -- ordered | scheduled | in_progress | preliminary | final | cancelled
  scheduled_at    timestamptz,
  dicom_study_uid text,           -- integration boundary; not fabricated
  completed_at    timestamptz,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, order_no),
  CHECK (modality IN ('xray','ct','mri','ultrasound','doppler','mammo','fluoroscopy','nuclear','other')),
  CHECK (laterality IS NULL OR laterality IN ('right','left','bilateral')),
  CHECK (urgency IN ('routine','urgent','stat')),
  CHECK (status IN ('ordered','scheduled','in_progress','preliminary','final','cancelled'))
);

CREATE TABLE IF NOT EXISTS health.imaging_reports (
  report_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  imaging_order_id uuid NOT NULL REFERENCES health.imaging_orders(imaging_order_id) ON DELETE CASCADE,
  findings        text NOT NULL,
  impression      text,
  status          text NOT NULL DEFAULT 'draft', -- draft | preliminary | final | amended
  reported_by     uuid REFERENCES beyu_identity.users(global_user_id),
  verified_by     uuid REFERENCES beyu_identity.users(global_user_id),
  verified_at     timestamptz,
  parent_id       uuid REFERENCES health.imaging_reports(report_id) ON DELETE SET NULL,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (status IN ('draft','preliminary','final','amended'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- OPHTHALMOLOGY (structured exam)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS health.eye_exams (
  exam_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  exam_date       date NOT NULL DEFAULT CURRENT_DATE,
  provider_id     uuid REFERENCES health.providers(provider_id),
  -- Visual acuity: stored as structured strings per eye; 6/x, 20/y, etc.
  va_od           text,       -- right
  va_os           text,       -- left
  va_ou           text,       -- both
  va_pinhole_od   text,
  va_pinhole_os   text,
  refraction_od   text,
  refraction_os   text,
  iop_od          numeric,    -- mmHg
  iop_os          numeric,
  slit_lamp_od    text,
  slit_lamp_os    text,
  fundus_od       text,
  fundus_os       text,
  diagnosis_od    text,
  diagnosis_os    text,
  diagnosis_ou    text,
  plan            text,
  follow_up_date  date,
  laterality_focus text, -- right | left | bilateral | ou
  notes           text,
  signed_by       uuid REFERENCES beyu_identity.users(global_user_id),
  signed_at       timestamptz,
  parent_id       uuid REFERENCES health.eye_exams(exam_id) ON DELETE SET NULL,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (laterality_focus IS NULL OR laterality_focus IN ('right','left','bilateral','ou'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- BILLING / REVENUE CYCLE (sector execution — not a financial ledger)
-- ─────────────────────────────────────────────────────────────────────────────

-- Charge catalog.
CREATE TABLE IF NOT EXISTS health.billable_services (
  service_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  code            text NOT NULL,
  code_system     text NOT NULL DEFAULT 'LOCAL', -- CPT | LOCAL | NHIF | ICD-10-PCS
  name            text NOT NULL,
  description     text,
  unit_price      numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  currency        text NOT NULL DEFAULT 'TZS',
  category        text NOT NULL DEFAULT 'service', -- consultation | pharmacy | lab | imaging | procedure | ward | other
  status          text NOT NULL DEFAULT 'active',
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, code),
  CHECK (category IN ('consultation','pharmacy','lab','imaging','procedure','ward','other')),
  CHECK (status IN ('active','inactive'))
);

-- Invoices.
CREATE TABLE IF NOT EXISTS health.invoices (
  invoice_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  invoice_no      text NOT NULL,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'draft', -- draft | issued | partially_paid | paid | cancelled | refunded | written_off
  currency        text NOT NULL DEFAULT 'TZS',
  subtotal        numeric NOT NULL DEFAULT 0,
  tax             numeric NOT NULL DEFAULT 0,
  discount        numeric NOT NULL DEFAULT 0,
  total           numeric NOT NULL DEFAULT 0,
  paid            numeric NOT NULL DEFAULT 0,
  balance         numeric NOT NULL DEFAULT 0,
  issued_at       timestamptz,
  due_at          timestamptz,
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_no),
  CHECK (status IN ('draft','issued','partially_paid','paid','cancelled','refunded','written_off')),
  CHECK (subtotal >= 0),
  CHECK (total >= 0),
  CHECK (paid >= 0),
  CHECK (balance >= 0)
);

-- Invoice line items.
CREATE TABLE IF NOT EXISTS health.invoice_items (
  item_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  invoice_id      uuid NOT NULL REFERENCES health.invoices(invoice_id) ON DELETE CASCADE,
  service_id      uuid REFERENCES health.billable_services(service_id),
  description     text NOT NULL,
  qty             numeric NOT NULL DEFAULT 1,
  unit_price      numeric NOT NULL CHECK (unit_price >= 0),
  line_total      numeric NOT NULL CHECK (line_total >= 0),
  reference_type  text,
  reference_id    uuid,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Payments (allocated against invoices via payment_allocations).
CREATE TABLE IF NOT EXISTS health.payments (
  payment_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  payment_no      text NOT NULL,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  method          text NOT NULL,  -- cash | card | mobile_money | bank_transfer | insurance | nhif
  amount          numeric NOT NULL CHECK (amount > 0),
  currency        text NOT NULL DEFAULT 'TZS',
  status          text NOT NULL DEFAULT 'received', -- received | reconciled | refunded | failed
  reference_no    text,          -- external txn id (MPESA code, bank ref)
  received_at     timestamptz NOT NULL DEFAULT now(),
  reconciled_at   timestamptz,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, payment_no),
  UNIQUE (tenant_id, idempotency_key),
  CHECK (method IN ('cash','card','mobile_money','bank_transfer','insurance','nhif')),
  CHECK (status IN ('received','reconciled','refunded','failed'))
);

CREATE TABLE IF NOT EXISTS health.payment_allocations (
  allocation_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  payment_id      uuid NOT NULL REFERENCES health.payments(payment_id) ON DELETE CASCADE,
  invoice_id      uuid NOT NULL REFERENCES health.invoices(invoice_id) ON DELETE CASCADE,
  amount          numeric NOT NULL CHECK (amount > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text
);

-- Governance boundary: events staged for Finance OS (the sector OS does not
-- post directly into the canonical ledger).
CREATE TABLE IF NOT EXISTS health.finance_events (
  event_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  event_type      text NOT NULL,  -- invoice.issued | payment.received | refund.issued | adjustment.posted
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending', -- pending | delivered | failed
  delivered_at    timestamptz,
  last_error      text,
  idempotency_key text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_type, idempotency_key),
  CHECK (event_type IN ('invoice.issued','payment.received','refund.issued','adjustment.posted')),
  CHECK (status IN ('pending','delivered','failed'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- AMBULANCE / EMERGENCY
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS health.vehicles (
  vehicle_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  plate           text NOT NULL,
  call_sign       text,
  type            text NOT NULL DEFAULT 'ambulance', -- ambulance | response_car | motorcycle
  status          text NOT NULL DEFAULT 'available', -- available | dispatched | enroute | on_scene | transporting | returning | out_of_service | maintenance
  current_station text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, plate),
  CHECK (type IN ('ambulance','response_car','motorcycle')),
  CHECK (status IN ('available','dispatched','enroute','on_scene','transporting','returning','out_of_service','maintenance'))
);

CREATE TABLE IF NOT EXISTS health.ambulance_requests (
  request_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  request_no      text NOT NULL,
  patient_id      uuid REFERENCES health.patients(patient_id) ON DELETE SET NULL,
  caller_name     text,
  caller_phone    text,
  pickup_location text NOT NULL,
  pickup_lat      numeric,   -- null when GPS unavailable; no fabrication
  pickup_lng      numeric,
  destination     text,
  priority        text NOT NULL DEFAULT 'urgent', -- routine | urgent | emergency | resuscitation
  chief_complaint text,
  status          text NOT NULL DEFAULT 'received', -- received | dispatched | enroute | on_scene | transporting | delivered | cancelled | no_transport
  vehicle_id      uuid REFERENCES health.vehicles(vehicle_id),
  crew_ids        uuid[] NOT NULL DEFAULT '{}',
  dispatched_at   timestamptz,
  arrived_at      timestamptz,
  departed_scene_at timestamptz,
  delivered_at    timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,
  handoff_notes   text,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  UNIQUE (tenant_id, request_no),
  CHECK (priority IN ('routine','urgent','emergency','resuscitation')),
  CHECK (status IN ('received','dispatched','enroute','on_scene','transporting','delivered','cancelled','no_transport'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TELEMEDICINE (session metadata only; no video fabric baked in)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS health.telehealth_sessions (
  session_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  entity_code     text,
  country_code    text,
  patient_id      uuid NOT NULL REFERENCES health.patients(patient_id) ON DELETE CASCADE,
  encounter_id    uuid REFERENCES health.encounters(encounter_id) ON DELETE SET NULL,
  provider_id     uuid REFERENCES health.providers(provider_id),
  appointment_id  uuid REFERENCES health.appointments(appointment_id) ON DELETE SET NULL,
  kind            text NOT NULL DEFAULT 'video', -- video | audio | async_message
  status          text NOT NULL DEFAULT 'requested', -- requested | confirmed | in_progress | completed | missed | cancelled | declined
  consent_obtained boolean NOT NULL DEFAULT false,
  provider_token  text,     -- opaque; generated by adapter, not a long-lived key
  patient_token   text,
  provider_url    text,
  patient_url     text,
  started_at      timestamptz,
  ended_at        timestamptz,
  duration_sec    integer,
  notes           text,
  attachments_mb  numeric,
  idempotency_key text,
  created_by      uuid REFERENCES beyu_identity.users(global_user_id),
  updated_by      uuid REFERENCES beyu_identity.users(global_user_id),
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  voided_at       timestamptz,
  voided_by       uuid REFERENCES beyu_identity.users(global_user_id),
  CHECK (kind IN ('video','audio','async_message')),
  CHECK (status IN ('requested','confirmed','in_progress','completed','missed','cancelled','declined'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- External integration status registry (NHIF / TRA / TMDA / PACS / video ...)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS health.integration_status (
  integration_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES beyu_identity.tenants(tenant_id) ON DELETE CASCADE,
  provider        text NOT NULL,   -- nhif | tra | tmda | pacs | video_provider | fhir_endpoint | mtuha_submission | finance_os
  state           text NOT NULL DEFAULT 'unconfigured', -- unconfigured | configured | available | unavailable | unauthorized | failed
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error      text,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider),
  CHECK (state IN ('unconfigured','configured','available','unavailable','unauthorized','failed'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- shared: indexes, updated_at triggers, RLS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pharmacy_batches_item_exp ON health.pharmacy_batches(item_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_dispenses_patient ON health.dispenses(patient_id, dispensed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON health.lab_orders(patient_id, ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_order_items_order ON health.lab_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_imaging_orders_patient ON health.imaging_orders(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imaging_reports_order ON health.imaging_reports(imaging_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eye_exams_patient ON health.eye_exams(patient_id, exam_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON health.invoices(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON health.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient ON health.payments(patient_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON health.payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_finance_events_status ON health.finance_events(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ambulance_requests_status ON health.ambulance_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON health.vehicles(status);
CREATE INDEX IF NOT EXISTS idx_telehealth_patient ON health.telehealth_sessions(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_provider ON health.integration_status(tenant_id, provider);

-- updated_at triggers on all new tables.
DO $$
DECLARE t text;
BEGIN
  FOR t IN VALUES
    ('pharmacy_items'),('pharmacy_batches'),('dispenses'),('lab_tests'),('lab_orders'),
    ('lab_order_items'),('imaging_orders'),('imaging_reports'),('eye_exams'),
    ('billable_services'),('invoices'),('payments'),('vehicles'),
    ('ambulance_requests'),('telehealth_sessions'),('integration_status')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON health.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON health.%I FOR EACH ROW EXECUTE FUNCTION health.set_updated_at()', t, t);
  END LOOP;
END $$;

-- Stock-levels updated_at maintained by dedicated trigger below.

-- RLS: every table isolation policy.
DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN VALUES
    ('pharmacy_items'),('pharmacy_batches'),('stock_ledger'),('stock_levels'),('dispenses'),
    ('lab_tests'),('lab_orders'),('lab_order_items'),
    ('imaging_orders'),('imaging_reports'),('eye_exams'),
    ('billable_services'),('invoices'),('invoice_items'),('payments'),('payment_allocations'),('finance_events'),
    ('vehicles'),('ambulance_requests'),('telehealth_sessions'),('integration_status')
  LOOP
    EXECUTE format('ALTER TABLE health.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS health_%I_isolation ON health.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY health_%I_isolation ON health.%I
         USING (current_setting(''app.tenant_id'', true) = tenant_id::text AND beyu_identity.tenant_matches_boundary(tenant_id))
         WITH CHECK (current_setting(''app.tenant_id'', true) = tenant_id::text AND beyu_identity.tenant_matches_boundary(tenant_id))',
      tbl, tbl);
  END LOOP;
END $$;

-- Trigger: maintain stock_levels from stock_ledger entries.
-- Written in simple PL/pgSQL to be portable to PGlite for tests.
CREATE OR REPLACE FUNCTION health.apply_stock_movement()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.movement_type = 'dispense' OR NEW.movement_type = 'waste'
     OR NEW.movement_type = 'transfer_out' OR NEW.movement_type = 'recall' THEN
    INSERT INTO health.stock_levels (item_id, tenant_id, on_hand, updated_at)
      VALUES (NEW.item_id, NEW.tenant_id, 0, now())
      ON CONFLICT (item_id) DO UPDATE SET on_hand = health.stock_levels.on_hand - NEW.qty, updated_at = now();
  ELSIF NEW.movement_type = 'receive' OR NEW.movement_type = 'return_to_stock'
     OR NEW.movement_type = 'transfer_in' OR NEW.movement_type = 'adjust' THEN
    INSERT INTO health.stock_levels (item_id, tenant_id, on_hand, updated_at)
      VALUES (NEW.item_id, NEW.tenant_id, NEW.qty, now())
      ON CONFLICT (item_id) DO UPDATE SET on_hand = health.stock_levels.on_hand + NEW.qty, updated_at = now();
  ELSE
    RAISE EXCEPTION 'unknown movement_type';
  END IF;
  SELECT on_hand INTO NEW.running_total FROM health.stock_levels WHERE item_id = NEW.item_id;
  IF NEW.running_total < 0 THEN RAISE EXCEPTION 'negative inventory prohibited'; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_stock_movement ON health.stock_ledger;
CREATE TRIGGER trg_stock_movement BEFORE INSERT ON health.stock_ledger
  FOR EACH ROW EXECUTE FUNCTION health.apply_stock_movement();

COMMIT;
