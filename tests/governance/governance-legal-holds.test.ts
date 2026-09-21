import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { governanceLegalHolds } from "@/db/schema";
import {
  applyLegalHold,
  isBodyUnderLegalHold,
  releaseLegalHold,
} from "@/lib/governance/legal-hold-service";
import { appointmentFixture, cleanupAppointments, asAppointmentActor as as } from "../helpers/appointments";

describe("Governed Legal Hold Registry", () => {
  let f: Awaited<ReturnType<typeof appointmentFixture>>;

  beforeAll(async () => {
    f = await appointmentFixture("HOLD_TEST");
  });

  afterAll(async () => {
    await db.delete(governanceLegalHolds).where(eq(governanceLegalHolds.bodyId, f.bodyId));
    await cleanupAppointments("HOLD_TEST");
  });

  it("applies and releases legal hold with audit justification", async () => {
    // 1. Initially body is not under legal hold
    const initialHold = await isBodyUnderLegalHold(f.bodyId);
    expect(initialHold).toBe(false);

    // 2. Apply legal hold
    const hold = await as(f.chair, () =>
      applyLegalHold(f.chair, {
        bodyId: f.bodyId,
        holdTitle: "Regulatory Inquiry Legal Hold — Tax Compliance Review",
        holdReason: "Formal regulatory audit preservation of all resolutions and board minutes",
        matterReference: "REG-AUDIT-2026-09",
      }),
    );

    expect(hold.id).toMatch(/^GLH_/);
    expect(hold.status).toBe("ACTIVE");

    // 3. Verify body is now under legal hold
    const underHold = await isBodyUnderLegalHold(f.bodyId);
    expect(underHold).toBe(true);

    // 4. Release legal hold
    const released = await as(f.chair, () =>
      releaseLegalHold(f.chair, {
        holdId: hold.id,
        releaseJustification: "Regulatory inquiry concluded with zero findings; preservation order lifted",
      }),
    );

    expect(released.status).toBe("RELEASED");
    expect(released.releasedAt).toBeTruthy();
    expect(released.releaseJustification).toBeTruthy();

    // 5. Verify body is no longer under legal hold
    const finalHold = await isBodyUnderLegalHold(f.bodyId);
    expect(finalHold).toBe(false);
  });
});
