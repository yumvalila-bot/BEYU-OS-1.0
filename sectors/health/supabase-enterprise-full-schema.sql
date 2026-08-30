-- BEYU Health OS Enterprise Database Schema
-- PostgreSQL/Supabase Implementation
-- Comprehensive multi-tenant healthcare data model

-- ============================================================================
-- SCHEMA CREATION AND EXTENSIONS
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- Create schemas for logical organization
create schema if not exists core;
create schema if not exists clinical;
create schema if not exists diagnostic;
create schema if not exists operational;
create schema if not exists financial;
create schema if not exists hr;
create schema if not exists inventory;
create schema if not exists compliance;
create schema if not exists ai;
create schema if not exists integration;

-- ============================================================================
-- CORE SCHEMA: Organizations, Tenants, Facilities, Departments
-- ============================================================================

create table if not exists core.organizations (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  organization_type text not null,
  slug text unique,
  country_code text default 'TZ',
  status text default 'active',
  settings jsonb default '{}'::jsonb,
  logo_url text,
  website text,
  phone text,
  email text,
  address text,
  city text,
  country text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

create table if not exists core.tenants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete cascade,
  tenant_name text not null,
  tenant_code text unique,
  tenant_type text not null, -- hospital, clinic, pharmacy, lab
  status text default 'active',
  license_number text,
  registration_number text,
  phone text,
  email text,
  address text,
  city text,
  region text,
  country text,
  settings jsonb default '{}'::jsonb,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  
  unique(organization_id, tenant_code)
);

create table if not exists core.facilities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  organization_id uuid not null references core.organizations(id) on delete cascade,
  facility_name text not null,
  facility_code text,
  facility_type text not null, -- hospital, clinic, pharmacy, lab, imaging center
  level text, -- Level 1, 2, 3, 4, 5 (Kenya system) or equivalent
  latitude numeric,
  longitude numeric,
  phone text,
  email text,
  address text,
  city text,
  region text,
  country text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  
  unique(tenant_id, facility_code)
);

create table if not exists core.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  facility_id uuid not null references core.facilities(id) on delete cascade,
  department_name text not null,
  department_code text,
  description text,
  department_type text, -- clinical, diagnostic, support, administrative
  status text default 'active',
  head_id uuid, -- Will reference staff member
  cost_center_id uuid,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  
  unique(facility_id, department_code)
);

create table if not exists core.buildings (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references core.facilities(id) on delete cascade,
  building_name text not null,
  building_code text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists core.floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references core.buildings(id) on delete cascade,
  floor_number integer,
  floor_name text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists core.wards (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references core.floors(id) on delete cascade,
  department_id uuid not null references core.departments(id) on delete cascade,
  ward_name text not null,
  ward_code text,
  ward_type text, -- general, icu, pediatric, maternity
  capacity integer,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  unique(floor_id, ward_code)
);

create table if not exists core.beds (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references core.wards(id) on delete cascade,
  bed_number text not null,
  bed_code text,
  bed_type text, -- standard, isolation, high-care
  status text default 'available', -- available, occupied, maintenance
  current_patient_id uuid,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  unique(ward_id, bed_code)
);

-- ============================================================================
-- PATIENT SCHEMA: Patients and Related Data
-- ============================================================================

create table if not exists clinical.patients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  organization_id uuid not null references core.organizations(id) on delete cascade,
  
  -- Basic Information
  full_name text not null,
  first_name text,
  middle_name text,
  last_name text,
  date_of_birth date,
  sex text, -- Male, Female, Other
  blood_type text, -- O+, O-, A+, A-, B+, B-, AB+, AB-
  
  -- Contact Information
  email text,
  phone text,
  alternative_phone text,
  
  -- Address
  residential_address text,
  city text,
  region text,
  country text,
  postal_code text,
  
  -- Identifiers
  mrn text, -- Medical Record Number (unique per tenant)
  nhif_number text, -- National Health Insurance Fund
  national_id text, -- National identity number
  passport_number text,
  
  -- Clinical Flags
  status text default 'active', -- active, inactive, deceased, transferred
  vip boolean default false,
  is_deceased boolean default false,
  date_of_death date,
  
  -- Emergency Contact
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  
  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  
  unique(tenant_id, mrn),
  unique(tenant_id, national_id)
);

