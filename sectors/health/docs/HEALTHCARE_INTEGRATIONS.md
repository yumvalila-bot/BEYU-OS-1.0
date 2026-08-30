# BEYU Health OS - Healthcare Integrations Guide

## Overview

This guide describes how to integrate BEYU Health OS with national healthcare systems, payment providers, and third-party services commonly used in East African healthcare ecosystems.

---

## NHIF (National Health Insurance Fund) Integration

### Overview
NHIF is Tanzania's primary health insurance provider. The BEYU system provides bidirectional integration for pre-authorization, claims submission, and reimbursement tracking.

### API Endpoints
```
Production: https://api.nhif.or.tz
Staging: https://staging-api.nhif.or.tz
```

### Authentication
```
Protocol: OAuth2
Endpoint: /oauth/token
Grant Type: client_credentials
Scope: claims:submit, preauth:check
```

### 1. Pre-Authorization Check
```bash
POST /api/v1/preauth/check
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "patient_nhif_number": "TZ123456789",
  "facility_code": "FAC001",
  "service_type": "consultation",
  "estimated_cost": 50000
}

Response:
{
  "status": "approved",
  "authorization_number": "PRE-2024-001234",
  "valid_from": "2024-01-15",
  "valid_until": "2024-01-22",
  "coverage_limit": 500000,
  "remaining_coverage": 450000
}
```

### 2. Claim Submission
```bash
POST /api/v1/claims/submit
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "claim_reference": "CLM-2024-001234",
  "patient_nhif_number": "TZ123456789",
  "facility_code": "FAC001",
  "encounter_date": "2024-01-15",
  "service_type": "inpatient",
  "items": [
    {
      "description": "Hospitalization - 3 days",
      "quantity": 3,
      "unit_price": 50000,
      "total": 150000,
      "code": "HOSP-IP"
    },
    {
      "description": "Laboratory tests",
      "quantity": 1,
      "unit_price": 25000,
      "total": 25000,
      "code": "LAB-001"
    }
  ],
  "total_amount": 175000,
  "invoice_number": "INV-2024-001",
  "invoice_date": "2024-01-18"
}

Response:
{
  "status": "submitted",
  "claim_id": "CLM-2024-001234",
  "submission_date": "2024-01-18T14:30:00Z",
  "expected_processing_days": 14
}
```

### 3. Claim Status Tracking
```bash
GET /api/v1/claims/{claim_id}/status
Authorization: Bearer {access_token}

Response:
{
  "claim_id": "CLM-2024-001234",
  "status": "approved",
  "approved_amount": 175000,
  "rejected_items": [],
  "approval_date": "2024-01-25",
  "payment_reference": "PAY-2024-5678"
}
```

### Implementation in BEYU

**Service Location**: `src/modules/integrations/nhif/nhif.service.ts`

```typescript
@Injectable()
export class NhifService {
  async checkPreAuthorization(patientNhifNumber: string, estimatedCost: number) {
    // 1. Get access token
    const token = await this.getAccessToken();
    
    // 2. Call NHIF API
    const response = await this.httpClient.post('/preauth/check', {
      patient_nhif_number: patientNhifNumber,
      facility_code: this.configService.get('NHIF_FACILITY_CODE'),
      service_type: 'consultation',
      estimated_cost: estimatedCost
    }, { headers: { Authorization: `Bearer ${token}` } });
    
    // 3. Store authorization in database
    await this.preauthRepository.create({
      nhif_number: patientNhifNumber,
      authorization_number: response.authorization_number,
      coverage_limit: response.coverage_limit
    });
    
    return response;
  }

  async submitClaim(invoice: Invoice) {
    // 1. Prepare claim payload
    const claimPayload = this.transformInvoiceToClaim(invoice);
    
    // 2. Get access token
    const token = await this.getAccessToken();
    
    // 3. Submit to NHIF
    const response = await this.httpClient.post('/claims/submit', claimPayload, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    // 4. Log submission
    await this.auditService.log({
      event: 'nhif_claim_submitted',
      invoice_id: invoice.id,
      claim_id: response.claim_id,
      amount: invoice.total_amount
    });
    
    return response;
  }
}
```

---

## DHIS2 Integration

