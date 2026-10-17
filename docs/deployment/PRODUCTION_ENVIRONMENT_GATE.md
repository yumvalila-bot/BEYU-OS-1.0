# Production environment gate (ADR D2)

Status: **code-enforced in this change; GitHub settings pending owner action.**
Scope: production database migrations, production secrets, and the production runtime DSN diagnostic.
Out of scope: Vercel configuration, DNS, and production data. None of these are modified by this change.

## 1. The rule

A push to `main` never changes the production database.

| Event | What runs | Touches production? |
| --- | --- | --- |
| `pull_request` | CI, build, tests, scratch-PostgreSQL migration proof (`preflight-repo`) | No. No secret is present. |
| `push` to `main` | The same validation as a pull request | No. |
| `workflow_dispatch`, `mode=preflight`, `main` only | Read-only plan (`live-preflight`) | Read-only, through the `Production` environment |
| `workflow_dispatch`, `mode=deploy`, `main` only | Plan, then the human gate, then migrate, verify, PVG, release record | Yes, after approval |
| `schedule` (Mondays 06:00 UTC) and `mode=drift` | Read-only drift report (`drift-report`) | Read-only, through the `Production` environment |
| `runtime-dsn-diagnostic.yml`, `main` only | Read-only probe of the runtime pooler (`select 1`) | Read-only, through the `Production` environment |

Every job that reads `BEYU_ADMIN_DATABASE_URL` or `BEYU_RUNTIME_DB_PASSWORD` declares `environment: Production`.
`tests/security/production-release-gating.test.ts` fails if a job reads a production secret without that binding, or if a push condition reaches a production job.

## 2. What the code enforces (this change)

1. **No automatic production migration.** `deploy`, `release-record`, `runtime-verify` and `pvg` require `workflow_dispatch`, `refs/heads/main` and `mode=deploy`. The `push` clause was removed.
2. **Plan, then apply.** `live-preflight` publishes the pending plan (version, pending migrations, checksums, destructive scan). `deploy` depends on it, and its own environment gate waits for a reviewer.
3. **Attestation before any secret loads.** `deploy` refuses to start unless both inputs are non-empty:
   - `change_reference`: the approved change ticket or PR URL.
   - `backup_reference`: the verified backup or PITR restore point, and the named rollback owner.
4. **Secrets are environment-scoped.** The three production-secret jobs in `db-release.yml`, plus `runtime-dsn-diagnostic.yml`, are bound to `Production`.
5. **The runtime DSN diagnostic cannot exfiltrate the runtime password.** It sends the password only to a Supabase pooler (`*.pooler.supabase.com`, port 5432 or 6543). Any other `DIAG_HOST` is refused before a socket opens (`src/lib/release/diagnostic-target.ts`, `scripts/diagnose-runtime-dsn.mts`). Before this change the dispatch input was unvalidated.
6. **Destructive migrations** still stop the pipeline for explicit approval (`--allow-destructive`, unchanged).

## 3. What the code cannot enforce (owner action required)

These are GitHub repository settings. They cannot be expressed in a workflow file.

**Verified read-only on 2026-10-09 (GitHub environments API):**

| Setting | Observed |
| --- | --- |
| `Production` environment exists | yes |
| Required reviewers / wait timer (`protection_rules`) | **none configured** |
| Deployment branch policy | **none (all branches allowed)** |

**Not readable with the automation token (HTTP 403). Owner must verify by hand:**

- Whether `BEYU_ADMIN_DATABASE_URL` and `BEYU_RUNTIME_DB_PASSWORD` still exist at repository level. If they do, delete them after the environment copies work.
- Branch protection on `main`.

**Required configuration (Settings → Environments → Production):**

1. **Required reviewers:** at least one named human who is not the person who triggers the run. The owner designates them. Do not use a shared or bot account.
2. **Prevent self-review:** enabled, where the plan supports it.
3. **Deployment branches and tags:** "Selected branches", with `main` as the only entry.
4. **Environment secrets:** `BEYU_ADMIN_DATABASE_URL` and `BEYU_RUNTIME_DB_PASSWORD`, created in the `Production` environment. Values are entered by the owner and never recorded in Git, chat, or logs.
5. **Repository secrets:** remove the repository-level copies after one successful `mode=preflight` run that reads through the environment.
6. **Branch protection on `main`:** require pull-request review and passing `BEYU OS CI` checks. Restrict force-push and deletion.

An example request is shown in §6. The reviewer IDs must come from the owner.

## 4. Operating procedure for a production migration

Run only after every item is true:

1. The change is reviewed and merged to `main`. The scratch-database proof is green on that commit (`preflight-repo`).
2. A verified backup or PITR restore point exists for the Supabase project, and its id is recorded.
3. A named human owns rollback. Database rollback is never automatic (see `THREE_WAY_PRODUCTION_ARCHITECTURE.md` §8).
4. Plan first:
   ```
   gh workflow run "BEYU OS — database release (GitHub → Supabase)" --ref main -f mode=preflight
   ```
   Read the `live-preflight` output. Confirm the pending migrations and that the destructive scan is clean.
5. Deploy:
   ```
   gh workflow run "BEYU OS — database release (GitHub → Supabase)" --ref main \
     -f mode=deploy -f change_reference=<ticket-or-PR-URL> -f backup_reference=<restore-point-id>
   ```
   The run stops at the `Production` gate. A reviewer approves it only after reading the plan.
6. After `deploy`: `runtime-verify` confirms the app reports `database: UP`, and `pvg` confirms the release identity. A red `pvg` is a release incident, not a retry.

Never apply the migration by hand against production. Never bypass the gate with a repository-level secret.

## 5. Known trade-offs

- **Scheduled drift runs wait for approval.** `drift-report` is bound to `Production` because it needs the production admin DSN. A scheduled run therefore pauses each Monday until a reviewer approves it. If that is unacceptable, the owner should provision a read-only database role and a separate read-only environment. That is a DBA decision, not something this repository can do alone.
- **Two approvals per deploy.** The plan job and the deploy job each sit behind the gate. This is intentional: the reviewer sees the plan before approving the write.
- **The gate is only as strong as its settings.** Until §3 is complete, `workflow_dispatch` on `main` is reachable by any user with write access, and the only controls are the in-workflow attestation and the scratch proof. The current state is recorded in §3, not assumed to be fixed.

## 6. Example environment configuration (owner runs this)

Not executed by this change. The request body is the documented GitHub REST shape. The owner should check the response against the read-only query in §3. Replace `<REVIEWER_USER_ID>` with the numeric id of the designated reviewer.

```bash
gh api -X PUT repos/yumvalila-bot/BEYU-OS-1.0/environments/Production --input - <<'JSON'
{
  "prevent_self_review": true,
  "reviewers": [ { "type": "User", "id": <REVIEWER_USER_ID> } ],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
}
JSON

# Allow only `main` to deploy to this environment.
gh api -X POST repos/yumvalila-bot/BEYU-OS-1.0/environments/Production/deployment-branch-policies \
  --input - <<'JSON'
{ "name": "main", "type": "branch" }
JSON
```

Create the two environment secrets in the GitHub UI. Do not paste their values into a command, a file, or a chat.
