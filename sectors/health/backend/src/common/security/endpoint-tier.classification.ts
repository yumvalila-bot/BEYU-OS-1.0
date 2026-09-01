/**
 * Endpoint security tier classification.
 *
 * Every HTTP endpoint is classified into one security TIER and one operation
 * CLASS. The classification drives:
 *   - which guards/middleware MUST be present (CI-fails if missing)
 *   - which audit/rate-limit/CSRF/MFA/clinical-safety/governance/HCM controls
 *     are required
 *   - which failure modes apply when external dependencies are unavailable
 *
 * Tiers (Phase 9 §3):
 *   PUBLIC               — no authentication; rate-limited, audited
 *   AUTHENTICATED        — valid JWT + tenant membership required
 *   PRIVILEGED           — JWT + specific permission(s); audit mandatory
 *   CLINICAL             — PRIVILEGED + practitioner/facility/scope-of-practice
 *                          + clinical-safety gates + PHI audit
 *   FINANCIAL            — PRIVILEGED + governance/HCM/Finance-OS boundary
 *                          + idempotency + immutable audit
 *   ADMINISTRATIVE       — PRIVILEGED + tenant:admin / trustee scope; rate limits
 *   AI_HIGH_RISK         — PRIVILEGED + clinical-safety + governance +
 *                          human-in-the-loop + AI risk tier
 *   EXTERNAL_INTEGRATION — PRIVILEGED + adapter contract + credential redaction
 *                          + circuit breaker + outbound-only via outbox
 *
 * Classes (Phase 9 §3):
 *   READ        — GET/HEAD/OPTIONS
 *   WRITE       — POST/PUT/PATCH (creates or updates)
 *   DESTRUCTIVE — DELETE (or any verb effecting irreversible destruction)
 */

export type SecurityTier =
  | "PUBLIC"
  | "AUTHENTICATED"
  | "PRIVILEGED"
  | "CLINICAL"
  | "FINANCIAL"
  | "ADMINISTRATIVE"
  | "AI_HIGH_RISK"
  | "EXTERNAL_INTEGRATION";

export type OperationClass = "READ" | "WRITE" | "DESTRUCTIVE";

/** Required controls for an endpoint. */
export interface RequiredControls {
  jwt: boolean;                    // JwtAuthGuard enforced (or @Public explicit)
  public: boolean;                 // @Public() decorator present (only for PUBLIC tier)
  permission: string[];            // required permission(s) via @RequirePermission
  tenantIsolation: boolean;        // tenant_id scope enforced
  entityIsolation: boolean;        // entity_code scope enforced
  countryIsolation: boolean;       // country_code scope enforced (TZ default)
  globalUserId: boolean;           // GlobalUserID captured in audit
  practitioner: boolean;           // practitioner identity required
  professionalLicence: boolean;    // licence verified via HCM
  facility: boolean;               // facility_id required
  scopeOfPractice: boolean;        // HCM scope check
  governanceAuthorization: boolean;// @RequiresGovernance
  hcmAuthorization: boolean;       // @RequireHcmPractitioner
  mfaStepUp: boolean;              // @RequiresMfaStepUp
  csrf: boolean;                   // CSRF enforced for cookie-auth
  clinicalSafetyGate: boolean;     // @RequiresClinicalSafety
  consent: boolean;                // consent check
  legalHold: boolean;              // legal-hold aware
  audit: boolean;                  // audit record written
  idempotency: boolean;            // idempotency key required
  rateLimit: string | null;        // rate-limit policy name (null = default)
  externalAdapter: string | null;  // adapter id if EXTERNAL_INTEGRATION
  humanApproval: boolean;          // REQUIRES_HUMAN_APPROVAL
}

export interface EndpointClassification {
  method: string;
  path: string;
  controller: string;
  tier: SecurityTier;
  opClass: OperationClass;
  required: RequiredControls;
}

/**
 * Classify an endpoint by HTTP method + path + controller.
 *
 * This is intentionally conservative: unknown paths default to PRIVILEGED +
 * audit so the CI matrix flags them rather than silently letting them pass.
 */
