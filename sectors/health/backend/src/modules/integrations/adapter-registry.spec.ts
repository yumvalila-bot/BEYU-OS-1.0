import { describe, it, expect } from "@jest/globals";
import {
  AdapterRegistry,
  STUB_ADAPTERS,
  registerStubAdapters,
} from "./adapter-registry";
import { DomainError } from "../../common/errors/domain.error";

describe("AdapterRegistry (Phase 2Z)", () => {
  it("fail-closed stubs are registered for every external provider and refuse to call", async () => {
    const r = new AdapterRegistry();
    registerStubAdapters(r);
    const statuses = await r.probeAll();
    expect(statuses.length).toBe(STUB_ADAPTERS.length);
    for (const s of statuses) {
      expect(s.state).toBe("unavailable");
      expect(s.missing_fields.length).toBeGreaterThan(0);
    }
    const nhif = r.get("nhif");
    expect(nhif).not.toBeNull();
    await expect(nhif!.call({})).rejects.toBeInstanceOf(DomainError);
  });

  it("unknown providers return null (fail-closed, no fabricated adapter)", () => {
    const r = new AdapterRegistry();
    registerStubAdapters(r);
    expect(r.get("bogus_provider" as any)).toBeNull();
  });
});
