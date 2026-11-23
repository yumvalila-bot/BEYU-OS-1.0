# CI scanner hardening — review evidence and open blockers

Status: **incomplete; do not treat this change as proof of CI or release readiness.**
Baseline main: `2e534621aa514a74410b2640b955ef081c2754d9`.

## Observed baseline

- [CI #878](https://github.com/yumvalila-bot/BEYU-OS-1.0/actions/runs/45097194216) completed successfully, including both real PostgreSQL gates, P3, frontend and critical-only dependency audits.
- [Database-release #807](https://github.com/yumvalila-bot/BEYU-OS-1.0/actions/runs/45097194146) completed successfully: scratch validation and read-only production preflight passed. Drift-report and deployment jobs were skipped by their conditions. This does not approve deployment or certify production drift status.
- At prior branch commit `a92a6e56570b3ec2f46fa1a21be4ab599e2ecf90`, [PR CI #879](https://github.com/yumvalila-bot/BEYU-OS-1.0/actions/runs/45110306291) and [scratch validation #808](https://github.com/yumvalila-bot/BEYU-OS-1.0/actions/runs/45110306186) passed. This is one execution on that commit, not a stability proof for later changes.
- CI #874 and #875 failed at the credential literal step. GitHub job metadata was accessible; historical log download failed in the investigation environment, so individual historical lines, exact command exit codes and timestamps were not verified here.
- The DB-free P3 invocation locally passed 225 tests and skipped six database-dependent `tests/release/store.test.ts` tests. They are deliberately skipped when no DB URL is configured and require the separate PostgreSQL root gate; a DB-free pass must not be reported as a pass for those six tests.

## Narrow corrections in this change

The literal and template checks previously printed entire matching lines, potentially exposing a secret in Actions logs. They now emit paths only. All four scan layers now treat a `grep` error as failure rather than as a clean scan. The filename check blocks `.env` and `.env.*` generally; only the three existing explicitly named example templates are exempt, and all three are checked. The template character class now uses POSIX whitespace syntax instead of treating the letter `s` as an excluded character. Existing high-confidence patterns and the bounded history check remain in place.

`node --test tests/ci/secret-scan-redaction.test.mjs` runs the actual embedded workflow commands against disposable Git repositories and synthetic data. It covers redaction, error propagation, tracked `.env` variants, a private key marker, a GitHub token, a removed recent-history token, environment-variable references, shell literals, an API-key literal, a generated credential, and short template values. The CI job runs this suite before the scanner itself.

The literal scan additionally recognizes exact `api_key`, `API_KEY` and `apiKey` assignment names. In `.sh` files it exempts only a complete double-quoted variable reference or `$(openssl rand -hex N)` / `$(openssl rand -base64 N)` value (positive integer N); a single-quoted or mixed generated/literal value is still blocked. This narrow syntax-based exception is not a general proof that every shell command is random. Template credential fields may be empty, exactly `CHANGE_ME`, or a single `${VARIABLE}` reference; other values, even short values, fail without being printed. The earlier heuristic still applies independently.

## Blocking limitations

- Only the narrowly specified `openssl rand` form is recognized as generated; other generators, including the historical Node crypto bootstrap expression, can still be flagged. The `.sh` exception is syntax-based, not a full shell parser, and should be reviewed before treating it as a general credential classifier. API-key detection is limited to the exact assignment names described above, not every prefixed variable, object-property or language syntax. Do not broadly exclude scripts, fixtures or variable names to suppress findings.
- The supplemental template rule only covers recognizable credential field names and straightforward dotenv assignments; embedded connection-string credentials and unusual syntax still need separate review. High-confidence patterns remain a separate layer.
- History detection is limited to the existing high-confidence pattern set and 200 commits; a generic password removed from history is not covered. In a local investigation of the last 200 commits, a naive expansion of the current literal regex to added lines flagged three historical bootstrap assignments in `scripts/infra/codespaces-bootstrap.sh`, including explicitly ephemeral development literals and a generated Node crypto value. These are not grounds for a broad allowlist. A value-aware historical scanner with synthetic fixtures and a reviewed treatment of historical bootstrap data is still needed. A passing recent-history scan is not a full-history audit.
- `git grep` excludes the three named lockfiles from high-confidence scanning. Existing behavior was preserved, not independently certified.
- CI fetches full history and scans up to 200 commits. An initial local check inspected only a shallow checkout; the checkout was subsequently deepened for historical investigation. No three-run final-commit stability proof exists yet.
- On this 3.8 GiB sandbox, concurrently launched root typecheck and lint did not finish within 300 seconds; the lingering typecheck was stopped. This is not a diagnosed GitHub runner bottleneck, and neither local check is reported as passed. Baseline #878 did pass both.
- The local critical-only production audit passed its policy threshold but reported a high-severity Zod advisory. Assess remediation separately; do not equate the critical-only policy with zero vulnerabilities.
- GitHub annotated the baseline with Node 20 action-runtime deprecation/forced Node 24 warnings. Verify replacement action releases and immutable SHAs before updating pins.

## Release boundary

No change is made to `db-release.yml`: PRs validate scratch migrations; the main push may perform read-only preflight; production deployment remains an explicit dispatch and Production environment gate. Schema fingerprint and ordered migration-ledger fingerprint are distinct evidence. Build, test, deploy, PVG, canary and promote remain separate, and no CI or scratch result is production authorization.
