# Ujenzi Phase 0 — reality audit (evidence-based)

Repository: `BEYU-OS-1.0` on branch `arena/01a0a29b-beyu-os-1-0`.
Baseline commit: `dd6b764`. `main` at audit time: `728adc6`.

## 1. Current-state audit

| Area | Evidence | Status |
|---|---|---|
| Schema | `src/db/schema/ujenzi.ts` + `drizzle/0042` + `0043` | IMPLEMENTED / PARTIAL twin |
| Domain | `src/lib/ujenzi` | IMPLEMENTED core mutations |
| APIs | `/api/v1/ujenzi/{projects,dashboard,sync,calculations,soil,progress,sites,digital-twin,capabilities}` | PARTIAL |
| UI | `/os/ujenzi` | PARTIAL command centre |
| Perms | `ujenzi:data.read\|manage` | IMPLEMENTED |
| RLS | FORCE on all Ujenzi tables | IMPLEMENTED |
| Noelia | observe + project.observe + digital_twin.query | PARTIAL |
| Finance | journalsPosted false; CAP_POSTING LOCKED | IMPLEMENTED |
| Gov | NOT_CONNECTED | HONEST |
| BIM viewer | none | NOT IMPLEMENTED |
| Tests | `tests/ujenzi/os.test.ts` | 16 baseline + twin extension |

**No inner OS created.** Registry `UJENZI_OS` kind `SECTOR_OS`.

## 2. Reuse matrix

| Need | Reuse |
|---|---|
| Identity / RBAC | BEYU `guarded` + `can()` |
| HCM | `hcmEmployeeId` / `globalUserId` links only |
| Finance | events + handoff; never post |
| Documents | platform documents + `ujenzi_documents` pointers |
| Audit / events | `withAuditTransaction` / `enterpriseEvents` |
| Government | Government Integration Fabric |
| Break-glass | `identity:emergency.activate` |
| AI | Noelia / HIVE only |
| Storage | URI + checksum on documents; no fake S3 |

## 3–20. Target / plans (honest)

Target remains one Sector OS. Phases 2–10 in the X10THINK brief stay **PLANNED** except Phase 1 Digital Twin graph (this change).

Production gates A–N: **not claimed**. CI/PR required. No simulated deployment.
