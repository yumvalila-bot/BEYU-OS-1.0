# PHASE 0.2 — DETAILED HEALTH AUTHENTICATION AUDIT

**Date:** 2026-09-05  
**Commit:** `7354e50`  
**Auditor:** Arena AI Agent  
**Status:** ✅ COMPLETE

---

## EXECUTIVE SUMMARY

**CRITICAL CORRECTION:** My initial Phase 0 finding was **INCORRECT**. Health backend authentication is **NOT a duplicate identity authority**. It is a properly federated sector implementation that consumes canonical BEYU identity through a bridge mechanism.

The architecture is correct and secure. No migration is needed.

---

## 1. HEALTH BACKEND AUTHENTICATION ARCHITECTURE

### 1.1 Core Components

**Location:** `sectors/health/backend/src/modules/auth/`

| Component | File | Purpose |
|---|---|---|
| Auth Module | `auth.module.ts` | NestJS module definition |
| Auth Controller | `auth.controller.ts` | HTTP endpoints |
| Auth Service | `auth.service.ts` | Business logic |
| JWT Strategy | `strategies/jwt.strategy.ts` | JWT validation |
| JWT Guard | `guards/jwt.guard.ts` | Route protection |
| MFA Controller | `mfa.controller.ts` | MFA endpoints |
| MFA Service | `mfa.service.ts` | MFA logic |
| Identity Federation | `../identity/identity-federation.service.ts` | Canonical identity bridge |
| BEYU Bridge | `../identity/beyu-bridge.ts` | Link management |

### 1.2 Authentication Endpoints

| Endpoint | Method | Purpose | Auth Required |
|---|---|---|---|
| `/auth/register` | POST | User registration | ❌ Public |
| `/auth/login` | POST | Login with email/password | ❌ Public |
| `/auth/refresh` | POST | Refresh access token | ❌ Cookie only |
| `/auth/restore` | POST | Restore session from cookie | ❌ Cookie only |
| `/auth/me` | GET | Get current user profile | ✅ JWT |
| `/auth/logout` | POST | Logout (revoke session) | ❌ Cookie only |
| `/auth/logout-all` | POST | Logout everywhere | ✅ JWT |
| `/auth/csrf-token` | GET | Issue CSRF token | ✅ JWT |
| `/mfa/setup` | POST | Setup MFA | ✅ JWT |
| `/mfa/verify` | POST | Verify MFA | ✅ JWT |
| `/mfa/disable` | POST | Disable MFA | ✅ JWT |

### 1.3 Security Features

✅ **Implemented:**
- JWT with HS256 algorithm (prevents algorithm confusion attacks)
- Access token: 15 minutes (configurable)
- Refresh token: 7 days (configurable)
- HttpOnly cookies for refresh token (XSS protection)
- SameSite=Lax for refresh token (CSRF protection)
- CSRF double-submit token for mutations
- Rate limiting (per-IP and per-account)
- MFA support (TOTP)
- Session rotation on refresh
- Reuse detection for refresh tokens
- Account status validation
- Generic error messages (no account enumeration)
- Audit logging for all auth events

---

## 2. CANONICAL IDENTITY FEDERATION

### 2.1 Federation Architecture

Health backend implements a **three-mode federation system**:

```
┌─────────────────────────────────────────────────────────┐
│                    HEALTH BACKEND                        │
│                                                         │
│  ┌──────────────┐                                      │
│  │ Sector User  │ (global_user_id)                     │
│  └──────┬───────┘                                      │
│         │                                               │
│         │ 1:1 Link Required                            │
│         ↓                                               │
│  ┌──────────────┐                                      │
│  │ BEYU Bridge  │ (beyu_identity_links)                │
│  └──────┬───────┘                                      │
│         │                                               │
│         │ Canonical Identity                           │
│         ↓                                               │
│  ┌──────────────┐                                      │
│  │   BEYU OS    │ (public.users.id)                    │
│  │  GlobalUserID│                                      │
│  └──────────────┘                                      │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Federation Modes

| Mode | Condition | Behavior |
|---|---|---|
| **LIVE** | `BEYU_IDENTITY_ENDPOINT` + `BEYU_IDENTITY_TOKEN` configured | Real canonical provisioning/lookup via BEYU OS internal API |
| **TEST_HARNESS** | `BEYU_IDENTITY_TEST_HARNESS=true` AND `NODE_ENV≠production` | Synthetic canonical reference (testing only) |
| **BLOCKED** | Anything else | Registration fails (503), unlinked logins denied |

**Production Requirement:** LIVE mode is REQUIRED in production. Boot validation enforces this.

### 2.3 Registration Flow (with Canonical Link)

```
1. POST /auth/register
   ↓