### Overview
DHIS2 (District Health Information System 2) is used by Tanzania's Ministry of Health for disease surveillance, healthcare facility data, and public health reporting.

### API Endpoints
```
Base URL: https://dhis2.health.go.tz/api/
Authentication: Basic Auth (username:password)
Version: 2.40+
```

### 1. Report Disease Cases

```bash
POST /dataValueSets
Authorization: Basic {base64(username:password)}
Content-Type: application/json

{
  "dataSet": "lyLU2wnjkCt",
  "completeDate": "2024-01-15",
  "period": "202401",
  "orgUnit": "ImspD7YgkBr",
  "dataValues": [
    {
      "dataElement": "f7n9E6aBiQo",
      "categoryOptionCombo": "kJq2demyMnY",
      "value": "5"
    },
    {
      "dataElement": "Ix2HsbDMLea",
      "categoryOptionCombo": "kJq2demyMnY",
      "value": "2"
    }
  ]
}
```

### 2. Query Analytics

```bash
GET /analytics?dimension=dx:Ix2HsbDMLea&dimension=pe:2024&dimension=ou:ImspD7YgkBr&outputIdScheme=CODE

Response:
{
  "metaData": {
    "dimensions": {
      "dx": ["Malaria Cases"],
      "pe": ["2024"],
      "ou": ["Dar es Salaam"]
    }
  },
  "rows": [
    ["Malaria Cases", "2024", "Dar es Salaam", "1250"]
  ]
}
```

### Implementation in BEYU

```typescript
@Injectable()
export class Dhis2Service {
  async reportDiseaseCases(cases: DiseaseCase[]) {
    const dataValues = cases.map(c => ({
      dataElement: this.mapIcdToDhis2Element(c.icd10_code),
      categoryOptionCombo: 'kJq2demyMnY',
      value: c.count.toString()
    }));

    const payload = {
      dataSet: this.configService.get('DHIS2_DISEASE_DATASET_ID'),
      period: this.getPeriod(),
      orgUnit: this.configService.get('DHIS2_ORG_UNIT_ID'),
      completeDate: new Date().toISOString(),
      dataValues
    };

    const response = await this.httpClient.post('/dataValueSets', payload, {
      auth: {
        username: this.configService.get('DHIS2_USERNAME'),
        password: this.configService.get('DHIS2_PASSWORD')
      }
    });

    return response;
  }

  async queryAnalytics(indicator: string, period: string, orgUnit: string) {
    const response = await this.httpClient.get('/analytics', {
      params: {
        dimension: [`dx:${indicator}`, `pe:${period}`, `ou:${orgUnit}`],
        outputIdScheme: 'CODE'
      },
      auth: { /* ... */ }
    });

    return response.data.rows;
  }
}
```

---

## Payment Gateway Integration

### M-Pesa (Safaricom)

```typescript
@Injectable()
export class MpesaService {
  async initiatePayment(phone: string, amount: number, reference: string) {
    const payload = {
      BusinessShortCode: this.configService.get('MPESA_SHORTCODE'),
      Password: this.generatePassword(),
      Timestamp: this.getTimestamp(),
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: this.configService.get('MPESA_SHORTCODE'),
      PhoneNumber: phone,
      CallBackURL: `${this.configService.get('BASE_URL')}/integrations/mpesa/callback`,
      AccountReference: reference,
      TransactionDesc: 'Hospital Payment'
    };

    const response = await this.httpClient.post(
      'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      payload,
      { headers: { Authorization: `Bearer ${await this.getAccessToken()}` } }
    );

    // Store in database for tracking
    await this.paymentRepository.create({
      phone,
      amount,
      reference,
      mpesa_request_id: response.CheckoutRequestID,
      status: 'pending'
    });

    return response;
  }

  @Post('callback')
  async handleMpesaCallback(@Body() payload: any) {
    // Process M-Pesa callback
    if (payload.Result.ResultCode === 0) {
      // Payment successful
      await this.paymentRepository.update(payload.Result.ReceiptNumber, {
        status: 'completed',
        completion_date: new Date()
      });
      
      // Trigger invoice payment completion
      await this.billingService.markInvoiceAsPaid(payload.Result.ReceiptNumber);
    }
  }
}
```

