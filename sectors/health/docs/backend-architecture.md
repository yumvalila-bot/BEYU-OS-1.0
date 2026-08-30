# BEYU Health OS Enterprise Backend Architecture

## Overview

This document defines the enterprise-grade backend architecture for BEYU Health OS, designed to support national healthcare systems while maintaining complete backward compatibility with existing frontend functionality.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Vite Frontend                         │
│         (Existing UI + New Dashboard Components)                │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Gateway & Load Balancing                 │
│              (Kong / AWS ALB / NGINX)                           │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   REST APIs    GraphQL APIs   Real-time APIs
   (OpenAPI)    (Apollo)       (WebSocket)
        │             │             │
        └─────────────┼─────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                  NestJS Microservices                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Core Services Layer                                      │  │
│  │ ┌──────────┬──────────┬──────────┬──────────┬──────────┐ │  │
│  │ │Auth      │Patient   │Clinical  │Lab       │Pharmacy  │ │  │
│  │ │Service   │Service   │Service   │Service   │Service   │ │  │
│  │ └──────────┴──────────┴──────────┴──────────┴──────────┘ │  │
│  │ ┌──────────┬──────────┬──────────┬──────────┬──────────┐ │  │
│  │ │Billing   │HR        │Inventory │Radiology │Finance   │ │  │
│  │ │Service   │Service   │Service   │Service   │Service   │ │  │
│  │ └──────────┴──────────┴──────────┴──────────┴──────────┘ │  │
│  │                                                          │  │
│  │ ┌──────────────────────────────────────────────────────┐ │  │
│  │ │ Cross-cutting Services                               │ │  │
│  │ │ Audit · Notification · Search · Cache · Queue       │ │  │
│  │ └──────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│           Data Access Layer (Repositories)                      │
│  Entity-based repository pattern with caching                   │
└─────────────────────┬───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│    PostgreSQL/Supabase Enterprise Database                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Schemas: core · clinical · diagnostic · operational ·    │  │
│  │ financial · hr · compliance · ai · integration           │  │
│  │                                                           │  │
│  │ Features: RLS · Audit triggers · FHIR views ·           │  │
│  │ Full-text search · Vector search · Materialized views   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
beyu-backend/
├── src/
│   ├── main.ts                          # Application entry point
│   ├── app.module.ts                    # Root module
│   │
│   ├── config/                          # Configuration
│   │   ├── database.config.ts
│   │   ├── supabase.config.ts
│   │   ├── auth.config.ts
│   │   ├── cache.config.ts
│   │   └── integrations.config.ts
│   │
│   ├── common/                          # Shared utilities
│   │   ├── decorators/
│   │   ├── filters/                     # Exception handlers
│   │   ├── guards/                      # Auth guards, RBAC guards
│   │   ├── interceptors/                # Logging, caching, transformation
│   │   ├── middleware/                  # Request/response middleware
│   │   ├── pipes/                       # Validation pipes
│   │   ├── utils/                       # Helper functions
│   │   └── constants/
│   │
│   ├── modules/
│   │   ├── auth/                        # Authentication & Authorization
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.module.ts
│   │   │   ├── strategies/              # JWT, OAuth, etc.
│   │   │   └── dto/
│   │   │
│   │   ├── identity/                    # Identity Management
│   │   │   ├── users/
│   │   │   ├── profiles/
│   │   │   ├── roles/
│   │   │   ├── permissions/
│   │   │   └── organization-members/
│   │   │
│   │   ├── tenants/                     # Tenant Management
│   │   │   ├── tenants.controller.ts
│   │   │   ├── tenants.service.ts
│   │   │   ├── tenants.module.ts
│   │   │   └── dto/
│   │   │
│   │   ├── patients/                    # Patient Service
│   │   │   ├── patients.controller.ts
│   │   │   ├── patients.service.ts
│   │   │   ├── patients.module.ts
│   │   │   ├── dto/
│   │   │   ├── entities/
│   │   │   └── repositories/
│   │   │
│   │   ├── clinical/                    # Clinical Service
│   │   │   ├── encounters/
│   │   │   ├── diagnoses/
│   │   │   ├── procedures/
│   │   │   ├── vital-signs/
│   │   │   ├── clinical-notes/
│   │   │   └── clinical.module.ts
│   │   │
│   │   ├── laboratory/                  # Lab Service
│   │   │   ├── orders/
│   │   │   ├── results/
│   │   │   ├── specimens/
│   │   │   └── lab.module.ts
│   │   │
│   │   ├── pharmacy/                    # Pharmacy Service
│   │   │   ├── prescriptions/
│   │   │   ├── dispensing/
│   │   │   ├── inventory/
│   │   │   └── pharmacy.module.ts
│   │   │
│   │   ├── radiology/                   # Radiology Service
│   │   │   ├── orders/
│   │   │   ├── reports/
│   │   │   └── radiology.module.ts
│   │   │
│   │   ├── billing/                     # Billing Service
│   │   │   ├── invoices/
│   │   │   ├── payments/
│   │   │   ├── claims/
│   │   │   └── billing.module.ts
│   │   │
│   │   ├── appointments/                # Appointment Service
│   │   │   ├── appointments.controller.ts
│   │   │   ├── appointments.service.ts
│   │   │   └── appointments.module.ts
│   │   │
│   │   ├── hr/                          # HR Service
│   │   │   ├── employees/
│   │   │   ├── attendance/
│   │   │   ├── payroll/
│   │   │   └── hr.module.ts
│   │   │
│   │   ├── inventory/                   # Inventory Service
│   │   │   ├── items/
│   │   │   ├── stock/
│   │   │   ├── transfers/
│   │   │   └── inventory.module.ts
│   │   │
│   │   ├── finance/                     # Finance Service
│   │   │   ├── general-ledger/
│   │   │   ├── budgets/
│   │   │   ├── cost-centers/
│   │   │   └── finance.module.ts
│   │   │
│   │   ├── notifications/               # Notification Service
│   │   │   ├── email/
│   │   │   ├── sms/
│   │   │   ├── push/
│   │   │   └── notifications.module.ts
│   │   │
│   │   ├── audit/                       # Audit & Compliance
│   │   │   ├── audit-logs.controller.ts
│   │   │   ├── audit-logs.service.ts
│   │   │   └── audit.module.ts
│   │   │
│   │   ├── fhir/                        # FHIR Interoperability
│   │   │   ├── fhir.service.ts
│   │   │   ├── transformers/            # Resource transformers
│   │   │   ├── validators/
│   │   │   └── fhir.module.ts
│   │   │
│   │   ├── integrations/                # External Integrations
│   │   │   ├── nhif/
│   │   │   ├── dhis2/
│   │   │   ├── payment-gateways/
│   │   │   └── integrations.module.ts
│   │   │
│   │   ├── ai/                          # AI Service
│   │   │   ├── ai.service.ts
│   │   │   ├── embeddings/
│   │   │   ├── noelia/
│   │   │   ├── rag/
│   │   │   └── ai.module.ts
│   │   │
│   │   ├── search/                      # Full-Text & Vector Search
│   │   │   ├── search.service.ts
│   │   │   └── search.module.ts
│   │   │
│   │   ├── cache/                       # Caching Layer
│   │   │   ├── cache.service.ts
│   │   │   └── cache.module.ts
│   │   │
│   │   ├── queue/                       # Background Jobs
│   │   │   ├── queue.service.ts
│   │   │   └── queue.module.ts
│   │   │
│   │   ├── health/                      # Health Checks
│   │   │   └── health.module.ts
│   │   │
│   │   └── reporting/                   # Reporting
│   │       ├── dashboards/
│   │       ├── reports/
│   │       └── reporting.module.ts
│   │
│   ├── database/                        # Database Layer
│   │   ├── migrations/                  # DB migrations
│   │   ├── seeds/                       # Seed data
│   │   ├── entities/                    # TypeORM/Prisma entities
│   │   └── services/
│   │
│   ├── graphql/                         # GraphQL Setup
│   │   ├── schema.gql
│   │   ├── resolvers/
│   │   └── types/
│   │
│   └── events/                          # Event Bus
│       ├── events.module.ts
│       └── handlers/
│
├── test/
│   ├── unit/                            # Unit tests
│   ├── integration/                     # Integration tests
│   ├── e2e/                             # End-to-end tests
│   └── performance/                     # Load tests
│
├── docs/
│   ├── architecture.md                  # This file
│   ├── api-documentation.md
│   ├── database-schema.md
│   ├── deployment.md
│   └── security.md
│
├── .docker/
│   ├── Dockerfile
│   ├── Dockerfile.prod
│   └── docker-compose.yml
│
├── .github/
│   ├── workflows/
│   │   ├── test.yml
│   │   ├── build.yml
│   │   └── deploy.yml
│   └── CODEOWNERS
│
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── nest-cli.json
├── tsconfig.json
├── package.json
└── README.md
```

---

## Core Principles

### 1. Multi-Tenancy
- Every business table includes `tenant_id`, `organization_id`, `facility_id`
- Row-level security enforces tenant isolation
- Shared infrastructure, completely isolated data
- Audit trail for all cross-tenant access

### 2. RBAC & Authorization
- Role-based access control (RBAC) at table level
- Attribute-based access control (ABAC) for complex rules
- Permission matrix defining resource + action combinations
- Audit events for all authorization decisions

### 3. Audit Trail
- All mutations logged to immutable audit table
- Change history preserved
- Actor identification (user, system, integration)
- Timestamp precision (microseconds)
- Compliance-ready for HIPAA, GDPR, PDPA, local regulations

### 4. Data Integrity
- Foreign key constraints
- Referential integrity across tenant boundaries
- Soft deletes (logical deletion with `deleted_at`)
- Versioning for critical entities
- Concurrent update handling

### 5. Performance
- Strategic indexing for common queries
- Connection pooling
- Redis caching layer
- Query result caching
- Materialized views for dashboards
- Partition strategy for large tables (time-based, hash-based)

### 6. Security
- All communications over TLS 1.3
- JWT with short expiry + refresh tokens
- MFA for administrative users
- Encryption at rest for PII
- Field-level encryption for sensitive data
- Secret rotation policies

---

## API Design

### REST API
- RESTful endpoints following RFC 7231
- Versioning through URL path (`/api/v1/`, `/api/v2/`)
- Pagination: cursor-based and offset-based
- Filtering through query parameters
- Sorting with direction support
- OpenAPI 3.1 documentation
- Rate limiting per API key or user

### GraphQL API
- Apollo Server setup
- Schema-first design
- Data loader for N+1 query prevention
- Subscription support for real-time updates
- Field-level permissions
- Complexity analysis for query protection

### WebSocket API
- Real-time channels for clinical updates
- Appointment notifications
- Lab result alerts
- Billing updates
- Audit event streaming

---

## Database Design

### Schema Organization
```sql
-- Core: Organizations, tenants, facilities, departments, roles
-- Clinical: Patients, encounters, diagnoses, procedures, notes
-- Diagnostic: Lab orders, results; Radiology orders, reports
-- Operational: Appointments, schedules, queues, transfers
-- Financial: Invoices, payments, claims, ledger entries
-- HR: Employees, attendance, payroll
-- Inventory: Items, stock, transfers, audits
-- AI: Embeddings, vectors, inference logs
-- Compliance: Audit events, consents, incident reports
-- Integration: FHIR resources, HL7 messages, external records
```

### Table Naming Conventions
- Singular names: `patient`, `encounter`, `lab_order`
- Prefixed by domain: `clinical_note`, `lab_specimen`, `invoice_line`
- Consistent snake_case throughout
- Foreign keys: `{table_singular}_id`

### Column Standards
- Primary key: `id` (UUID v4)
- Timestamps: `created_at`, `updated_at` (UTC, microseconds)
- Soft deletes: `deleted_at`
- Tenant data: `tenant_id`, `organization_id`, `facility_id`
- Audit: `created_by`, `updated_by`, `version`

---

## Service Layer Architecture

### Repository Pattern
```typescript
// Example: PatientRepository
interface IPatientRepository {
  findById(id: string, tenantId: string): Promise<Patient>;
  findByMrn(mrn: string, tenantId: string): Promise<Patient | null>;
  create(data: CreatePatientDto, tenantId: string): Promise<Patient>;
  update(id: string, data: UpdatePatientDto, tenantId: string): Promise<Patient>;
  delete(id: string, tenantId: string): Promise<void>;
  findPaginated(filter: QueryFilter, tenantId: string): Promise<PaginatedResult<Patient>>;
}
```

### Service Layer
```typescript
// PatientService orchestrates business logic
// Uses repositories for data access
// Validates inputs using DTOs
// Publishes domain events
// Enforces RBAC authorization
// Logs audit trail
```

### DTO Validation
```typescript
// Input DTOs for request validation
// Output DTOs for response transformation
// Automatic validation using class-validator
// Sanitization using class-sanitizer
// Custom validators for healthcare-specific rules
```

---

## Healthcare Standards Implementation

### FHIR R4/R5 Support
- Transformer layer: Internal DB ↔ FHIR Resources
- FHIR Validator: Ensure compliance with profiles
- FHIR Search: Searchset Bundle responses
- FHIR Operations: Custom operations via /$operation
- FHIR Subscription: Real-time change notifications

### HL7 v2 Support
- HL7 parser for legacy integration
- Message mapping to internal domain
- ADT (Admission, Discharge, Transfer) message support

### Terminology Support
- SNOMED CT for clinical concepts
- ICD-10/ICD-11 for diagnoses
- LOINC for lab tests
- RxNorm for medications
- ATC for drug classifications
- Local custom codes with mapping

---

## Integration Architecture

### External Systems
1. **NHIF** (National Health Insurance Fund)
   - Pre-authorization service
   - Claim submission
   - Reimbursement tracking

2. **DHIS2** (District Health Information System)
   - Disease surveillance reporting
   - Healthcare facility data

3. **Payment Gateways**
   - M-Pesa, Airtel Money, Tigo Pesa
   - Bank transfers
   - Wallet system

4. **National ID Systems**
   - NIDA, RITA verification
   - Patient identity reconciliation

5. **Communication**
   - Email (SendGrid, AWS SES)
   - SMS (Twilio, African Messaging)
   - WhatsApp (Twilio, Interakt)

### Integration Pattern
```
External System → Webhook Handler → Event Bus → Domain Service
                      ↓
                  Log Entry
                      ↓
                  Retry Queue (if failed)
