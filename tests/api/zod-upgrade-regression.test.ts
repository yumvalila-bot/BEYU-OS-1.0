import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("Zod 4 migration compatibility", () => {
  it("rejects an oversized bounded array without creating an issue per element", () => {
    const result = z.array(z.number()).max(10).safeParse(Array(100_000).fill("invalid"));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toHaveLength(1);
  });

  it("keeps migrated enum-key records partial and rejects unknown keys", () => {
    const schema = z.partialRecord(z.enum(["one", "two"]), z.number());
    expect(schema.safeParse({ one: 1 }).success).toBe(true);
    expect(schema.safeParse({ one: 1, other: 2 }).success).toBe(false);
  });
});
