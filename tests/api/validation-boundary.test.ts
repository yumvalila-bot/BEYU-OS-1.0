import { describe, expect, it } from "vitest";
import { z } from "zod";
import { normalizeApplicationBoundaryError } from "../../src/lib/api";

describe("application validation boundary", () => {
  it("normalizes a local ZodError into the canonical 422 application error", () => {
    const error = z.object({ question: z.string().min(3) }).safeParse({ question: "x" });
    expect(error.success).toBe(false);
    if (error.success) return;

    expect(normalizeApplicationBoundaryError(error.error)).toEqual({
      code: "VALIDATION_FAILED",
      message: "Request payload failed schema validation.",
      status: 422,
      details: [
        {
          code: "too_small",
          path: ["question"],
          message: "String must contain at least 3 character(s)",
        },
      ],
    });
  });

  it("normalizes a ZodError shape crossing a production bundle boundary", () => {
    const foreignPrototype = { constructor: { name: "ForeignZodError" } };
    const foreign = Object.assign(Object.create(foreignPrototype), {
      name: "ZodError",
      message: "must remain untouched",
      stack: "sensitive internal stack",
      issues: [{ code: "invalid_type", path: ["question"], message: "Required", sql: "select secret" }],
    });

    const normalized = normalizeApplicationBoundaryError(foreign);

    expect(foreign.message).toBe("must remain untouched");
    expect(Object.getPrototypeOf(foreign)).toBe(foreignPrototype);
    expect(normalized).toEqual({
      code: "VALIDATION_FAILED",
      message: "Request payload failed schema validation.",
      status: 422,
      details: [{ code: "invalid_type", path: ["question"], message: "Required" }],
    });
    expect(JSON.stringify(normalized)).not.toContain("stack");
    expect(JSON.stringify(normalized)).not.toContain("select secret");
  });

  it("does not misclassify arbitrary infrastructure errors as validation failures", () => {
    expect(normalizeApplicationBoundaryError(new Error("database connection failed"))).toBeNull();
    expect(normalizeApplicationBoundaryError({ name: "ZodError", issues: [{ sql: "select secret" }] })).toBeNull();
  });
});