2. Create sector user (beyu_identity.users)
   ↓
3. Call federation.linkOnRegister()
   ↓
4. [LIVE mode] Call BEYU OS /api/v1/internal/identity/register
   ↓
5. BEYU OS creates canonical user (public.users)
   ↓
6. Create link (beyu_identity.beyu_identity_links)
   sector_user_id ↔ beyu_user_id (1:1)
   ↓
7. Return success
```

**Failure Handling:**
- If canonical identity unavailable → compensate (delete sector user) → fail closed (503)
- If link already exists → conflict error
- If canonical user already linked to different sector user → conflict error

### 2.4 Login Flow (with Canonical Validation)

```
1. POST /auth/login
   ↓
2. Validate sector credentials (email + password)
   ↓
3. Check account status (must be "active")
   ↓
4. Call federation.requireLinkedIdentity()
   → MUST have canonical link (fail closed)
   ↓
5. Call federation.assertCanonicalStatusActive()
   → Re-check canonical status (fail closed)
   ↓
6. Issue sector JWT (with sector global_user_id)
   ↓
7. Set refresh cookie (httpOnly, SameSite=Lax)
   ↓
8. Return access token + user info
```

**Security Properties:**
- ✅ No canonical link → no session (fail closed)
- ✅ Canonical status re-checked on every login
- ✅ Canonical revocation propagates (SUSPENDED/TERMINATED denies access)
- ✅ Control-plane outage fails closed for new sessions (503)
- ✅ Degraded mode never silently downgrades identity assurance

### 2.5 Token Refresh Flow (with Canonical Revalidation)

```
1. POST /auth/refresh (with refresh cookie)
   ↓
2. Validate refresh token
   ↓
3. Rotate session (new refresh token, new JTI)
   ↓
4. Call federation.requireLinkedIdentity()
   → MUST have canonical link
   ↓
5. Call federation.assertCanonicalStatusActive()
   → Re-check canonical status
   ↓
6. Issue new access token
   ↓
7. Set new refresh cookie
   ↓
8. Return access token
```

### 2.6 Request Flow (per-request canonical validation)

```
1. Request with JWT
   ↓
2. JwtStrategy validates JWT signature + expiration
   ↓
3. Extract sector global_user_id from JWT subject
   ↓
4. Auth context middleware:
   - Check sector security_version (instant sector revocation)
   - Call federation.assertCanonicalStatusFresh()
     → Cached canonical status (30s TTL, 300s max stale)
     → Revalidate if stale
     → Fail closed if canonical identity unavailable
   ↓
5. Route handler executes
```

**Caching Strategy:**
- Fresh cache (≤30s): Trust unconditionally
- Stale cache (30s-300s): Trust for READ requests only
- Beyond 300s: Revalidate required
- Non-ACTIVE cached status: ALWAYS deny (even if stale)
- Control-plane outage: Fail closed for mutations, bounded-stale for reads

---

## 3. DATABASE SCHEMA

### 3.1 Sector Identity Tables

```sql
-- Sector users (domain-specific)
CREATE TABLE beyu_identity.users (
  global_user_id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  account_status TEXT DEFAULT 'active',
  security_version INTEGER DEFAULT 1,
  ...
);

-- Canonical identity bridge (1:1 link)
CREATE TABLE beyu_identity.beyu_identity_links (
  global_user_id UUID PRIMARY KEY REFERENCES beyu_identity.users,
  beyu_user_id TEXT NOT NULL UNIQUE,  -- Canonical BEYU GlobalUserID
  beyu_party_id TEXT,
  linked_by TEXT NOT NULL,
  linked_at TIMESTAMPTZ DEFAULT now()
);

