# BEYU OS — Supabase PostgreSQL CA trust anchors

This directory holds the **only** certificate authority material the BEYU OS
database layer trusts for TLS. Trust here is *narrow by design*: passing a `ca`
list to Node's TLS stack **replaces** the default public trust store for the
database connection, so a BEYU database session can only ever be established
against a certificate chaining to one of the anchors below.

These are **CA (public) certificates only**. They contain no private key and are
not secret. No private key material may ever be committed to this repository.

---

## Why this directory exists

Vercel Production reported, for `GET /api/health`:

```json
{"event":"db_health_probe","classification":"DATABASE_TLS_FAILURE","code":"SELF_SIGNED_CERT_IN_CHAIN"}
```

`SELF_SIGNED_CERT_IN_CHAIN` (OpenSSL `X509_V_ERR_SELF_SIGNED_CERT_IN_CHAIN`, #19)
fires only when the **served chain itself contains a self-signed certificate
that is not in the client trust store**. Supabase's database CA is a *private*
CA: it has never been submitted to the Mozilla/NSS root programme, so it is not
in any Node.js bundled store. A client that relies on Node's default store
therefore **cannot** verify a Supabase database connection, and fails closed.

Supabase documents this directly
([Postgres SSL Enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement)):
to use `sslmode=verify-full` — the mode Supabase itself recommends — you must
supply the downloaded Supabase CA certificate. BEYU now pins that material
explicitly instead of depending on an ambient trust store.

---

## The trust anchors

Both certificates carry the **same** subject/issuer distinguished name
(`CN=Supabase Root 2021 CA`, note the literal `ST=Delware` spelling, which is a
typo inside Supabase's own certificate) but are **different certificates with
different keys**. Supabase rotated the root *key* on 2025-09-03 while reusing the
original subject name. Trusting by name is therefore meaningless; trust is
pinned by SHA-256 fingerprint below.

### `prod-ca-2021.crt` — original Supabase root (2021 key)

| Field | Value |
| --- | --- |
| Subject | `C=US, ST=Delware, L=New Castle, O=Supabase Inc, CN=Supabase Root 2021 CA` |
| Issuer | identical (self-signed; SKI == AKI) |
| Serial | `6CBC4CA1DEB63F692D0A2024C67289C2D13D54F6` |
| Validity | 2021-04-28 10:56:53 UTC → 2031-04-26 10:56:53 UTC |
| Signature | `sha256WithRSAEncryption` |
| Key usage | Certificate Sign, CRL Sign |
| Basic constraints | `CA:TRUE` (critical) |
| SKI / AKI | `A8:D7:B9:76:37:D8:2C:ED:92:12:26:9E:0E:32:24:D5:2D:69:46:2C` |
| **SHA-256 (DER)** | `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA` |
| SHA-256 (SPKI) | `ba332649230ce9a764e4eaf70368f1a9de9ce64bd38424769e24c3fbf8e57acb` |

### `prod-ca-2025.crt` — rotated Supabase root (2025 key, same CN)

| Field | Value |
| --- | --- |
| Subject | `C=US, ST=Delware, L=New Castle, O=Supabase Inc, CN=Supabase Root 2021 CA` |
| Issuer | identical (self-signed; SKI == AKI) |
| Serial | `797FA0A5F9AC456F5AB05911BE3C978C7C5B7E07` |
| Validity | 2025-09-03 08:01:25 UTC → 2035-09-01 08:01:25 UTC |
| Signature | `sha256WithRSAEncryption` |
| Key usage | Digital Signature, Certificate Sign, CRL Sign (critical) |
| Basic constraints | `CA:TRUE` (critical) |
| SKI / AKI | `8E:F1:04:E7:8D:6D:A1:97:30:B5:74:25:66:57:01:60:E0:51:4E:7A` |
| **SHA-256 (DER)** | `5F:9B:77:95:1A:7A:A1:30:3F:9B:58:EE:A9:BF:A8:9E:35:8C:FD:C1:5F:97:86:FF:10:D4:93:0A:72:2C:9A:E2` |
| SHA-256 (SPKI) | `81874281612accde0a987d4700243ffcbfa62d8b7ec97a260bbbfcc7d7eb3384` |

The SHA-256 (DER) fingerprints are the allowlist enforced at runtime by
`src/db/tls.ts`. A certificate whose fingerprint is not on that allowlist makes
pool construction **throw** — the connection fails closed rather than silently
accepting substituted material.

### Deliberately NOT trusted

`staging-ca-2021.crt` (`CN=Supabase Staging Root 2021 CA`, SHA-256 DER
`CE:0E:FC:EA:…:03:A9:6C`) is Supabase's *staging* root. It is not present here
and must not be added: BEYU production connects only to the production pooler.

---

## Provenance and verification

- **Source:** Supabase's own first-party CLI repository,
  [`supabase/cli`](https://github.com/supabase/cli) — two independent artifacts
  that agree byte-for-byte:
  - `apps/cli-go/internal/gen/types/templates/prod-ca-2021.crt`
  - `apps/cli-go/internal/gen/types/templates/prod-ca-2025.crt`
  - `apps/cli/src/commands/gen/types/templates/prod-ca-2021.ts`
  - `apps/cli/src/commands/gen/types/templates/prod-ca-2025.ts`

  The Go CLI embeds these with `//go:embed`, i.e. every Supabase CLI
  installation ships exactly these bytes.
- **Verification method (performed 2026-09-10):** each file was parsed as X.509
  with OpenSSL 3.0.20; subject, issuer, serial, validity, key usage, basic
  constraints, SKI/AKI were read from the parsed certificate, and the SHA-256
  fingerprint was **independently recomputed** over the DER encoding
  (`openssl x509 -outform DER | sha256sum`, cross-checked against
  `openssl x509 -noout -fingerprint -sha256`). Each certificate's
  self-signature was validated with `openssl verify -CAfile <self> <self>`.
- **Intended endpoint:** `aws-0-eu-west-3.pooler.supabase.com` — Supavisor
  shared connection pooler, project ref `siyzygezdmlxbvwttrdz`, region
  eu-west-3 (Paris). Port `6543` (transaction pooler, runtime) and `5432`
  (session pooler, admin/migration).
- **Verification date:** 2026-09-10.

Independent corroboration that these are the correct anchors for this endpoint
family is in Supabase's own documentation, whose worked example is a pooler
hostname on port 6543 connected with `sslmode=verify-full` plus
`prod-ca-2021.crt`.

---

## Rotation procedure

A CA rotation must **never** be resolved by widening trust to "accept whatever
appears". Controlled steps:

1. Obtain the candidate root from a first-party Supabase source (the Supabase
   dashboard → Database settings → SSL Configuration, or the `supabase/cli`
   repository). Never from a blog post, forum, or unrelated repository.
2. Parse it and recompute its SHA-256 (DER) fingerprint locally.
3. Confirm subject/issuer/serial/validity/key-usage/basic-constraints and that
   the self-signature verifies.
4. Add the new fingerprint to `SUPABASE_TRUST_ANCHOR_FINGERPRINTS` in
   `src/db/tls.ts` **and** place the new `.crt` here — dual-trust window.
5. Deploy to preview; confirm the TLS preflight passes.
6. Deploy to production; confirm `GET /api/health` reports the database UP and
   the TLS preflight passes.
7. After Supabase has finished migrating off the superseded root, delete the
   obsolete `.crt` and its allowlist entry in a separate reviewed change.
8. Record the final trust state in this file.

If a fingerprint in this directory ever disagrees with the allowlist in
`src/db/tls.ts`, the application **must** fail closed. That disagreement is
either a substitution attempt or an incomplete rotation — both are incidents.