```

---

## AI & Machine Learning

### Noelia Integration
- Clinical decision support
- Medical coding assistance
- Documentation generation
- Risk prediction models
- Anomaly detection (insurance fraud, clinical outliers)

### RAG (Retrieval-Augmented Generation)
- Medical literature knowledge base
- Clinical guidelines and protocols
- Vector search using pgvector
- Embeddings for patient notes, reports

### AI Service Components
- Prompt management
- Inference logging (audit trail)
- Model feedback loop
- Cost tracking

---

## DevOps & Infrastructure

### Docker & Kubernetes
- Containerized services
- Helm charts for K8s deployment
- StatefulSets for databases
- HPA for auto-scaling
- Network policies for security

### CI/CD Pipeline
- GitHub Actions workflows
- Automated testing on every PR
- Build and push to container registry
- Blue-green deployment
- Canary rollouts for production

### Monitoring & Observability
- Prometheus for metrics
- Grafana for visualization
- Loki for log aggregation
- Jaeger for distributed tracing
- Alert rules for SLA compliance

### Secrets Management
- HashiCorp Vault
- Environment-based configuration
- Key rotation automation
- Audit trail for secret access

---

## Performance & Scalability

### Caching Strategy
- Redis for session storage
- Distributed cache for reference data
- Cache invalidation on updates
- TTL-based expiration

### Database Optimization
- Indexes on foreign keys and commonly filtered columns
- Partitioning for time-series data
- Query result caching
- Read replicas for reporting
- Connection pooling (PgBouncer)

### Async Processing
- Background job queue (Bull/BullMQ, Kafka)
- Bulk operations through workers
- Notification dispatch
- Report generation
- Integration sync

---

## Security Model

### Authentication
- Supabase Auth with JWT
- Magic links for passwordless auth
- OAuth2 for third-party integrations
- MFA (TOTP, SMS) for sensitive roles

### Authorization
- JWT claims mapping to roles
- Per-endpoint RBAC guards
- Data-level RLS policies
- Field-level encryption for PII

### Data Protection
- AES-256-GCM encryption at rest
- TLS 1.3 for all communications
- Database encryption keys in Vault
- Secure key exchange protocols

### Compliance
- HIPAA compliance (US healthcare)
- GDPR compliance (EU data protection)
- PDPA compliance (Thailand)
- Local regulations (Tanzania PCCB, Kenya standards)

---

## Testing Strategy

### Unit Tests
- Service layer logic
- DTO validation
- Utility functions
- Transformer logic

### Integration Tests
- Database interactions
- RLS policy enforcement
- Multi-tenant isolation
- FHIR transformation

### API Tests
- REST endpoint contracts
- GraphQL query execution
- Error handling
- Authentication & authorization

### E2E Tests
- Full user workflows
- Multi-step business processes
- Real database
- External integration mocks

### Performance Tests
- Load testing (k6, Apache JMeter)
- Stress testing (chaos engineering)
- Query optimization profiling
- Cache hit rates

---

## Deployment

### Environments
- **Development**: Local Docker Compose
- **Staging**: Cloud staging with production-like data
- **Production**: Multi-region deployment with failover

### Database Migrations
- Flyway or TypeORM migrations
- Zero-downtime migrations
- Rollback capability
- Backup before each migration

### Blue-Green Deployment
- Two production environments
- Switch traffic after validation
- Instant rollback capability
- Health checks before switch

---

## Documentation

### Generated Documentation
- OpenAPI/Swagger from code annotations
- GraphQL schema introspection
- Database ERD from schema
- Postman collection export

### Manual Documentation
- Architecture decision records (ADRs)
- Deployment runbooks
- Incident response procedures
- Developer setup guide
- API usage examples

---

## Backward Compatibility

### Existing Frontend Support
- All existing REST endpoints preserved
- New services alongside existing code
- Gradual migration to new architecture
- Feature flags for experimental features
- API versioning for breaking changes

### Data Migration
- Existing patient/appointment/user data preserved
- Gradual normalization to enterprise schema
- Shadow writes to new tables during transition
- Dual-write period for consistency

---

## Success Metrics

- **Availability**: 99.95% uptime
- **Latency**: P95 < 200ms for patient queries
- **Throughput**: 10,000+ concurrent users
- **Data Freshness**: < 100ms for real-time features
- **Security**: Zero critical vulnerabilities
- **Audit**: 100% of mutations logged
- **Scalability**: Horizontal scaling capability

---

## Next Steps

1. Set up NestJS project scaffold
2. Implement authentication service
3. Create patient service with CRUD + FHIR support
4. Implement multi-tenant RLS policies
5. Create audit logging system
6. Add NHIF integration
7. Build analytics and reporting layer
8. Deploy to Kubernetes with monitoring