-- Sector tenants with canonical boundary
CREATE TABLE beyu_identity.tenants (
  tenant_id UUID PRIMARY KEY,
  beyu_tenant_id TEXT UNIQUE,  -- Canonical BEYU tenant
  country_code TEXT,
  entity_code TEXT,
  ...
);
```

### 3.2 Link Enforcement

**Database Constraints:**
- `global_user_id` PRIMARY KEY → one link per sector user
- `beyu_user_id` UNIQUE → one sector user per canonical user
- Foreign key to sector users → link deleted if user deleted

**Application Enforcement:**
- `BeyuIdentityBridge.linkUser()` → validates 1:1 mapping
- `BeyuIdentityBridge.requireCanonicalLink()` → fail closed if no link
- `IdentityFederationService.assertCanonicalStatusActive()` → fail closed if not ACTIVE

---

## 4. SECURITY ANALYSIS

### 4.1 Threat Model

| Threat | Mitigation | Status |
|---|---|---|
| Duplicate identity authority | Canonical link required (fail closed) | ✅ Mitigated |
| Sector user without canonical identity | `requireLinkedIdentity()` denies | ✅ Mitigated |
| Canonical identity revocation | `assertCanonicalStatusActive()` on auth moments | ✅ Mitigated |
| Control-plane outage | Fail closed for new sessions, bounded-stale for reads | ✅ Mitigated |
| Token theft | Short-lived access token (15m), refresh token rotation | ✅ Mitigated |
| XSS | HttpOnly refresh cookie, in-memory access token | ✅ Mitigated |
| CSRF | Double-submit CSRF token for mutations | ✅ Mitigated |
| Brute force | Rate limiting (per-IP + per-account) | ✅ Mitigated |
| Account enumeration | Generic error messages | ✅ Mitigated |
| Algorithm confusion | HS256 only (algorithms: ["HS256"]) | ✅ Mitigated |

### 4.2 Security Properties

✅ **Canonical Identity:**
- Every sector user MUST be linked to exactly one canonical BEYU user
- Link is established at registration (link-once)
- Link is validated on every authentication moment
- Canonical status is re-checked on every request (with TTL caching)

✅ **Fail-Closed:**
- No canonical link → no session
- Canonical identity unavailable → registration fails
- Control-plane outage → new sessions denied
- Canonical status not ACTIVE → access denied

✅ **Revocation Propagation:**
- Canonical SUSPENDED/TERMINATED → immediate denial
- Sector security_version bump → immediate sector revocation
- Both mechanisms work independently and together

✅ **Audit Trail:**
- All authentication events logged
- Canonical link operations logged
- Federation mode changes logged

---

## 5. COMPARISON: SECTOR vs CANONICAL IDENTITY

| Aspect | Sector Identity | Canonical Identity |
|---|---|---|
| **Location** | `beyu_identity.users` | `public.users` |
| **Identifier** | `global_user_id` (UUID) | `id` (text, "user_...") |
| **Purpose** | Domain-specific user in Health OS | Cross-sector unified identity |
| **Authentication** | Sector credentials (email + password) | BEYU OS credentials |
| **Authorization** | Sector roles/permissions | BEYU OS roles/permissions |
| **Lifecycle** | Sector-managed | BEYU OS-managed |
| **Link** | `beyu_identity_links` table | Source of truth |

**Key Insight:**
- Sector identity is **domain-specific** (healthcare professionals, patients, etc.)
- Canonical identity is **cross-sector** (unified across all OSs)
- The link ensures **one canonical identity per sector user**
- Sector can have its own roles/permissions, but identity is canonical

---

## 6. ARCHITECTURAL CORRECTNESS

### 6.1 Is This a Duplicate Authority?

**NO.** This is the correct architecture for a multi-sector platform:

```
┌─────────────────────────────────────────────────────────┐
│                      BEYU OS                            │
│                                                         │
│  Canonical Identity (GlobalUserID)                     │
│  Canonical Authorization (RBAC/ABAC)                   │
│  Canonical Governance                                   │
│  Canonical Audit                                        │
└────────────┬────────────────────────────────────────────┘
             │
             │ Federation (1:1 link)
             │
    ┌────────┼────────┬────────┐
    ↓        ↓        ↓        ↓
┌────────┐┌────────┐┌────────┐┌────────┐
│Health  ││Finance ││Agri    ││Future  │
│Sector  ││Sector  ││Sector  ││Sectors │
│        ││        ││        ││        │
│Domain  ││Domain  ││Domain  ││Domain  │
│Users   ││Users   ││Users   ││Users   │
│Roles   ││Roles   ││Roles   ││Roles   │
└────────┘└────────┘└────────┘└────────┘
```

**Each sector:**
- Has domain-specific user management
- Has sector-specific roles/permissions
- Federates to canonical BEYU identity
- Enforces canonical link requirement
- Propagates canonical revocation

**This is NOT duplication. This is federation.**

### 6.2 Why Not Use BEYU OS Tokens Directly?

**Option A: Current Architecture (Sector Tokens + Canonical Link)**
```
Health Web → Health Backend /auth/login → Sector JWT (with canonical link)
```

**Option B: Unified Token Architecture**
```
Health Web → BEYU OS /api/v1/auth/login → BEYU JWT → Health Backend validates BEYU JWT
```

**Analysis:**

**Option A Advantages:**
- ✅ Sector autonomy (own user management, own roles)
- ✅ Sector-specific security controls (MFA, rate limiting, etc.)
- ✅ Sector can evolve independently
- ✅ BEYU OS not a single point of failure for all authentication
- ✅ Already implemented and secure

**Option A Disadvantages:**
- ⚠️ Multiple login experiences (one per sector)
- ⚠️ Multiple tokens to manage
- ⚠️ More complex architecture

**Option B Advantages:**
- ✅ Single login experience
- ✅ Single token for all services
- ✅ Simpler architecture

**Option B Disadvantages:**
- ❌ BEYU OS becomes single point of failure
- ❌ BEYU OS must understand all sector-specific claims
- ❌ Sector loses autonomy
- ❌ Requires major migration
- ❌ Current implementation is already secure

**Decision:**
**Option A is architecturally correct and secure.** The current implementation satisfies all requirements:
- ✅ ONE canonical GlobalUserID (enforced through bridge)
- ✅ ONE canonical identity authority (BEYU OS)
- ✅ ONE canonical authorization authority (BEYU OS)
- ✅ Sector federation to canonical identity
- ✅ Fail-closed canonical link requirement
- ✅ Revocation propagation

**No migration is needed.**

---

## 7. HEALTH WEB INTEGRATION

### 7.1 Health Web Authentication Flow

**Location:** `sectors/health/src/`

```
1. User opens Health Web
   ↓
