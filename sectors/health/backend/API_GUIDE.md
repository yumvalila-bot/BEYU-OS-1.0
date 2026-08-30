# BEYU Health OS - Enterprise Backend API Guide

## Overview

The BEYU Health OS backend is a production-ready NestJS application designed to support enterprise healthcare operations across multiple organizations, tenants, and facilities. The backend provides comprehensive APIs for patient management, clinical operations, billing, laboratory services, and more.

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (optional)

### Installation

#### 1. Using Docker Compose (Recommended)
```bash
cd backend
docker-compose up -d
```

The application will be available at `http://localhost:3000`

#### 2. Manual Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run start:dev
```

### First Steps

1. **Health Check**: Verify the API is running
   ```bash
   curl http://localhost:3000/health
   ```

2. **API Documentation**: Open the Swagger UI
   ```
   http://localhost:3000/api/docs
   ```

3. **Register a User**:
   ```bash
   curl -X POST http://localhost:3000/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "doctor@hospital.com",
       "password": "SecurePassword123!",
       "full_name": "Dr. John Doe"
     }'
   ```

4. **Login**:
   ```bash
   curl -X POST http://localhost:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "doctor@hospital.com",
       "password": "SecurePassword123!"
     }'
   ```

---

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login with credentials
- `POST /auth/refresh` - Refresh access token
- `GET /auth/me` - Get current user profile
- `POST /auth/logout` - Logout

### Patients
- `GET /patients` - List patients (paginated)
- `GET /patients/:id` - Get patient details
- `POST /patients` - Create new patient
- `PUT /patients/:id` - Update patient
- `DELETE /patients/:id` - Delete patient
- `GET /patients/:id/encounters` - Get patient encounters
- `GET /patients/:id/appointments` - Get patient appointments

### Clinical
- `GET /clinical/encounters` - List encounters
- `POST /clinical/encounters` - Create encounter
- `GET /clinical/encounters/:id` - Get encounter details
- `POST /clinical/encounters/:id/notes` - Add clinical note
- `GET /clinical/diagnoses` - List diagnoses

### Appointments
- `GET /appointments` - List appointments
- `POST /appointments` - Create appointment
- `PUT /appointments/:id` - Update appointment
- `DELETE /appointments/:id` - Cancel appointment

### Laboratory
- `GET /lab/orders` - List lab orders
- `POST /lab/orders` - Create lab order
- `GET /lab/results/:id` - Get lab results

### Billing
- `GET /billing/invoices` - List invoices
- `POST /billing/invoices` - Create invoice
- `GET /billing/payments` - List payments

### Health Checks
- `GET /health` - Basic health check
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

---

## Authentication

The API uses JWT (JSON Web Tokens) for authentication.

### Obtaining a Token
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Using the Token
Include the token in the Authorization header:
```bash
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Refreshing a Token
```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'
```

---

## Pagination and Filtering

### Pagination
```bash
GET /patients?page=1&limit=20&sort=created_at&order=desc
```

Query parameters:
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `sort` - Sort field
- `order` - Sort order: `asc` or `desc`

### Filtering
```bash
GET /patients?status=active&facility_id=uuid
```

Common filters by endpoint:
- `status` - Active, inactive, deleted
- `facility_id` - Facility UUID
- `department_id` - Department UUID
- `date_from` - Start date (ISO 8601)
- `date_to` - End date (ISO 8601)

---

## Error Handling

### Error Response Format
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "BadRequestException",
  "details": [
    {
      "field": "email",
      "message": "email must be an email"
    }
  ]
}
```

### Common Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad request (validation error)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `409` - Conflict (duplicate, etc.)
- `422` - Unprocessable entity
- `500` - Internal server error

---

## Rate Limiting

API requests are rate-limited to prevent abuse:
- **Standard endpoints**: 100 requests per 15 minutes
- **Authentication endpoints**: 5 attempts per minute
- **File uploads**: 10 uploads per minute

Rate limit information is included in response headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

---

## Multi-Tenancy

The API is designed for multi-tenant deployments. When creating resources, always include the tenant context:

```bash
POST /patients \
  -H "Authorization: Bearer token" \
  -H "X-Tenant-ID: tenant-uuid" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "John Doe",
    "date_of_birth": "1990-01-01",
    "mrn": "MRN-001"
  }'