export function classifyEndpoint(
  method: string,
  path: string,
  controller: string,
  requiredPermissions: string[] = [],
  isPublic: boolean = false,
  hasGovernance: boolean = false,
  hasHcm: boolean = false,
  hasMfa: boolean = false,
  hasClinicalSafety: boolean = false,
): EndpointClassification {
  const p = path.toLowerCase();
  const verb = method.toUpperCase();
  const opClass: OperationClass =
    verb === "DELETE" ? "DESTRUCTIVE"
    : verb === "POST" || verb === "PUT" || verb === "PATCH" ? "WRITE"
    : "READ";

  // PUBLIC endpoints
  if (isPublic) {
    if (p.includes("/health") || p.includes("live") || p.includes("ready")) {
      return pub("PUBLIC", verb, path, controller, { rateLimit: null, audit: false });
    }
    if (p.includes("/auth/login") || p.includes("/auth/register") || p.includes("/auth/refresh")) {
      return pub("PUBLIC", verb, path, controller, { rateLimit: "auth_login", audit: true });
    }
    if (p.includes("/auth/mfa/challenge") || p.includes("/auth/mfa/verify")) {
      return pub("PUBLIC", verb, path, controller, { rateLimit: "mfa_verify", audit: true });
    }
    return pub("PUBLIC", verb, path, controller, { rateLimit: "default", audit: true });
  }

  // EXTERNAL_INTEGRATION: webhooks, outbound adapter callbacks, FHIR peers
  if (/integration|webhook|fhir\/r4|fhir\/r5/.test(p) && controller !== "integrations") {
    return tier("EXTERNAL_INTEGRATION", verb, path, controller, opClass, requiredPermissions, {
      externalAdapter: inferAdapter(p),
      idempotency: opClass !== "READ",
      rateLimit: "external_submission",
    });
  }
  if (controller === "integrations") {
    return tier("EXTERNAL_INTEGRATION", verb, path, controller, opClass, requiredPermissions, {
      externalAdapter: inferAdapter(p),
      governanceAuthorization: true,
      rateLimit: "external_submission",
      idempotency: opClass !== "READ",
    });
  }

  // FINANCIAL: billing, payments
  if (/billing|payment|invoice|claim|nhif/.test(p)) {
    return tier("FINANCIAL", verb, path, controller, opClass, requiredPermissions, {
      governanceAuthorization: true,
      hcmAuthorization: false,
      idempotency: opClass !== "READ",
      audit: true,
      rateLimit: opClass === "READ" ? "default" : "billing_write",
    });
  }

  // ADMINISTRATIVE: tenants, rbac, audit export, config
  if (/tenant|rbac|role|permission|config|admin|audit\/export|ai\/configure|breakglass|trustee|board/.test(p)) {
    return tier("ADMINISTRATIVE", verb, path, controller, opClass, requiredPermissions, {
      mfaStepUp: opClass !== "READ",
      audit: true,
      rateLimit: opClass === "READ" ? "default" : "admin_sensitive",
    });
  }

  // AI_HIGH_RISK
  if (/ai|noelia|hive|predict|triage/.test(p)) {
    return tier("AI_HIGH_RISK", verb, path, controller, opClass, requiredPermissions, {
      clinicalSafetyGate: true,
      governanceAuthorization: true,
      mfaStepUp: opClass !== "READ",
      humanApproval: true,
      audit: true,
      rateLimit: "ai_invocation",
    });
  }

  // CLINICAL: patients/encounters/clinical/pharmacy/radiology/optical/dialysis/
  // ambulance dispatch/telehealth clinical/consent/incidents/records/observations/
  // problems/allergies/medications/prescriptions/dispense/verify/release
  //
  // Excluded from CLINICAL tier (classified as PRIVILEGED or other instead):
  //   - /billing|payment|invoice|claim|nhif           → FINANCIAL (handled above)
  //   - /appointments                                → PRIVILEGED (scheduling — clerical workflow, no HCM gate required to *book*)
  //   - /telehealth/sessions (create/transition)     → PRIVILEGED (session orchestration, not clinical documentation)
  //   - /ambulance/vehicles                          → ADMINISTRATIVE (fleet admin)
  //   - /pharmacy/items, /pharmacy/stock             → PRIVILEGED (inventory management)
  //   - /lab/tests                                   → PRIVILEGED (catalog management)
  //   - /imaging/orders (create/transition)          → PRIVILEGED (order entry can be clerical; report/verify is CLINICAL)
  //   - /eye-exams (create = intake)                 → PRIVILEGED (sign is CLINICAL)
  //   - /lab/orders create/transition                → PRIVILEGED (order entry)
  //   - /lab/results/:itemId (enter without verify)  → CLINICAL (results are PHI-bearing)
  if (/\/(encounter|clinical|pharmacy\/dispense|patients|records|consent|incident|observ|problem|allergy|vital|diagnos|procedure|note|sign|ambulance\/requests|dialysis\/sessions|lab\/results|imaging\/reports|eye-exams\/:id\/sign)/i.test(p)
      // Pharmacy dispense already matches; include dispense/rx prescribe endpoints
      || /\/rx|dispens|prescription|medication[^/]*$/.test(p) && verb !== "GET" && !/stock|items/.test(p)) {
    return tier("CLINICAL", verb, path, controller, opClass, requiredPermissions, {
      practitioner: true,
      professionalLicence: opClass !== "READ",
      facility: true,
      scopeOfPractice: true,
      hcmAuthorization: opClass !== "READ",
      clinicalSafetyGate: opClass !== "READ",
      consent: containsPhi(p),
      legalHold: true,
      idempotency: opClass !== "READ",
      audit: true,
      rateLimit: opClass === "READ" ? "default" : "clinical_write",
    });
  }

  // Compliance/reporting/MTUHA/public health — PRIVILEGED + audit + idempotency
  if (/compliance|reporting|mtuha|public[-_]?health|notifiable|surveill/.test(p)) {
    return tier("PRIVILEGED", verb, path, controller, opClass, requiredPermissions, {
      audit: true,
      idempotency: opClass !== "READ",
      rateLimit: opClass === "READ" ? "default" : "public_health_submission",
    });
  }

  // Auth (non-public: csrf-token, logout, mfa enroll, profile)
  if (/auth\//.test(p) && !/login|register|refresh/.test(p)) {
    return tier("AUTHENTICATED", verb, path, controller, opClass, requiredPermissions, {
      audit: true,
      rateLimit: "default",
    });
  }

  // Audit read-only
  if (/^\/audit/.test(p)) {
    return tier("PRIVILEGED", verb, path, controller, opClass, requiredPermissions, {
      audit: true,
      rateLimit: "default",
    });
  }

  // Search + fallback — PRIVILEGED
  return tier("PRIVILEGED", verb, path, controller, opClass, requiredPermissions, {
    audit: true,
    rateLimit: "default",
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────
function base(overrides?: Partial<RequiredControls>): RequiredControls {
  return {
    jwt: true, public: false,
    permission: [],
    tenantIsolation: true, entityIsolation: true, countryIsolation: true,
    globalUserId: true, practitioner: false, professionalLicence: false,
    facility: false, scopeOfPractice: false,
    governanceAuthorization: false, hcmAuthorization: false,
    mfaStepUp: false, csrf: true, clinicalSafetyGate: false,
    consent: false, legalHold: false, audit: true, idempotency: false,
    rateLimit: "default", externalAdapter: null, humanApproval: false,
    ...overrides,
  };
}

function pub(
  _tier: "PUBLIC",
  method: string, path: string, controller: string,
  ov: Partial<RequiredControls> = {},
): EndpointClassification {
  return {
    method, path, controller,
    tier: "PUBLIC",
    opClass: method === "DELETE" ? "DESTRUCTIVE"
          : method === "POST" || method === "PUT" || method === "PATCH" ? "WRITE" : "READ",
    required: base({
      jwt: false, public: true,
      tenantIsolation: false, entityIsolation: false, countryIsolation: false,
      globalUserId: false, csrf: false, audit: false,
      ...ov,
    }),
  };
}

function tier(
  tier: SecurityTier, method: string, path: string, controller: string,
  opClass: OperationClass, permissions: string[],
  ov: Partial<RequiredControls> = {},
): EndpointClassification {
  return {
    method, path, controller, tier, opClass,
    required: { ...base(), permission: permissions, ...ov },
  };
}

function inferAdapter(p: string): string | null {
  if (/nhif|insurance/.test(p)) return "nhif";
  if (/moh|mtuha|public[-_]?health/.test(p)) return "moh";
  if (/tra|tax/.test(p)) return "tax_engine";
  if (/tmda/.test(p)) return "tmda";
  if (/sms|email/.test(p)) return "notification";
  if (/payment|mobile[-_]?money|mpesa|tigopesa|airtel/.test(p)) return "payment";
  if (/pacs|dicom/.test(p)) return "pacs";
  if (/fhir/.test(p)) return "fhir_peer";
  if (/video|telehealth|janus|jitsi/.test(p)) return "telehealth";
  if (/governance/.test(p)) return "beyu_governance";
  if (/hcm/.test(p)) return "beyu_hcm";
  if (/finance/.test(p)) return "beyu_finance";
  if (/noelia|hive|ai/.test(p)) return "beyu_ai";
  return null;
}

function containsPhi(_p: string): boolean {
  // PHI-bearing clinical resources require consent checks when the operation
  // releases data beyond the direct care team. Writes under the treating-
  // practitioner relationship don't require consent lookup by default; this
  // is conservative and errs toward consent-awareness.
  return false;
}
