/**
 * Governed calculation families. Only defensible, unit-checked methods.
 * Results are NEVER professionally certified.
 */
export type CalcFamily = "SIMPLE_UDL_BEAM_MOMENT";

export type CalcRun = {
  family: CalcFamily;
  inputs: Record<string, number>;
  units: Record<string, string>;
  result: Record<string, number>;
  warnings: string[];
  professionalCertification: "NOT_CERTIFIED";
};

const LENGTH = new Set(["m", "mm"]);
const FORCE_PER_LENGTH = new Set(["N/m", "kN/m"]);

export function runSimpleUdlBeamMoment(input: { w: number; L: number; wUnit: string; LUnit: string }): CalcRun {
  const warnings: string[] = [];
  if (!FORCE_PER_LENGTH.has(input.wUnit)) {
    throw new Error(`INCOMPATIBLE_UNIT:w:${input.wUnit}`);
  }
  if (!LENGTH.has(input.LUnit)) {
    throw new Error(`INCOMPATIBLE_UNIT:L:${input.LUnit}`);
  }
  if (!(input.w > 0) || !(input.L > 0)) {
    throw new Error("INVALID_INPUT:positive_required");
  }
  let w = input.w;
  let L = input.L;
  if (input.wUnit === "kN/m") w = w * 1000;
  if (input.LUnit === "mm") L = L / 1000;
  // Simply supported UDL: M_max = w L^2 / 8  (N·m)
  const momentNm = (w * L * L) / 8;
  if (L > 50) warnings.push("Span exceeds typical building beam range; review required.");
  return {
    family: "SIMPLE_UDL_BEAM_MOMENT",
    inputs: { w: input.w, L: input.L },
    units: { w: input.wUnit, L: input.LUnit, M: "N.m" },
    result: { M_max_Nm: momentNm },
    warnings,
    professionalCertification: "NOT_CERTIFIED",
  };
}
