# BEYU OS — Operations, DevSecOps & production engineering

## Environments & deployment

| Concern | Approach |
| --- | --- |
| Runtime | Next.js (App Router) server + PostgreSQL |
| Config | Environment variables only; `DATABASE_URL` required; no secrets in code or DB |
| Schema | Drizzle migrations — `npx drizzle-kit push` in sandboxes, generated migrations in production |
| Bootstrap | `npx tsx src/db/seed.ts` (idempotent constitutional bootstrap) |
| Probes | `GET /api/health` (liveness + readiness, DB check, latency) |
| Portability | Domain engines are framework-free and portable to NestJS/Kubernetes/Lambda |

## Pipeline gates (must all pass before deploy)

1. `npx next typegen`
2. `npm exec tsc -- --noEmit`
3. `npm run lint`
4. `npx vitest run` — 21 deterministic control tests
5. `npm run build`
6. Dependency, secret, container and IaC scanning
7. Migration validation (pre-check → backup → migrate → validate → reconcile → post-check)
8. Policy validation (`detectHierarchyConflicts`) and `GET /api/v1/system/self-test`

No known critical vulnerability is deployed without a documented, approved risk acceptance.

## Observability

- **Logs** — structured JSON with `traceId`, capability and outcome; never secrets or personal data.
- **Metrics** — availability, latency, error rate, throughput, DB performance, AI latency/errors,
  workflow failures, human-review backlog.
- **Traces** — `x-trace-id` propagates across request → audit → event (OpenTelemetry-compatible).
- **Audit / security / business / AI events** — first-class, queryable at `/os/audit`.

## Backup & disaster recovery

Defined in `assurance.continuity_plans` and surfaced at `/os/assurance`:

| Plan | Scenario | RPO | RTO |
| --- | --- | --- | --- |
| BCP-CORE-01 | Primary region outage | 5 min | 60 min |
| BCP-DATA-02 | Logical data corruption | 5 min | 240 min |
| BCP-CYBER-03 | Ransomware / cyber incident | 15 min | 480 min |

Restore procedure: provision shadow cluster → PITR to target timestamp → run
`GET /api/v1/system/self-test` to verify the audit hash chain → reconcile financial control totals
→ cut over → record an audit entry and notify governance. **A backup that has never been restored
successfully is not considered reliable.**

## Change management

Every architectural change requires proposal, impact analysis, dependency analysis, security
analysis, compliance analysis, migration plan, rollback plan, test plan, approval, implementation,
validation and an audit record (ADR in `platform.architecture_decisions`).

## Incident response

1. Detect (monitoring, anomaly signals, user report).
2. Triage and classify severity; open a risk/anomaly record.
3. Contain — revoke sessions, disable feature flags, isolate integrations.
4. Eradicate and recover per the relevant continuity plan.
5. Notify — regulators and data subjects within statutory windows where applicable.
6. Post-incident review; corrective actions tracked as compliance remediation.

## Runbooks

See `docs/runbooks/`.
