# Immutable appointment human provenance (0054)

Shared governance remains part of the constitutional control plane, not a new OS.
This increment hardens existing appointments before initial-composition extension;
it does not activate dormant bodies or bypass the superior-authority bootstrap gap.

## Why snapshots

An account's current party mapping is not evidence of the person who previously
nominated or approved an appointment. Existing identity constraints require a
unique, non-null party binding, but do not make historical mappings immutable.
0054 snapshots `nominatedByPartyId` and `approvedByPartyId` from the server's
current authenticated human authority. They are not accepted from client input.
Approval must remain independent of the original nominating person, their account,
and the nominee. The prior current-nominator check is retained as an additional
conservative restriction, not used as a replacement for historical evidence.

The existing transaction, authority/constitution/policy/decision/composition,
consent, overlap, revision, RLS, audit/event and activation controls remain in force.
The snapshots are included in existing audit/event payloads, without duplicate
material events. No RBAC, security, Finance or delegated authority is granted.

## Database and compatibility

Two nullable foreign keys preserve old records without guessed backfill. An
additional **invoker** trigger checks active human actor identity, independently
checks approval separation, and prevents changing recorded party provenance.
It does not remove an existing guard, add SECURITY DEFINER or relax any body,
membership, appointment, decision, tenant/entity/country/classification policy.
All 0000–0053 migration bytes are unchanged.

Unknown historical provenance cannot progress to approval, consent or activation:
create a new nomination and genuine linked decision instead. Previously active
members and appointment history are not rewritten or deactivated by this migration.
A genuine nominee may still decline a legacy approved/accepted appointment subject
to the existing scoped instrument/identity/decision checks. No new authority follows.

Deployment must coordinate the compatible application and migration. Old writers
cannot supply the required evidence and fail closed. This is structurally additive,
not a claim of mixed-version writer compatibility. No production promotion is
performed by this engineering change.

## Evidence and retry semantics

Tests exercise actual runtime-role SQL, service and HTTP boundaries, account
reassignment while retaining identity constraints, immutable approval provenance,
unknown legacy evidence, and a real 0000–0053 → 0054 upgrade/no-op replay. Browser
coverage attempts approval after identity reassignment on an already-rendered form,
then restores legitimate independent authority and retries unchanged.

The appointment UI now retains the idempotency key after a denial, as the charter
UI already does. A denial cannot disprove an earlier lost successful response.
An edited intention receives a new key; an unchanged retry retains request identity.
The backend, never visible controls or notifications, determines authority.