### Airtel Money

```typescript
// Similar implementation to M-Pesa
// With Airtel-specific parameters
```

### Tigo Pesa

```typescript
// Similar implementation
// With Tigo-specific parameters
```

---

## National ID Integration

### NIDA (Tanzanian National ID)

```typescript
@Injectable()
export class NidaService {
  async verifyIdentity(nationalId: string, fullName: string) {
    // Call NIDA verification API
    const response = await this.httpClient.post(
      'https://api.nida.go.tz/identity/verify',
      {
        national_id: nationalId,
        full_name: fullName
      },
      { headers: { Authorization: `Bearer ${this.getNidaToken()}` } }
    );

    return {
      verified: response.status === 'verified',
      recorded_name: response.full_name,
      date_of_birth: response.date_of_birth,
      sex: response.sex,
      nationality: response.nationality
    };
  }
}
```

### RITA (Rwanda ID)

```typescript
// Similar implementation for Rwanda
```

---

## SMS/Email Notification Integration

### Twilio (SMS)

```typescript
@Injectable()
export class SmsService {
  private twilio = require('twilio')(
    this.configService.get('TWILIO_ACCOUNT_SID'),
    this.configService.get('TWILIO_AUTH_TOKEN')
  );

  async sendAppointmentReminder(phone: string, patientName: string, appointmentDate: string) {
    const message = `Hello ${patientName}, you have an appointment on ${appointmentDate}. Reply CONFIRM to confirm.`;
    
    const response = await this.twilio.messages.create({
      body: message,
      from: this.configService.get('TWILIO_PHONE_NUMBER'),
      to: phone
    });

    // Log in database
    await this.notificationRepository.create({
      phone,
      message_type: 'appointment_reminder',
      status: 'sent',
      sent_at: new Date(),
      external_message_id: response.sid
    });
  }
}
```

### SendGrid (Email)

```typescript
@Injectable()
export class EmailService {
  private sendgrid = require('@sendgrid/mail');

  constructor(private configService: ConfigService) {
    this.sendgrid.setApiKey(this.configService.get('SENDGRID_API_KEY'));
  }

  async sendDischargeNotes(email: string, patientName: string, discharge Pdf: Buffer) {
    const msg = {
      to: email,
      from: 'noreply@beyuhealth.com',
      subject: 'Your Discharge Summary',
      html: `<p>Dear ${patientName},</p><p>Please find your discharge summary attached.</p>`,
      attachments: [{
        content: discharge_pdf.toString('base64'),
        filename: 'discharge_summary.pdf',
        type: 'application/pdf',
        disposition: 'attachment'
      }]
    };

    const response = await this.sendgrid.send(msg);
    return response;
  }
}
```

---

## Custom Integration Framework

For integrating custom third-party systems:

```typescript
@Injectable()
export class CustomIntegrationService {
  async executeIntegration(
    integrationName: string,
    operation: string,
    payload: any
  ) {
    // 1. Get integration config
    const config = await this.integrationConfigRepository.findOne(integrationName);
    
    // 2. Validate authorization
    this.validateIntegrationToken(config);
    
    // 3. Execute operation
    const response = await this.httpClient.post(config.endpoint, payload, {
      headers: this.buildHeaders(config, operation)
    });
    
    // 4. Log event
    await this.auditService.log({
      event: 'integration_call',
      integration: integrationName,
      operation,
      status: response.status
    });
    
    // 5. Handle response
    return this.parseResponse(response, integrationName);
  }
}
```

---

## Testing Integrations

```bash
# Test NHIF API
npm run test:integration -- nhif

# Test payment gateway
npm run test:integration -- mpesa

# Test all integrations
npm run test:integration
```

---

## Monitoring and Alerts

### Real-time Monitoring
- Integration API response times
- Error rates by integration
- Failed submissions queue
- Payment reconciliation

### Alerts
- Integration timeout (> 30 seconds)
- High error rate (> 5% failures)
- Claim rejection rate > 10%
- Reconciliation discrepancies

---

## Next Steps

1. Configure integration credentials in `.env`
2. Run integration tests
3. Deploy to staging environment
4. Test end-to-end workflows
5. Monitor integration health
6. Deploy to production