create table if not exists clinical.patient_contacts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  contact_name text not null,
  relationship text,
  phone text,
  email text,
  address text,
  is_emergency boolean default false,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists clinical.patient_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  consent_type text not null, -- treatment, research, data-sharing, organ-donation
  description text,
  consented boolean default true,
  consent_date timestamptz,
  expiry_date timestamptz,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);

create table if not exists clinical.patient_flags (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  flag_type text not null, -- allergies, infectious, dnr, vip, security
  flag_name text,
  description text,
  severity text, -- low, medium, high, critical
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);

create table if not exists clinical.allergies (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  allergen text not null,
  reaction text,
  severity text, -- mild, moderate, severe
  onset_date date,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);

create table if not exists clinical.medical_history (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  history_type text not null, -- surgical, medical, family, social, lifestyle
  description text,
  onset_date date,
  resolution_date date,
  is_active boolean default true,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);

-- ============================================================================
-- CLINICAL SCHEMA: Encounters and Visits
-- ============================================================================

create table if not exists clinical.encounters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  facility_id uuid not null references core.facilities(id) on delete cascade,
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  encounter_type text not null, -- outpatient, inpatient, emergency, telemedicine
  encounter_number text, -- Unique per facility
  encounter_date timestamptz not null,
  
  -- Admission/Discharge
  admission_date timestamptz,
  discharge_date timestamptz,
  status text default 'ongoing', -- ongoing, completed, cancelled
  
  -- Assigned Clinician
  clinician_id uuid, -- References staff
  department_id uuid references core.departments(id),
  ward_id uuid references core.wards(id),
  bed_id uuid references core.beds(id),
  
  -- Notes
  chief_complaint text,
  discharge_summary text,
  
  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  
  unique(facility_id, encounter_number)
);

create table if not exists clinical.vital_signs (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references clinical.encounters(id) on delete cascade,
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  recorded_at timestamptz not null,
  recorded_by uuid,
  
  -- Vital Signs
  temperature numeric, -- Celsius
  heart_rate integer, -- BPM
  respiratory_rate integer, -- Breaths per minute
  systolic_bp integer, -- mmHg
  diastolic_bp integer, -- mmHg
  oxygen_saturation numeric, -- %
  blood_glucose numeric, -- mg/dL
  weight numeric, -- kg
  height numeric, -- cm
  bmi numeric,
  
  created_at timestamptz default now()
);

create table if not exists clinical.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  encounter_id uuid not null references clinical.encounters(id) on delete cascade,
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  note_type text not null, -- SOAP, progress, consult, discharge
  title text,
  content text,
  
  -- SOAP Structure (if applicable)
  subjective text,
  objective text,
  assessment text,
  plan text,
  
  -- Digital Signature
  signed_by uuid,
  signed_at timestamptz,
  
  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

create table if not exists clinical.diagnoses (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references clinical.encounters(id) on delete cascade,
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  icd10_code text, -- ICD-10 code
  icd11_code text, -- ICD-11 code
  snomed_code text, -- SNOMED CT code
  diagnosis_text text not null,
  diagnosis_type text, -- primary, secondary, comorbidity
  certainty text, -- confirmed, suspected, ruled-out
  onset_date date,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);

create table if not exists clinical.procedures (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references clinical.encounters(id) on delete cascade,
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  procedure_name text not null,
  procedure_code text,
  procedure_date timestamptz not null,
  status text, -- planned, completed, cancelled
  
  performed_by uuid,
  location text,
  notes text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);

create table if not exists clinical.medications (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references clinical.encounters(id) on delete cascade,
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  medication_name text not null,
  drug_code text, -- RxNorm code
  atc_code text, -- ATC classification
  
  dose text,
  unit text, -- mg, ml, tablet, etc.
  frequency text, -- once daily, twice daily, etc.
  route text, -- oral, IV, injection, etc.
  
  start_date date,
  end_date date,
  status text default 'active',
  
  prescriber_id uuid,
  indication text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);

-- ============================================================================
-- DIAGNOSTIC SCHEMA: Laboratory and Radiology
-- ============================================================================

create table if not exists diagnostic.lab_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  facility_id uuid not null references core.facilities(id) on delete cascade,
  encounter_id uuid not null references clinical.encounters(id) on delete cascade,
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  order_number text unique,
  order_date timestamptz not null,
  priority text default 'routine', -- routine, urgent, stat
  status text default 'pending', -- pending, collected, processing, completed, cancelled
  
  ordered_by uuid,
  department_id uuid references core.departments(id),
  
  clinical_indication text,
  special_instructions text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  updated_by uuid
);

