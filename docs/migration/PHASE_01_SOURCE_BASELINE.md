# PHASE 01 — SOURCE BASELINE (`BEYU-OS-`)

Date: 2026-09-05 (fresh run)
Full SHA: `b9c94d4f8ce7c3466cc3c27242eaa6a1650f0b72`
Clone: `/tmp/BEYU-OS-src`

## Environment

| Component | Value |
|---|---|
| Node | v22.22.3 |
| pnpm | 9.12.3 (installed) |
| Turbo | 2.10.9 |
| Prisma postinstall | FAILED (binaries.prisma.sh unreachable) |
| Flutter | not present |

## Commands and results (fresh)

| Command | Result |
|---|---|
| `pnpm install --no-frozen-lockfile` | PASS (394 pkgs, Prisma postinstall error recorded) |
| `pnpm typecheck` | PASS — 17/17 tasks |
| `pnpm build` | PASS — 11/11 tasks |
| `pnpm lint` | FAIL — 298 problems (69 errors, 229 warnings) |
| `pnpm exec turbo run test --force` | PASS — 14/14 tasks; 299 tests / 0 fail / 0 skipped |

Per-project test counts (measured):

| package | tests |
|---|---|
| `@beyu/config` | 18 |
| `@beyu/types` | 30 |
| `@beyu/events` | 18 |
| `@beyu/auth` | 43 |
| `@beyu/security` | 34 |
| `@beyu/health-api` | 7 |
| `@beyu/api` | 149 |
| `@beyu/health-types` | 0 |
| others | 0 |
| **total** | **299** |

## Capability comparison

| Area | Source status | Evidence |
|---|---|---|
| Monorepo boundaries | Strong | `apps/ services/ packages/` |
| Shared contracts | Strong | `packages/types`, `events`, `auth`, `security`, `health-types`, `health-api-client` |
| Control-plane API | 149 tests | `services/beyu-api` |
| Health API | 28 modules / 11 migrations / **7 tests** | `services/beyu-health-api` |
| Health web | 22 routes / 0 tests | `apps/beyu-health-web` |
| Mobile | SCAFFOLD (pubspec only) | `apps/beyu-health-mobile` |
| Finance / CAP_POSTING | MISSING | none |
| Family Office | MISSING | none |
| CI/CD | MISSING | no `.github/workflows` |
| Deployment infra | PARTIAL | docker/k8s/terraform/supabase/vercel |

Status: **BASELINED**. Source is NOT a drop-in replacement for the destination.
