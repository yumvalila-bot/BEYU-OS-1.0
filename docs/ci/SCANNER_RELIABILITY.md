# CI scanner hardening — review evidence and open blockers

Status: **incomplete; do not treat this change as proof of CI or release readiness.**
Baseline main: `2e534621aa514a74410b2640b955ef081c2754d9`.

## Observed baseline

- [CI #878](https://github.com/yumvalila-bot/BEYU-OS-1.0/actions/runs/45097194216) completed successfully, including both real PostgreSQL gates, P3, frontend and critical-only dependency audits.
- [Database-release #807](https://github.com/yumvalila-bot/BEYU-OS-1.0/actions/runs/45097194146) completed successfully: scratch validation and read-only production preflight passed. Drift-report and deployment jobs were skipped by their conditions. This does not approve deployment or certify production drift status.
- Prior branch commits `a92a6e5` and `ea2961f` passed [PR CI #879](https://github.com/yumvalila-bot/BEYU-OS-1.0/actions/runs/45110306291) and [#880](https://github.com/yumvalila-bot/BEYU-OS-1.0/actions/runs/45116778216), respectively. This is one execution per commit, not a stability proof for later changes.
- CI #874 and #875 failed at the credential literal step. GitHub job metadata was accessible; historical log download failed in the investigation environment, so individual historical lines, exact command exit codes and timestamps were not verified here.
- The DB-free P3 invocation locally passed 225 tests and skipped six database-dependent `tests/release/store.test.ts` tests. They are deliberately skipped when no DB URL is configured and require the separate PostgreSQL root gate; a DB-free pass must not be reported as a pass for those six tests.

## Narrow corrections in this change

The literal and template checks previously printed entire matching lines, potentially exposing a secret in Actions logs. They now emit paths only. All four scan layers now treat a `grep` error as failure rather than as a clean scan. The filename check blocks `.env` and `.env.*` generally; only the three existing explicitly named example templates are exempt, and all three are checked. The template character class now uses POSIX whitespace syntax instead of treating the letter `s` as an excluded character. Existing high-confidence patterns and the bounded history check remain in place.

`node --test tests/ci/secret-scan-redaction.test.mjs` runs the actual embedded workflow commands against disposable Git repositories and synthetic data. It covers redaction, error propagation, tracked `.env` variants, a private key marker, a GitHub token, a removed recent-history token, environment-variable references, shell literals, an API-key literal, a generated credential, and short template values. The CI job runs this suite before the scanner itself.

The literal scan additionally recognizes exact `api_key`, `API_KEY` and `apiKey` assignment names. In `.sh` files it exempts only a complete double-quoted variable reference or `$(openssl rand -hex N)` / `$(openssl rand -base64 N)` value (positive integer N); a single-quoted or mixed generated/literal value is still blocked. This narrow syntax-based exception is not a general proof that every shell command is random. Template credential fields may be empty, exactly `CHANGE_ME`, or a single `${VARIABLE}` reference; other values, even short values, fail without being printed. The earlier heuristic still applies independently.

Two additive checks cover uppercase credential assignment names in tracked source and credential assignments added in the most recent 200 commits under `src/`, `scripts/` and `tests/`. The history check inspects each selected commit (including merge-parent diffs) without logging patch content. Failures to read files or Git history fail the gate. Both checks retain all existing high-confidence scanning independently.

The uppercase check has seven narrowly pinned synthetic/contextual source lines: each exception matches both a specific path and SHA-256 of the entire line. The historical check has three line hashes limited to `scripts/infra/codespaces-bootstrap.sh` at three explicitly named commits: two ephemeral development literals and one Node crypto generation expression. These are not directory, identifier, marker, or generic fixture exclusions; changed lines and new commits are not exempt. **Security review of each pinned exception is required.** The regression suite verifies a changed fixture and newly introduced synthetic history fail.

## Blocking limitations

- Only the narrowly specified `openssl rand` form is recognized as generated; other generators can still be flagged. The `.sh` exception is syntax-based, not a full shell parser. Assignment rules do not cover every object-property, language syntax or credential field; short source literals are not all detected. Do not broadly exclude scripts, fixtures or variable names to suppress findings.
- The supplemental template rule only covers recognizable credential field names and straightforward dotenv assignments; embedded connection-string credentials and unusual syntax still need separate review. High-confidence patterns remain a separate layer.
- Generic history detection covers added assignment lines in source, scripts and tests, not all syntaxes, paths, or full history. Its exact historical exceptions require human security review. A passing bounded scan is not a full-history audit.
- `git grep` excludes the three named lockfiles from high-confidence scanning. Existing behavior was preserved, not independently certified.
- CI fetches full history and scans up to 200 commits. An initial local check inspected only a shallow checkout; the checkout was subsequently deepened for historical investigation. No three-run final-commit stability proof exists yet.
- On this 3.8 GiB sandbox, concurrently launched root typecheck and lint did not finish within 300 seconds; the lingering typecheck was stopped. Both passed when subsequently executed sequentially with a 3072 MB heap, with one lint warning. This is not evidence of a GitHub runner bottleneck.
- The local critical-only production audit passed its policy threshold but reported a high-severity Zod advisory. Assess remediation separately; do not equate the critical-only policy with zero vulnerabilities.
- GitHub annotated the baseline with Node 20 action-runtime deprecation/forced Node 24 warnings. Verify replacement action releases and immutable SHAs before updating pins.

## Release boundary

No change is made to `db-release.yml`: PRs validate scratch migrations; the main push may perform read-only preflight; production deployment remains an explicit dispatch and Production environment gate. Schema fingerprint and ordered migration-ledger fingerprint are distinct evidence. Build, test, deploy, PVG, canary and promote remain separate, and no CI or scratch result is production authorization.