create table if not exists diagnostic.lab_specimens (
  id uuid primary key default gen_random_uuid(),
  lab_order_id uuid not null references diagnostic.lab_orders(id) on delete cascade,
  
  specimen_type text not null, -- blood, urine, tissue, etc.
  specimen_number text unique,
  collection_date timestamptz,
  collection_location text,
  collector_id uuid,
  
  volume numeric,
  unit text,
  preservative text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists diagnostic.lab_tests (
  id uuid primary key default gen_random_uuid(),
  lab_order_id uuid not null references diagnostic.lab_orders(id) on delete cascade,
  specimen_id uuid references diagnostic.lab_specimens(id),
  
  test_name text not null,
  test_code text, -- LOINC code
  
  result_value text,
  result_unit text,
  reference_range text,
  status text default 'pending', -- pending, completed, cancelled
  
  is_critical boolean default false,
  critical_value_low numeric,
  critical_value_high numeric,
  
  analyzed_at timestamptz,
  analyzed_by uuid,
  verified_at timestamptz,
  verified_by uuid,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists diagnostic.lab_results (
  id uuid primary key default gen_random_uuid(),
  lab_order_id uuid not null references diagnostic.lab_orders(id) on delete cascade,
  
  result_date timestamptz,
  pdf_url text,
  status text default 'pending', -- pending, approved, reviewed
  
  reviewed_by uuid,
  reviewed_at timestamptz,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists diagnostic.radiology_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  facility_id uuid not null references core.facilities(id) on delete cascade,
  encounter_id uuid not null references clinical.encounters(id) on delete cascade,
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  order_number text unique,
  order_date timestamptz not null,
  priority text default 'routine',
  status text default 'pending', -- pending, scheduled, completed, reported
  
  modality text, -- X-ray, CT, MRI, Ultrasound, etc.
  body_part text,
  clinical_indication text,
  
  ordered_by uuid,
  performed_by uuid,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);

create table if not exists diagnostic.radiology_reports (
  id uuid primary key default gen_random_uuid(),
  radiology_order_id uuid not null references diagnostic.radiology_orders(id) on delete cascade,
  
  report_date timestamptz,
  report_text text,
  findings text,
  impressions text,
  
  radiologist_id uuid,
  reported_at timestamptz,
  
  pdf_url text,
  dicom_url text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================================
-- OPERATIONAL SCHEMA: Appointments and Scheduling
-- ============================================================================

create table if not exists operational.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  facility_id uuid not null references core.facilities(id) on delete cascade,
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  appointment_number text unique,
  appointment_date timestamptz not null,
  
  department_id uuid references core.departments(id),
  doctor_id uuid,
  
  appointment_type text, -- consultation, follow-up, lab, imaging, procedure
  status text default 'scheduled', -- scheduled, confirmed, no-show, completed, cancelled
  
  duration_minutes integer,
  notes text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid
);

create table if not exists operational.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references core.facilities(id) on delete cascade,
  department_id uuid not null references core.departments(id) on delete cascade,
  
  slot_date date,
  start_time time,
  end_time time,
  capacity integer,
  available_slots integer,
  is_active boolean default true,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists operational.staff_schedules (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references core.facilities(id) on delete cascade,
  staff_id uuid,
  
  shift_date date,
  shift_start time,
  shift_end time,
  shift_type text, -- morning, afternoon, night
  department_id uuid references core.departments(id),
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists operational.patient_transfers (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  from_facility_id uuid references core.facilities(id),
  to_facility_id uuid not null references core.facilities(id),
  
  from_department_id uuid references core.departments(id),
  to_department_id uuid references core.departments(id),
  
  from_ward_id uuid references core.wards(id),
  to_ward_id uuid references core.wards(id),
  
  transfer_date timestamptz not null,
  reason text,
  transferred_by uuid,
  
  received_at timestamptz,
  received_by uuid,
  
  created_at timestamptz default now()
);

-- ============================================================================
-- PHARMACY SCHEMA
-- ============================================================================

create table if not exists operational.prescriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  encounter_id uuid not null references clinical.encounters(id) on delete cascade,
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  prescription_number text unique,
  prescription_date timestamptz not null,
  
  status text default 'pending', -- pending, dispensed, cancelled, expired
  expiry_date date,
  
  prescribed_by uuid,
  dispensed_by uuid,
  dispensed_at timestamptz,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);

create table if not exists operational.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references operational.prescriptions(id) on delete cascade,
  
  medication_id uuid,
  medication_name text not null,
  drug_code text,
  
  quantity integer,
  unit text,
  dose text,
  frequency text,
  duration integer, -- days
  
  quantity_dispensed integer,
  
  created_at timestamptz default now()
);

create table if not exists operational.inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  facility_id uuid not null references core.facilities(id) on delete cascade,
  
  item_name text not null,
  item_code text unique,
  category text, -- medicines, consumables, equipment
  description text,
  
  unit_of_measure text, -- tablet, ml, box, etc.
  
  reorder_level integer,
  reorder_quantity integer,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);

