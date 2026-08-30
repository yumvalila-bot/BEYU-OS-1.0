# Production-Ready Supabase Architecture for BEYU Health OS

## 1. Architecture goals

This design targets a multi-tenant healthcare platform that can support clinics, hospitals, pharmacies, laboratories, insurers, and public health programs on a single Supabase foundation.

Core design goals:
- Support 100+ normalized healthcare tables
- Enforce tenant isolation for every record
- Integrate Supabase Auth with RBAC and organization-level permissions
- Provide auditability for compliance and investigations
- Support FHIR-compatible data exchange and AI-ready data structures
- Enable secure document storage, real-time updates, and external integrations

---

## 2. Recommended platform shape

### Core layers
1. Auth and identity
   - Supabase Auth for sign-in and MFA
   - Custom profile, role, and membership tables
   - RBAC and tenant-scoped permissions

2. Core transactional database
   - PostgreSQL tables for patient, clinical, operational, billing, and governance data
   - Strong foreign keys and normalized domains
   - Row-level security on every tenant-sensitive table

3. Storage and files
   - Private buckets for patient documents, consent forms, lab reports, imaging, and contracts
   - Signed URLs with short expiry and object-level access controls

4. Realtime and eventing
   - Realtime channels for appointments, lab results, care team updates, claims approvals, and audit events
   - Edge Functions for webhook processing and integration sync

5. Analytics and AI
   - pgvector-ready embeddings for Noelia-style reasoning and summarization
   - Event streams for patient risk scoring, claims intelligence, and operational analytics

---

## 3. Multi-tenant model

### Tenant hierarchy
- Organization: hospital, clinic, pharmacy, lab, insurer, ministry, or partner network
- Tenant: logical operating unit inside an organization
- Department: clinical, finance, pharmacy, radiology, lab, IT, admin
- Role: doctor, nurse, pharmacist, lab-technologist, billing, admin, auditor, patient
- Membership: links a user to one or many tenants and roles

### Core tenant tables
- organizations
- organization_types
- tenants
- departments
- organization_members
- roles
- permissions
- access_policies
- tenant_settings

---

## 4. Data domain blueprint

The target model should be organized around the following domains.

### A. Identity and access
- profiles
- organization_members
- roles
- permissions
- access_policies
- sessions
- mfa_methods
- login_events

### B. Patient and clinical data
- patients
- patient_identifiers
- patient_contacts
- patient_consents
- encounters
- conditions
- diagnoses
- observations
- vitals
- allergies
- medications
- medication_orders
- medication_dispenses
- procedures
- clinical_notes
- care_plans
- referrals
- discharge_summaries
- adverse_events
- immunizations

### C. Scheduling and operations
- facilities
- departments
- beds
- wards
- appointments
- appointment_slots
- care_team_assignments
- shifts
- queues
- service_catalogs
- tasks
- checklists
- transfers

### D. Pharmacy, lab, imaging, and diagnostics
- pharmacy_orders
- prescriptions
- dispense_records
- inventory_items
- stock_batches
- stock_movements
- lab_orders
- lab_specimens
- lab_results
- radiology_orders
- imaging_studies
- imaging_reports
- equipment
- calibration_records

### E. Finance and insurance
- invoices
- invoice_lines
- payments
- payment_methods
- insurance_policies
- payer_profiles
- pre_authorizations
- nhif_claims
- nhif_claim_lines
- reimbursement_rules
- denials
- ledger_entries
- tax_rules

### F. Compliance, governance, and audit
- audit_events
- consent_records
- policy_versions
- incidents
- corrective_actions
- approvals
- signatures
- training_completions
- retention_policies
- breach_reports

### G. Documents and integrations
- documents
- document_versions
- storage_objects
- integrations
- integration_events
- webhook_deliveries
- hl7_messages
- fhir_resources
- terminology_codes
- terminology_maps
- notifications

### H. AI and reasoning
- embeddings
- vector_indexes
- inference_runs
- prompt_templates
- summarization_jobs
- risk_signals
- noelia_cases
- feature_store_items
- model_feedback

---

## 5. Table target footprint

A production-ready implementation should grow beyond the initial patient and appointment tables into a structured healthcare platform with 100+ tables. A practical target is approximately 120 tables grouped as follows:

| Domain | Example tables | Estimated count |
|---|---|---:|
| Identity and access | profiles, organization_members, roles, permissions, access_policies | 10 |
| Tenant and operational structure | organizations, tenants, departments, facilities, beds, wards | 10 |
| Clinical and FHIR | patients, encounters, conditions, observations, medications, procedures, notes | 28 |
| Scheduling and care coordination | appointments, slots, queues, care_team_assignments, transfers, tasks | 14 |
| Diagnostics and pharmacy | lab_orders, lab_results, imaging_orders, imaging_reports, prescriptions, inventory | 16 |
| Billing and insurance | invoices, payments, payer_profiles, pre_authorizations, nhif_claims, denials | 15 |
| Governance and compliance | audit_events, consents, incidents, approvals, signatures, retention_policies | 12 |
| Documents and integrations | documents, document_versions, integrations, webhook_deliveries, hl7_messages, fhir_resources | 10 |
| AI and analytics | embeddings, inference_runs, risk_signals, noelia_cases, model_feedback | 8 |

