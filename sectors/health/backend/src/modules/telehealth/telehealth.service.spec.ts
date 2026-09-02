import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import { TelehealthRepository } from "./telehealth.repository";
import { TelehealthService } from "./telehealth.service";
import { DomainError } from "../../common/errors/domain.error";

describe("TelehealthService", () => {
  let bed: TestBed;
  let svc: TelehealthService;

  beforeAll(async () => {
    bed = await buildTestBed();
    const repo = new TelehealthRepository(bed.conn, bed.tenantCtx);
    svc = new TelehealthService(repo, bed.audit, bed.conn, bed.tenantCtx);
  });

  it("fail-closed: video_provider token/URL are NULL until integration is configured", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const s = (await svc.createSession({
        patient_id: p.patient_id,
        scheduled_start: new Date(Date.now() + 3600_000).toISOString(),
        reason: "Follow-up",
        consent_obtained: true,
      })) as any;
      expect(s.session_id).toBeTruthy();
      expect(s.provider_token).toBeNull();
      expect(s.patient_token).toBeNull();
      expect(s.patient_url).toBeNull();
      expect(s.provider_url).toBeNull();
    }));

  it("state machine requested->confirmed->in_progress->completed computes duration_sec", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const s = (await svc.createSession({
        patient_id: p.patient_id,
        scheduled_start: new Date(Date.now() + 3600_000).toISOString(),
        reason: "Acute",
        consent_obtained: true,
      })) as any;
      await svc.transition(s.session_id, "confirmed");
      await svc.transition(s.session_id, "in_progress");
      // Mark a started_at in the past so duration is non-zero after complete.
      await bed.conn.query(
        `UPDATE health.telehealth_sessions SET started_at=now() - interval '10 minutes' WHERE session_id=$1`,
        [s.session_id],
      );
      const fin = (await svc.transition(s.session_id, "completed")) as any;
      expect(fin.status).toBe("completed");
      expect(Number(fin.duration_sec)).toBeGreaterThanOrEqual(590);
    }));

  it("rejects invalid state transition (e.g., completed before in_progress)", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const s = (await svc.createSession({
        patient_id: p.patient_id,
        scheduled_start: new Date(Date.now() + 3600_000).toISOString(),
        reason: "x",
        consent_obtained: true,
      })) as any;
      await expect(
        svc.transition(s.session_id, "completed"),
      ).rejects.toBeInstanceOf(DomainError);
    }));

  it("blocks session creation when consent_obtained is false", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      await expect(
        svc.createSession({
          patient_id: p.patient_id,
          scheduled_start: new Date().toISOString(),
          reason: "x",
          consent_obtained: false,
        }),
      ).rejects.toBeInstanceOf(DomainError);
    }));
});