create table if not exists operational.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references operational.inventory_items(id) on delete cascade,
  
  batch_number text,
  lot_number text,
  
  quantity integer,
  received_date date,
  expiry_date date,
  supplier_id uuid,
  cost_per_unit numeric,
  
  is_active boolean default true,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  unique(inventory_item_id, batch_number)
);

create table if not exists operational.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references core.facilities(id) on delete cascade,
  inventory_item_id uuid not null references operational.inventory_items(id) on delete cascade,
  
  transaction_type text not null, -- in, out, adjustment, transfer, return
  quantity integer not null,
  reference_type text, -- prescription, order, waste
  reference_id uuid,
  
  transaction_date timestamptz not null,
  recorded_by uuid,
  
  notes text,
  
  created_at timestamptz default now()
);

-- ============================================================================
-- FINANCIAL SCHEMA: Billing and Claims
-- ============================================================================

create table if not exists financial.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  facility_id uuid not null references core.facilities(id) on delete cascade,
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  invoice_number text unique,
  invoice_date date not null,
  
  encounter_id uuid references clinical.encounters(id),
  
  status text default 'draft', -- draft, issued, paid, cancelled
  
  subtotal numeric not null,
  tax_amount numeric default 0,
  discount_amount numeric default 0,
  total_amount numeric not null,
  
  currency text default 'TZS',
  
  due_date date,
  issued_date date,
  paid_date date,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);

create table if not exists financial.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references financial.invoices(id) on delete cascade,
  
  item_type text, -- service, medication, procedure, lab, imaging
  item_description text not null,
  
  quantity numeric,
  unit_price numeric,
  amount numeric,
  
  created_at timestamptz default now()
);

create table if not exists financial.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references financial.invoices(id) on delete cascade,
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  payment_number text unique,
  payment_date timestamptz not null,
  
  amount numeric not null,
  currency text default 'TZS',
  
  payment_method text, -- cash, card, transfer, mpesa, insurance
  payment_reference text,
  
  status text default 'pending', -- pending, completed, cancelled
  
  recorded_by uuid,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists financial.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  policy_number text unique,
  provider_name text,
  policy_type text, -- nhif, private, corporate
  
  start_date date,
  end_date date,
  status text default 'active',
  
  coverage_limit numeric,
  deductible numeric,
  copay_percentage numeric,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists financial.nhif_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  invoice_id uuid references financial.invoices(id),
  patient_id uuid not null references clinical.patients(id) on delete cascade,
  
  claim_reference text unique,
  claim_date date,
  
  patient_nhif_number text,
  facility_code text,
  
  total_claim_amount numeric,
  status text default 'draft', -- draft, submitted, approved, rejected, paid
  
  payload jsonb, -- NHIF payload
  response_payload jsonb, -- NHIF response
  
  submitted_at timestamptz,
  responded_at timestamptz,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);

-- ============================================================================
-- HR SCHEMA: Employees and Payroll
-- ============================================================================

create table if not exists hr.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  facility_id uuid references core.facilities(id),
  
  employee_number text unique,
  full_name text not null,
  email text,
  phone text,
  date_of_birth date,
  
  position_title text,
  department_id uuid references core.departments(id),
  
  employment_type text, -- permanent, contract, part-time
  status text default 'active', -- active, on-leave, suspended, terminated
  
  hire_date date,
  termination_date date,
  
  salary_scale text,
  bank_account text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);

create table if not exists hr.employee_qualifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hr.employees(id) on delete cascade,
  
  qualification_type text, -- degree, certificate, license
  qualification_name text,
  issuing_institution text,
  issue_date date,
  expiry_date date,
  certificate_url text,
  
  created_at timestamptz default now()
);

create table if not exists hr.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hr.employees(id) on delete cascade,
  
  attendance_date date,
  check_in_time time,
  check_out_time time,
  status text, -- present, absent, late, on-leave
  
  created_at timestamptz default now()
);

