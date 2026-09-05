# BEYU OS Mobile — Flutter Client

**BEYU OS Mobile** is a first-class client surface of the BEYU OS control plane, implemented in Flutter for iOS and Android.

## Architecture

```
BEYU OS (Canonical Authority)
    ↓
Canonical Identity (GlobalUserID)
    ↓
Authorization Context
    ↓
┌──────────────┬──────────────┐
│   BEYU Web   │    Flutter   │
│   (Next.js)  │   (Mobile)   │
└──────┬───────┴──────┬───────┘
       │              │
       └──────┬───────┘
              ↓
       Smart OS Router
              ↓
    ┌─────────┼─────────┐
    ↓         ↓         ↓
BEYU OS   Health OS   Future
    ↓         ↓
Backend APIs
    ↓
PostgreSQL / RLS
```

## Security Model

### Canonical Identity
- **ONE** canonical BEYU identity (GlobalUserID)
- **ONE** canonical authentication authority
- **ONE** canonical authorization authority
- Flutter consumes the same identity as BEYU Web

### Authentication
- Mobile login endpoint: `/api/v1/auth/mobile/login`
- Returns bearer token (not httpOnly cookie)
- Same credential verification as web login
- MFA support
- Rate limiting
- Account lockout

### Authorization
- Authorization context: `/api/v1/authorization/mobile/context`
- Server-side resolution (never trust client)
- Returns authorized OSs, roles, permissions
- Smart routing: 1 OS → direct, multiple → launcher, 0 → deny

### Session Security
- Bearer token stored in platform secure storage (Keychain/Keystore)
- Automatic re-authentication on 401
- Session expiration handling
- Server-side revocation support

### Fail-Closed Security
- No authorization → access denied
- Unauthorized OS → not shown
- Deep link without auth → deny
- Token expired → re-authenticate

## Smart OS Routing

The same routing logic as BEYU Web:

```
Authenticated User
    ↓
Resolve Authorization Context
    ↓
┌─────────────────┬──────────────────┬─────────────┐
│ 0 OSs           │ 1 OS             │ Multiple OSs│
│ → Access Denied │ → Direct Route   │ → Launcher  │
└─────────────────┴──────────────────┴─────────────┘
```

## Health OS Integration

Health OS uses canonical identity federation:

```
Flutter → BEYU Auth → GlobalUserID → Authorization → Health API → Health DB/RLS
```

- Health users have canonical identity link
- Link established at registration (link-once)
- Link validated on every auth moment
- Canonical status re-checked

## Project Structure

```
lib/
├── main.dart                    # App entry point
├── config/
│   └── app_config.dart          # Configuration
├── models/
│   ├── auth_models.dart         # Authentication models
│   └── authorization_models.dart # Authorization models
├── services/
│   ├── api_client.dart          # HTTP client
│   └── secure_storage_service.dart # Secure token storage
├── providers/
│   ├── auth_provider.dart       # Authentication state
│   └── router_provider.dart     # Smart routing
└── screens/
    ├── splash_screen.dart       # Loading
    ├── login_screen.dart        # Login
    ├── mfa_screen.dart          # MFA
    ├── access_denied_screen.dart # Denied
    ├── launcher_screen.dart     # OS launcher
    ├── os_shell_screen.dart     # OS container
    └── os_screens/
        ├── beyu_os_screen.dart  # BEYU OS
        └── health_os_screen.dart # Health OS
```

## Security Properties

✅ **Server-Side Authorization**: Client never makes authorization decisions  
✅ **Canonical Identity**: Same GlobalUserID as BEYU Web  
✅ **Fail-Closed**: No authorization → no access  
✅ **Secure Storage**: Tokens in Keychain/Keystore  
✅ **HTTPS Only**: All traffic encrypted  
✅ **No Secrets**: No passwords, API keys, or service-role keys in code  
✅ **Audit Trail**: All auth events logged  
✅ **Tenant Isolation**: Enforced by RLS  
✅ **MFA Support**: Step-up authentication  
✅ **Rate Limiting**: Brute force protection  

## Non-Goals

❌ **Not a second identity system** — consumes canonical BEYU identity  
❌ **Not a second authorization system** — server is authoritative  
❌ **Not direct database access** — all data via API  
❌ **Not client-side authorization** — UI guards are UX only  
❌ **Not Agriculture OS** — FUTURE / NOT YET INTEGRATED  

## Development

### Prerequisites
- Flutter SDK 3.2.0+
- Dart SDK 3.2.0+
- BEYU OS API (production or development)

### Setup
```bash
cd mobile/flutter
flutter pub get
```

### Configuration
Set API URL via environment variable:
```bash
flutter run --dart-define=BEYU_API_URL=https://api.beyu.os
```

### Build
```bash
flutter build apk --release  # Android
flutter build ios --release  # iOS
```

## Testing

### Unit Tests
```bash
flutter test
```

### Integration Tests
```bash
flutter test integration_test/
```

### Security Tests
See `test/security/` for adversarial security tests.

## Deployment

### Production Checklist
- [ ] API URL configured for production
- [ ] HTTPS enforced
- [ ] No debug flags
- [ ] Secure storage configured
- [ ] App Store / Play Store submission
- [ ] Privacy policy updated
- [ ] Terms of service updated

## Documentation

- [Authentication Flow](docs/AUTHENTICATION.md)
- [Authorization Context](docs/AUTHORIZATION.md)
- [Smart Routing](docs/ROUTING.md)
- [Health Integration](docs/HEALTH.md)
- [Security Model](docs/SECURITY.md)

## License

Proprietary — BEYU OS

---

**BEYU OS Mobile** — Secure, governed, canonical mobile access to the enterprise control plane.