Total target: 123 tables.

---

## 6. Supabase Auth and RBAC design

### Authentication
- Use Supabase Auth with email/password, OTP, or SSO
- Enforce MFA for admin and clinical roles
- Store identity metadata in public.profiles

### Roles
Recommended roles:
- super_admin
- tenant_admin
- clinician
- nurse
- pharmacist
- lab_technician
- radiographer
- billing_officer
- auditor
- patient
- partner_integrator

### Access model
- Users belong to one or more organizations and tenants
- Permissions are evaluated at the organization and tenant levels
- A user may have role-based access plus explicit grants for special cases

---

## 7. RLS strategy

Every tenant-sensitive table should enforce:
- tenant isolation with tenant_id
- organization isolation with organization_id
- role-based access checks
- audit logging for write operations

### Recommended RLS pattern
- `tenant_id` is required on all patient, billing, clinical, and document tables
- Policies allow access only when the current user is a member of the same organization/tenant
- Admins can read across tenants only if explicitly granted
- Patients can access only their own records and authorized consents

---

## 8. Audit logging and compliance

### Audit event model
All mutations should write to an immutable audit stream:
- table_name
- record_id
- action (insert, update, delete)
- actor_id
- actor_role
- tenant_id
- organization_id
- old_values
- new_values
- ip_address
- occurred_at

### Compliance features
- tamper-evident audit trail
- retention policies by data category
- consent history and record of disclosures
- incident and corrective action workflows
- signed approvals for critical workflows

---

## 9. NHIF and national integration design

### Use cases
- eligibility checks
- pre-authorizations
- claim submission and reconciliation
- reimbursement tracking
- denial and follow-up workflows
- invoice to claim mapping

### Suggested tables
- nhif_payers
- nhif_benefit_packages
- nhif_claims
- nhif_claim_lines
- nhif_rejections
- nhif_payment_reconciliations
- insurance_policies
- payer_profiles

### Integration approach
- Edge Functions for outbound submissions
- Event-driven sync with retry queues
- Normalized internal claims model before outward submission

---

## 10. FHIR compatibility

Use a FHIR-like logical model while keeping the database normalized.

### Recommended FHIR-aligned resources
- Patient
- Encounter
- Observation
- Condition
- MedicationRequest
- MedicationDispense
- Procedure
- DiagnosticReport
- Immunization
- DocumentReference
- Encounter
- Organization
- Practitioner

### Implementation approach
- Keep a canonical internal schema and a FHIR resource mapping layer
- Store normalized data in SQL tables and expose FHIR JSON through views or edge functions
- Use terminology tables for SNOMED, LOINC, ICD-10, and local code mappings

---

## 11. Realtime and eventing

### Realtime channel categories
- appointments
- lab_results
- claims_status
- audit_stream
- patient_queue
- care_team_updates

### Recommended event types
- appointment.updated
- patient.consented
- laboratory.result.ready
- claim.submitted
- approval.requested
- audit.record.created

---

## 12. Secure document storage

### Storage buckets
- patient-documents
- consent-forms
- lab-reports
- imaging-studies
- legal-contracts
- finance-invoices

### Security rules
- Private by default
- Signed URL access only
- Scans for malware and virus detection in processing layer
- Metadata indexed in PostgreSQL for search and policy enforcement

---

## 13. AI-ready design for Noelia-style modules

The platform should expose clean, structured, and privacy-safe data for AI agents.

### AI-ready patterns
- Vector embeddings for notes, summaries, and documents
- Typed event streams for care journeys and reimbursement workflows
- Structured feature tables for risk scoring and anomaly detection
- Prompt and inference tables for auditability

### Suggested AI tables
- embeddings
- summarization_jobs
- risk_signals
- noelia_cases
- inference_runs
- prompt_templates
- model_feedback

---

## 14. Recommended Supabase setup

### Extensions
- uuid-ossp
- pgcrypto
- pgvector
- pg_net

### Storage buckets
- patient-documents
- consent-forms
- lab-reports
- imaging-studies
- contracts

### Edge Functions
- nhif-submit
- fhir-transform
- document-signing
- audit-stream
- notification-dispatch

### Monitoring
- Supabase logs
- custom audit dashboards
- alerting on failed integrations or policy violations

---

## 15. Suggested rollout phases

### Phase 1
- Tenant and organization model
- Auth and RBAC
- Patient, encounter, appointment, and document tables
- Basic audit logging

### Phase 2
- FHIR mapping layer
- Lab, pharmacy, imaging modules
- NHIF claim workflow
- Realtime channels

### Phase 3
- AI-ready embeddings and reasoning features
- Advanced analytics and anomaly detection
- Fully automated compliance reporting

---

## 16. Practical next step

The next step is to implement the shared foundation tables first:
- organizations
- tenants
- organization_members
- profiles
- roles
- permissions
- audit_events
- fhir_resources
- documents
- nhif_claims

That base will make the rest of the healthcare modules easier to add safely.