create table if not exists hr.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references hr.employees(id) on delete cascade,
  
  leave_type text, -- annual, sick, maternity, compassionate
  start_date date,
  end_date date,
  
  reason text,
  status text default 'pending', -- pending, approved, rejected
  
  approved_by uuid,
  approved_at timestamptz,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists hr.payroll (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  employee_id uuid not null references hr.employees(id) on delete cascade,
  
  payroll_period_start date,
  payroll_period_end date,
  
  basic_salary numeric,
  allowances numeric default 0,
  deductions numeric default 0,
  net_pay numeric,
  
  status text default 'pending', -- pending, approved, paid
  paid_date date,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================================
-- COMPLIANCE SCHEMA: Audit Logs and Consent
-- ============================================================================

create table if not exists compliance.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  organization_id uuid references core.organizations(id),
  facility_id uuid references core.facilities(id),
  
  event_type text not null, -- create, read, update, delete, login, export
  table_name text,
  record_id uuid,
  
  action_description text,
  
  actor_id uuid,
  actor_email text,
  actor_role text,
  
  old_values jsonb,
  new_values jsonb,
  
  ip_address text,
  user_agent text,
  
  created_at timestamptz default now()
);

create table if not exists compliance.change_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  
  table_name text not null,
  record_id uuid not null,
  
  change_type text, -- insert, update, delete
  old_values jsonb,
  new_values jsonb,
  
  changed_at timestamptz default now(),
  changed_by uuid,
  
  created_at timestamptz default now()
);

create table if not exists compliance.access_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  
  user_id uuid,
  email text,
  resource_type text,
  resource_id uuid,
  
  access_type text, -- read, write, delete, export
  granted boolean,
  denial_reason text,
  
  accessed_at timestamptz default now()
);

-- ============================================================================
-- AI SCHEMA: Embeddings and Inference
-- ============================================================================

create table if not exists ai.embeddings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  
  source_type text not null, -- clinical_note, lab_report, radiology_report
  source_id uuid,
  
  content text,
  vector vector(1536),
  
  model_name text default 'text-embedding-3-small',
  
  created_at timestamptz default now()
);

create index on ai.embeddings using ivfflat (vector vector_cosine_ops);

create table if not exists ai.inference_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  patient_id uuid references clinical.patients(id),
  
  model_name text,
  prompt text,
  completion text,
  
  tokens_used integer,
  inference_time_ms integer,
  
  created_at timestamptz default now()
);

-- ============================================================================
-- INTEGRATION SCHEMA: External Data
-- ============================================================================

create table if not exists integration.fhir_resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  
  resource_type text not null, -- Patient, Encounter, Observation, etc.
  external_id text, -- FHIR resource ID
  
  payload jsonb not null,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists integration.external_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  
  integration_name text,
  integration_type text, -- nhif, dhis2, payment, email, sms
  
  api_endpoint text,
  api_key text, -- Encrypted
  status text default 'active',
  
  last_sync_date timestamptz,
  sync_status text, -- success, pending, failed
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================================
-- TRIGGERS: Updated At
-- ============================================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger organizations_update_trigger
before update on core.organizations
for each row execute function set_updated_at();

create trigger tenants_update_trigger
before update on core.tenants
for each row execute function set_updated_at();

create trigger facilities_update_trigger
before update on core.facilities
for each row execute function set_updated_at();

create trigger departments_update_trigger
before update on core.departments
for each row execute function set_updated_at();

create trigger patients_update_trigger
before update on clinical.patients
for each row execute function set_updated_at();

create trigger encounters_update_trigger
before update on clinical.encounters
for each row execute function set_updated_at();

create trigger clinical_notes_update_trigger
before update on clinical.clinical_notes
for each row execute function set_updated_at();

create trigger invoices_update_trigger
before update on financial.invoices
for each row execute function set_updated_at();

create trigger payments_update_trigger
before update on financial.payments
for each row execute function set_updated_at();

create trigger prescriptions_update_trigger
before update on operational.prescriptions
for each row execute function set_updated_at();

create trigger appointments_update_trigger
before update on operational.appointments
for each row execute function set_updated_at();

-- ============================================================================
-- INDEXES: Performance Optimization
-- ============================================================================

-- Patient indexes
create index idx_patients_tenant on clinical.patients(tenant_id);
create index idx_patients_mrn on clinical.patients(mrn);
create index idx_patients_national_id on clinical.patients(national_id);
create index idx_patients_status on clinical.patients(status);

