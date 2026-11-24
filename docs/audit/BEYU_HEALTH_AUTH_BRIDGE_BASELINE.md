# BEYU–Health authentication bridge baseline

**Inspection:** PR #127 head `da234acc33f74a54efc6f843f41d42bf01fb8e36`, current main `d6366d09cd1e7053aabd8ccaf7781049f23a7d18`; inspection in the current engineering session. PR #127 is now draft and contains public homepages and **unwired** pilot request-binding and replay primitives. It is seven commits ahead and zero commits behind this main. No production environment was inspected.

## Important overlapping work

Open draft PR #120 (`security/finance-health-boundary-remediation`, head `70660a881946b63b36691c85e2473749650d49c2`) already contains an unmerged Health signed assertion issuer, Health exchange/session work, replay and migrations 046–048. Its GitHub mergeability is `CONFLICTING`; checks include failed root and Health backend gates. Its documentation describes Ed25519 assertions exposed to the SPA, whereas PR #127's previous draft describes ES256 request-bound assertions kept server-side and a shared DB. These are **different, incomplete proposals**, not two approved identity authorities. PR #120's documented design says a separate Health DB; the current root gate reads the Health link through root `DATABASE_URL`. Neither design is demonstrated as end-to-end operational here. Do not independently recreate PR #120's exchange/replay tables in #127; reconcile the overlapping work, topology, transport, revocation and authorization contract with its owners first. No branch was switched and no unreviewed changes were copied.

## Existing boundaries

- Root `src/lib/session.ts` resolves a hashed cookie against non-revoked, unexpired sessions, active user and party and a non-service person, then derives grants and scope server-side. Tenant lifecycle, session-cookie policy, MFA, logout and authorization must be traced and tested in the actual request path, not assumed from the mount alone.
- `src/app/os/health/mount.ts` and `/health/os` use one mount: session, foreign-host refusal, tenant-domain narrowing, Health namespace and active identity link. `checkHealthOSAuthorization` returns unavailable on lookup errors and checks link `status=active`. This gates document access; it does **not** prove Health membership, clinical authorization or a Health session.
- Health's existing controller fences standalone registration, password login, refresh and restore in production. Its auth service contains its own session, JWT, refresh and revocation logic, but the fenced standalone endpoints are not a federation flow. Health middleware checks account, canonical link, membership/security-version and authorization context as implemented; this is not evidence of a complete BEYU-session binding.
- `next.config.ts` exposes no Health backend rewrite. The SPA's auth client expects `/health-os/auth/*`; setting a backend URL does not create a proxy. No root BFF or BEYU-to-Health exchange exists on #127.
- Health link rows live in `beyu_identity.beyu_identity_links`; root reads them through its DB connection. Shared database was selected by the requester as a direction, not verified deployment reality. Current root and Health ledger names collide, Health runner has a foreign-ledger fail-closed guard, and least-privilege grants and migration path need review. No historical migration was changed.
- Original unnormalized request-target availability through the Next.js/Vercel boundary is not established. The binding helper explicitly cannot safely consume a previously normalized URL. The approved pilot `/auth/me` needs a complete reviewed BFF/Health route design, not direct exposure of the existing JWT guard.

## CI and testing evidence at inspected head

GitHub Actions on `da234ac`: Health backend job **failed at non-mutating lint**; its typecheck, migrations 001–045, PGlite, real-PostgreSQL security suite, build and production-mode readiness steps reported success. The root security gate was pending at inspection. Scratch root migration validation and Health frontend verification reported success; production deploy and verification steps were skipped. Vercel reported a preview Ready, not production verification. The failure was reproduced as three Prettier errors in #127's replay primitive; this branch applies a formatting-only fix. A re-run on the final head is required.

## Remaining design gates

1. Reconcile with #120 and its conflicting code and migrations; decide which existing work is authoritative. Do not implement a second exchange or replay store without that decision.
2. Approve a concrete transport, request-target handling, key custody, session issuance/refresh, revocation bound, MFA and tenant/clinical permission mapping. A BEYU session or active link cannot be an operation grant. Choose a safe way to keep credentials out of the browser consistent with the latest mission.
3. Database owners must approve isolated ledger location, runner search path, upgrade and runtime grants; replay storage, retention and revocation must be validated with non-owner PostgreSQL roles and scratch migrations.
4. Implement/review the controlled BFF, independent Health verifier and sector session, frontend, audit and lifecycle as one coherent change. Test CSRF, SSRF, replay, origin/host spoofing, isolation and outage behavior end to end. No bypass of standalone fence.
5. Separate human approval is necessary for actual production deployment, secrets, migrations and identity/tenant bindings. No production operations are authorized by this baseline.