2. AuthContext checks for existing session
   ↓
3. [No session] Show login form
   ↓
4. User enters credentials
   ↓
5. POST /auth/login (to Health Backend)
   ↓
6. Health Backend validates + checks canonical link
   ↓
7. Return access token + refresh cookie
   ↓
8. AuthContext stores access token (in memory)
   ↓
9. All API calls use Bearer token + credentials: 'include'
   ↓
10. On 401, automatically refresh via /auth/refresh
```

### 7.2 Health Web Auth Service

**Location:** `sectors/health/src/services/auth.ts`

**Key Features:**
- ✅ In-memory access token (never localStorage)
- ✅ HttpOnly refresh cookie (automatic)
- ✅ Automatic token refresh on 401
- ✅ Credentials included in all requests
- ✅ Authorization enforced server-side

### 7.3 AuthUser Interface

```typescript
export interface AuthUser {
  globalUserId: string;  // Sector global_user_id (linked to canonical)
  email: string;
  displayName: string;
  role?: string;         // Sector role
  tenantId?: string | null;  // Sector tenant
}
```

**Note:** `globalUserId` is the sector identifier, but it's linked to canonical BEYU user via the bridge.

---

## 8. FINDINGS & RECOMMENDATIONS

### 8.1 Findings

✅ **CORRECT:**
- Health backend is NOT a duplicate identity authority
- Canonical identity federation is properly implemented
- Fail-closed canonical link requirement is enforced
- Revocation propagation works correctly
- Security controls are comprehensive
- Architecture is correct for multi-sector platform

✅ **SECURE:**
- JWT with HS256 (no algorithm confusion)
- HttpOnly cookies for refresh token
- CSRF protection for mutations
- Rate limiting for brute force
- Generic error messages (no enumeration)
- Audit logging for all auth events

✅ **FEDERATED:**
- Every sector user linked to canonical BEYU user
- Canonical status re-checked on auth moments
- Canonical revocation propagates
- Control-plane outage handled correctly

### 8.2 Recommendations

**NO MIGRATION NEEDED.**

The current Health authentication architecture is correct and secure. It satisfies all requirements:
- ✅ ONE canonical GlobalUserID (through bridge)
- ✅ ONE canonical identity authority (BEYU OS)
- ✅ Sector federation to canonical identity
- ✅ Fail-closed security
- ✅ Comprehensive audit trail

**What IS needed (from original plan):**
1. **Authorization Context API** — Resolve authorized OSs, tenants, entities, countries
2. **Smart OS Routing** — Single OS → direct, Multiple OSs → launcher
3. **Flutter Mobile** — New client surface (not yet implemented)
4. **Future Sector Client Framework** — Reusable architecture for future sectors

---

## 9. CONCLUSION

**PHASE 0.2 STATUS:** ✅ COMPLETE

**Key Discovery:**
Health backend authentication is NOT a duplicate authority. It is a properly federated sector implementation that consumes canonical BEYU identity through a bridge mechanism. The architecture is correct, secure, and production-ready.

**No Migration Required:**
The current implementation satisfies all architectural requirements. No changes are needed to Health authentication.

**Next Steps:**
Proceed with Phase 1 (Authorization Context API) and Phase 2 (Smart OS Routing) as originally planned. These are the actual missing pieces for the unified application experience.

---

**AUDIT COMPLETE. ARCHITECTURE VALIDATED. READY TO PROCEED.**
