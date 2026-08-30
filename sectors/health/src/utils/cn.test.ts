import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn() class-composition helper", () => {
  it("joins truthy class strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("merges conflicting Tailwind utilities (last wins)", () => {
    // twMerge should keep only the final px-4 (not px-2)
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
