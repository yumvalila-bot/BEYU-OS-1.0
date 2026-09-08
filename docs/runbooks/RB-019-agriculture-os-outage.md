# RB-019: Agriculture OS Outage

**Severity:** P1  
**Trigger:** Agriculture OS API unreachable, harvest recording failing, or offline sync backlog growing  
**Last Tested:** NOT_TESTED  
**Owner:** Agriculture OS Lead + SRE  
**Status:** IMPLEMENTED — Agriculture OS is a first-class sector OS under BEYU OS (`os_registry.AGRICULTURE_OS` lifecycle ACTIVE in seed source).

## 1. Detection

- `/api/v1/agriculture/dashboard` health/auth failures
- Harvest POST (`/api/v1/agriculture/harvests`) 5xx or sustained 409/403
- Offline envelope ingest (`/api/v1/agriculture/sync`) failing; device queues not draining
- Missing `HARVEST_RECORDED` events for recorded harvests
- User reports (field operators, sector operators)
- Web `/os/agriculture` denied or empty when the principal holds `agriculture:data.read`

## 2. Immediate Response

```bash
# Control-plane health
# curl -s {beyu_os_url}/api/health | jq .

# Agriculture dashboard (authenticated session)
# curl -s {beyu_os_url}/api/v1/agriculture/dashboard | jq .

# Confirm CAP_POSTING remains LOCKED — do not unlock it as a workaround
# psql "$BEYU_ADMIN_DATABASE_URL" -c \
#   "select capability_code, activation_status from governance_capability_registry where capability_code = 'CAP_POSTING';"

# Communication
# Channel: #incidents + #agriculture-os
# Message: [P1] Agriculture OS outage - {scope} - investigating
```

## 3. Containment

- Keep field operations on paper / device offline envelopes. Do **not** invent a second harvest ledger.
- Queue harvests and observations through `POST /api/v1/agriculture/sync` (idempotent `envelopeId` 8–128). Replays must return 200, not a second row.
- Notify sector operators and farm supervisors.
- Pause non-urgent what-if / capital-case submissions.
- **Finance boundary:** do not post journals, do not insert `capital_requests`, do not call `authorizeCapitalRequestGovernance` or the posting engine from Agriculture OS. Harvests emit `HARVEST_RECORDED` only.

## 4. Resolution

- Restore Agriculture API and PostgreSQL RLS-bound runtime role.
- Confirm 0034 agriculture tables exist and FORCE RLS is on (`agriculture_%`, 77 tables).
- Drain the offline envelope queue; verify unique `(tenant_id, envelope_id)`.
- Verify `HARVEST_RECORDED` events for in-scope harvests; `journal_entries` count must be unchanged.
- Confirm `CAP_POSTING.activation_status = LOCKED`.
- Resume normal operations.

## 5. Operational safety (not clinical)

Agriculture OS is operational truth for land, crops, livestock and harvests. It is not a clinical system and it is not financial truth.

If an outage coincides with a live harvest window:

- Escalate to P1 immediately (already the default).
- Activate paper field sheets; later reconcile via idempotent sync envelopes.
- Do not fabricate yield, journals, or capital execution to “catch up”.
- Document every manual intervention for audit.

## 6. Finance / CAP_POSTING lock

| Must | Must not |
| --- | --- |
| Emit `HARVEST_RECORDED` | Insert `journal_entries` / `journal_lines` |
| Submit `agriculture_capital_cases` with `financeHandoff = SUBMITTED_PENDING_FINANCE` | Insert `capital_requests` or execute capital |
| Keep `CAP_POSTING` LOCKED | Unlock posting, self-approve, or bypass Finance OS |

What-if runs are `SIMULATION` / epistemic `SCENARIO`. They are never forecasts and never financial truth.

## 7. Rollback / degrade

- Web: `/os/agriculture` remains permission-gated (`agriculture:data.read`). Unauthorized users stay denied.
- Mobile: offline envelopes stay in `flutter_secure_storage` until the API accepts them.
- Do not disable CI, RLS, or audit to restore availability.

## References

- Architecture: [agriculture-os.md](../architecture/agriculture-os.md)
- [RB-001: General Incident Response](./RB-001-incident-response.md)
- [RB-011: CAP_POSTING Incident](./RB-011-cap-posting-incident.md)
- [RB-018: Health OS Outage](./RB-018-health-os-outage.md)