```

The system enforces complete data isolation between tenants using Row-Level Security (RLS) policies.

---

## FHIR Support

The API includes FHIR R4 support for healthcare data exchange:

### FHIR Endpoints
- `GET /fhir/Patient/:id` - Get patient as FHIR resource
- `GET /fhir/Encounter/:id` - Get encounter as FHIR resource
- `GET /fhir/Observation/:id` - Get observation as FHIR resource
- `GET /fhir/Medication/:id` - Get medication as FHIR resource

### Example FHIR Response
```json
{
  "resourceType": "Patient",
  "id": "uuid",
  "identifier": [
    {
      "type": { "coding": [{ "code": "MR" }] },
      "value": "MRN-001"
    }
  ],
  "name": [{ "given": ["John"], "family": "Doe" }],
  "birthDate": "1990-01-01",
  "telecom": [{ "system": "email", "value": "john@example.com" }]
}
```

---

## Audit and Compliance

All data mutations are automatically logged for audit trail and compliance purposes.

### Access Audit Logs
```bash
GET /audit/events?resource_type=patient&action=update&days=30
```

Response includes:
- User/actor who made the change
- Timestamp
- Old and new values
- IP address
- User agent

---

## WebSocket Subscriptions (Real-time)

Subscribe to real-time updates:

```javascript
const socket = new WebSocket('ws://localhost:3000/ws');

socket.onopen = () => {
  socket.send(JSON.stringify({
    type: 'subscribe',
    channel: 'appointments',
    token: 'jwt-token'
  }));
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Appointment updated:', data);
};
```

Available channels:
- `appointments` - Appointment changes
- `lab_results` - Lab result ready
- `claims_status` - Insurance claim updates
- `patient_queue` - Patient queue changes
- `audit_stream` - Real-time audit events

---

## Integration with Third-Party Systems

### NHIF Integration
```bash
POST /integrations/nhif/submit-claim \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "invoice_id": "uuid",
    "patient_nhif_number": "number",
    "total_amount": 5000
  }'
```

### SMS/Email Notifications
```bash
POST /notifications/send \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "sms|email",
    "recipient": "phone|email",
    "subject": "Appointment Reminder",
    "template": "appointment_reminder",
    "variables": { "patient_name": "John" }
  }'
```

---

## GraphQL API

The backend also provides a GraphQL API for flexible queries:

```graphql
query {
  patients(limit: 10, filter: { status: "active" }) {
    edges {
      node {
        id
        fullName
        mrn
        encounters {
          id
          date
          type
        }
      }
    }
  }
}
```

Access at: `http://localhost:3000/graphql`

---

## Performance Tips

1. **Use Pagination**: Always paginate large result sets
   ```bash
   GET /patients?limit=50&page=1
   ```

2. **Selective Field Loading**: Only request needed fields in GraphQL
   ```graphql
   query {
     patient(id: "uuid") {
       id
       fullName
     }
   }
   ```

3. **Batch Operations**: Use batch endpoints when available
   ```bash
   POST /patients/batch-update
   ```

4. **Caching**: Enable response caching for read-heavy queries
   - Add `Cache-Control: public, max-age=3600` to cacheable endpoints

---

## Troubleshooting

### Common Issues

**"Unauthorized" response**
- Ensure token is included: `Authorization: Bearer token`
- Check if token has expired (max 24 hours)
- Use refresh endpoint to get new token

**"Forbidden" response**
- Check user role permissions
- Verify tenant access
- Contact administrator for permission grant

**"Bad Request" response**
- Validate request body format
- Check for required fields
- Review error details in response

**Slow Queries**
- Check if indexes exist
- Review page size (reduce if > 100)
- Consider using GraphQL with selective fields

### Debug Mode
Enable debug logging:
```bash
LOG_LEVEL=debug npm run start:dev
```

---

## Deployment

### Kubernetes
```bash
kubectl apply -f k8s/backend-deployment.yaml
```

### Docker Swarm
```bash
docker service create --name beyu-backend beyu-backend:latest
```

### AWS ECS
Configure task definition in `ecs-task-definition.json` and deploy via AWS CLI

---

## Support and Resources

- API Documentation: http://localhost:3000/api/docs
- GitHub Issues: Create issue on project repository
- Community Forum: [forum link]
- Email Support: support@beyuhealth.com

---

## Next Steps

1. Review the database schema documentation
2. Explore the Swagger API documentation
3. Set up authentication with your identity provider
4. Configure third-party integrations (NHIF, payment gateways, etc.)
5. Deploy to your infrastructure
