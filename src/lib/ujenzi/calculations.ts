/**
 * Governed calculation families. Only defensible, unit-checked methods.
 * Results are NEVER professionally certified.
 */
export type CalcFamily = "SIMPLE_UDL_BEAM_MOMENT" | "MANNING_FLOW" | "TERZAGHI_BEARING";

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
    family: "SIMPLE_UDL_BEAM_MOMENT" as const,
    inputs: { w: input.w, L: input.L },
    units: { w: input.wUnit, L: input.LUnit, M: "N.m" },
    result: { M_max_Nm: momentNm },
    warnings,
    professionalCertification: "NOT_CERTIFIED",
  };
}

/** Manning Q = (1/n) A R^(2/3) S^(1/2). SI units only. */
export function runManningFlow(input: { n: number; A: number; R: number; S: number }): CalcRun {
  if (!(input.n > 0) || !(input.A > 0) || !(input.R > 0) || !(input.S > 0)) {
    throw new Error("INVALID_INPUT:positive_required");
  }
  const Q = (1 / input.n) * input.A * Math.pow(input.R, 2 / 3) * Math.sqrt(input.S);
  return {
    family: "MANNING_FLOW",
    inputs: input,
    units: { n: "1", A: "m2", R: "m", S: "1", Q: "m3/s" },
    result: { Q_m3s: Q },
    warnings: [],
    professionalCertification: "NOT_CERTIFIED",
  };
}

/** Terzaghi q_ult = c Nc + q Nq + 0.5 γ B Nγ. Factors must be supplied. */
export function runTerzaghiBearing(input: {
  c: number;
  q: number;
  gamma: number;
  B: number;
  Nc: number;
  Nq: number;
  Ngamma: number;
}): CalcRun {
  const vals = Object.values(input);
  if (vals.some((v) => !Number.isFinite(v) || v < 0)) throw new Error("INVALID_INPUT");
  const qUlt = input.c * input.Nc + input.q * input.Nq + 0.5 * input.gamma * input.B * input.Ngamma;
  return {
    family: "TERZAGHI_BEARING",
    inputs: input,
    units: { c: "kPa", q: "kPa", gamma: "kN/m3", B: "m", q_ult: "kPa" },
    result: { q_ult_kPa: qUlt },
    warnings: ["Bearing factors must come from a cited chart/standard; not derived here."],
    professionalCertification: "NOT_CERTIFIED",
  };
}