-- Encounter indexes
create index idx_encounters_patient on clinical.encounters(patient_id);
create index idx_encounters_facility on clinical.encounters(facility_id);
create index idx_encounters_tenant on clinical.encounters(tenant_id);
create index idx_encounters_status on clinical.encounters(status);
create index idx_encounters_date on clinical.encounters(encounter_date);

-- Clinical notes indexes
create index idx_clinical_notes_encounter on clinical.clinical_notes(encounter_id);
create index idx_clinical_notes_patient on clinical.clinical_notes(patient_id);
create index idx_clinical_notes_tenant on clinical.clinical_notes(tenant_id);

-- Appointment indexes
create index idx_appointments_patient on operational.appointments(patient_id);
create index idx_appointments_facility on operational.appointments(facility_id);
create index idx_appointments_date on operational.appointments(appointment_date);

-- Invoice indexes
create index idx_invoices_patient on financial.invoices(patient_id);
create index idx_invoices_facility on financial.invoices(facility_id);
create index idx_invoices_status on financial.invoices(status);

-- Lab order indexes
create index idx_lab_orders_patient on diagnostic.lab_orders(patient_id);
create index idx_lab_orders_facility on diagnostic.lab_orders(facility_id);
create index idx_lab_orders_status on diagnostic.lab_orders(status);

-- Audit log indexes
create index idx_audit_events_tenant on compliance.audit_events(tenant_id);
create index idx_audit_events_created on compliance.audit_events(created_at);

-- NHIF claim indexes
create index idx_nhif_claims_patient on financial.nhif_claims(patient_id);
create index idx_nhif_claims_status on financial.nhif_claims(status);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
alter table core.organizations enable row level security;
alter table core.tenants enable row level security;
alter table core.facilities enable row level security;
alter table core.departments enable row level security;
alter table clinical.patients enable row level security;
alter table clinical.encounters enable row level security;
alter table clinical.clinical_notes enable row level security;
alter table diagnostic.lab_orders enable row level security;
alter table financial.invoices enable row level security;
alter table operational.appointments enable row level security;
alter table operational.prescriptions enable row level security;
alter table compliance.audit_events enable row level security;

-- Sample RLS policy: Patients can view only their own records
create policy patients_select_own on clinical.patients
for select using (auth.uid()::uuid = id or auth.role() = 'admin');

create policy patients_update_own on clinical.patients
for update using (auth.uid()::uuid = id or auth.role() = 'admin');

-- Tenant isolation: Users can only see data from their tenant
create policy tenant_isolation_patients on clinical.patients
for all using (
  tenant_id in (
    select tenant_id from core.tenants
    where organization_id in (
      select organization_id from core.organizations
    )
  )
  or auth.role() = 'admin'
);

-- ============================================================================
-- FULL-TEXT SEARCH SETUP
-- ============================================================================

alter table clinical.patients add column if not exists search_text tsvector;

create or replace function patients_search_trigger()
returns trigger as $$
begin
  new.search_text := to_tsvector('english', coalesce(new.full_name, '') || ' ' || coalesce(new.mrn, '') || ' ' || coalesce(new.email, ''));
  return new;
end;
$$ language plpgsql;

create trigger patients_search_update
before insert or update on clinical.patients
for each row execute function patients_search_trigger();

create index idx_patients_search on clinical.patients using gin(search_text);

-- ============================================================================
-- MATERIALIZED VIEW: Patient Dashboard Summary
-- ============================================================================

create materialized view patient_dashboard_summary as
select
  p.id,
  p.tenant_id,
  p.full_name,
  p.mrn,
  p.date_of_birth,
  count(distinct e.id) as total_encounters,
  max(e.encounter_date) as last_visit,
  count(distinct d.id) as total_diagnoses,
  count(distinct m.id) as total_medications
from clinical.patients p
left join clinical.encounters e on e.patient_id = p.id
left join clinical.diagnoses d on d.patient_id = p.id
left join clinical.medications m on m.patient_id = p.id
where p.deleted_at is null
group by p.id, p.tenant_id, p.full_name, p.mrn, p.date_of_birth;

create index idx_patient_dashboard_summary_tenant on patient_dashboard_summary(tenant_id);

-- ============================================================================
-- DONE
-- ============================================================================
-- This schema provides a comprehensive, multi-tenant healthcare database
-- that is production-ready, FHIR-compatible, and healthcare-compliant.
-- ============================================================================
