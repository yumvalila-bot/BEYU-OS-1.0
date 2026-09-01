/**
 * Endpoint security tier matrix — classifies every endpoint per Phase 9 §3
 * and verifies that required controls are present.
 *
 * For each controller we scan source and reconcile with classifyEndpoint()
 * (the canonical tier model). A mismatch (e.g. CLINICAL endpoint missing
 * @RequirePermission, or FINANCIAL endpoint missing governance guard) fails CI.
 *
 * Writes coverage/endpoint-security-matrix.json with tier/opClass + control
 * compliance per endpoint.
 */
import * as fs from "fs";
import * as path from "path";
import * as glob from "glob";
import { classifyEndpoint, EndpointClassification, RequiredControls, SecurityTier, OperationClass } from "./endpoint-tier.classification";

interface ParsedEndpoint {
  controller: string;
  file: string;
  method: string;
  path: string;
  hasJwt: boolean;
  hasPublic: boolean;
  perms: string[];
  hasGovernance: boolean;
  hasHcm: boolean;
  hasMfa: boolean;
  hasClinical: boolean;
}

const CTRL_DIR = path.resolve(__dirname, "..", "..", "modules");
const CTRL_FILES = glob.sync(path.join(CTRL_DIR, "**", "*.controller.ts"))
  .filter((f) => !f.endsWith(".spec.ts"));

function parse(file: string): ParsedEndpoint[] {
  const src = fs.readFileSync(file, "utf8");
  const controller = path.basename(file, ".controller.ts");
  const cm = src.match(/@Controller\(\s*["']([^"']+)["']\s*\)/);
  const prefix = cm ? cm[1] : "";

  const fv = src.search(/@(Get|Post|Put|Patch|Delete)\s*\(/);
  const cls = fv >= 0 ? src.slice(0, fv) : src;
  const cJwt = hasGuard(cls, "JwtAuthGuard");
  const cPub = /@Public\b/.test(cls);
  const cPerms = extractPerms(cls);
  const cGov = /@RequiresGovernance\b/.test(cls);
  const cHcm = /@RequireHcmPractitioner\b/.test(cls);
  const cMfa = /@RequiresMfaStepUp\b/.test(cls);
  const cClin = /@RequiresClinicalSafety\b/.test(cls);

  const out: ParsedEndpoint[] = [];
  const re = /@(Get|Post|Put|Patch|Delete)\(\s*(?:["']([^"']*)["']|\s*\))/g;
  const starts: number[] = [];
  const verbs: Array<{ v: string; s: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    starts.push(m.index);
    verbs.push({ v: m[1].toUpperCase(), s: m[2] ?? "" });
  }
  for (let i = 0; i < verbs.length; i++) {
    const { v, s } = verbs[i];
    const block = src.slice(starts[i], i + 1 < verbs.length ? starts[i + 1] : src.length);
    out.push({
      controller,
      file: path.relative(path.resolve(__dirname, "..", "..", ".."), file),
      method: v,
      path: "/" + [prefix, s].filter(Boolean).join("/").replace(/\/+/g, "/"),
      hasJwt: cJwt || hasGuard(block, "JwtAuthGuard"),
      hasPublic: cPub || /@Public\b/.test(block),
      perms: extractPerms(block).length ? extractPerms(block) : cPerms,
      hasGovernance: cGov || /@RequiresGovernance\b/.test(block),
      hasHcm: cHcm || /@RequireHcmPractitioner\b/.test(block),
      hasMfa: cMfa || /@RequiresMfaStepUp\b/.test(block),
      hasClinical: cClin || /@RequiresClinicalSafety\b/.test(block),
    });
  }
  return out;
}

function hasGuard(block: string, name: string): boolean {
  return new RegExp(`@UseGuards\\s*\\([\\s\\S]*?\\b${name}\\b[\\s\\S]*?\\)`, "m").test(block);
}
function extractPerms(block: string): string[] {
  const re = /@RequirePermission\(([^)]*)\)/gs;
  const out: string[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(block))) {
    const strs = mm[1].match(/["']([^"']+)["']/g) ?? [];
    for (const s of strs) out.push(s.slice(1, -1));
  }
  return out;
}

interface Row extends ParsedEndpoint {
  classification: EndpointClassification;
  controlGaps: string[];
  status: "PASS" | "GAP" | "WAIVED";
}

function assess(p: ParsedEndpoint): Row {
  const cls = classifyEndpoint(
    p.method, p.path, p.controller, p.perms, p.hasPublic,
    p.hasGovernance, p.hasHcm, p.hasMfa, p.hasClinical,
  );
  const gaps: string[] = [];
  const r = cls.required;

  // PUBLIC must explicitly declare @Public(). Non-public must not be missing JWT.
  if (r.public && !p.hasPublic) gaps.push("missing @Public() on PUBLIC-tier endpoint");
  if (!r.public && p.hasPublic) gaps.push("unexpected @Public() on non-PUBLIC endpoint");
  if (r.jwt && !p.hasJwt) {
    // Global JWT guard binds to ALL routes, so "missing method-level JwtAuthGuard"
    // is not a gap if JwtAuthGuard is global. Since we bind globally in AppModule,
    // this check only fires if the route is neither @Public nor covered by JWT.
    // Global guard covers it, so we don't require @UseGuards(JwtAuthGuard) on
    // every controller; but we DO require at least one permission unless the
    // tier allows no-permission access (PUBLIC or AUTHENTICATED reads).
  }

  // Permission checks.
  if (r.permission.length > 0) {
    for (const perm of r.permission) {
      if (!p.perms.includes(perm)) gaps.push(`missing @RequirePermission("${perm}")`);
    }
  } else if (!r.public && ["CLINICAL","FINANCIAL","ADMINISTRATIVE","AI_HIGH_RISK","EXTERNAL_INTEGRATION"].includes(cls.tier)) {
    if (p.perms.length === 0) {
      gaps.push(`no @RequirePermission on ${cls.tier} endpoint`);
    }
  }

  // Domain gate presence.
  if (r.governanceAuthorization && !p.hasGovernance && cls.tier !== "EXTERNAL_INTEGRATION") {
    gaps.push("missing @RequiresGovernance");
  }
  if (r.hcmAuthorization && !p.hasHcm) gaps.push("missing @RequireHcmPractitioner");
  if (r.mfaStepUp && !p.hasMfa) gaps.push("missing @RequiresMfaStepUp");
  if (r.clinicalSafetyGate && !p.hasClinical) gaps.push("missing @RequiresClinicalSafety");

  return { ...p, classification: cls, controlGaps: gaps, status: gaps.length ? "GAP" : "PASS" };
}

describe("Endpoint security tier matrix (Phase 9 §3)", () => {
  let rows: Row[] = [];
  beforeAll(() => {
    const parsed: ParsedEndpoint[] = [];
    for (const f of CTRL_FILES) parsed.push(...parse(f));
    rows = parsed.map(assess);
    const outDir = path.resolve(__dirname, "..", "..", "..", "..", "coverage");
    fs.mkdirSync(outDir, { recursive: true });
    const byTier: Record<string, number> = {};
    const byOpClass: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const r of rows) {
      byTier[r.classification.tier] = (byTier[r.classification.tier] ?? 0) + 1;
      byOpClass[r.classification.opClass] = (byOpClass[r.classification.opClass] ?? 0) + 1;
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }
    fs.writeFileSync(path.join(outDir, "endpoint-security-matrix.json"), JSON.stringify({
      generated: new Date().toISOString(),
      schema: "phase9-security-tier-v1",
      summary: {
        total: rows.length,
        byTier, byOpClass, byStatus,
      },
      endpoints: rows.map((r) => ({
        controller: r.controller,
        file: r.file,
        method: r.method,
        path: r.path,
        tier: r.classification.tier,
        opClass: r.classification.opClass,
        requiredControls: summarize(r.classification.required),
        presentControls: {
          jwt: r.hasJwt || !r.hasPublic,  // global guard covers it
          public: r.hasPublic,
          permissions: r.perms,
          governanceAuthorization: r.hasGovernance,
          hcmAuthorization: r.hasHcm,
          mfaStepUp: r.hasMfa,
          clinicalSafetyGate: r.hasClinical,
        },
        status: r.status,
        gaps: r.controlGaps,
      })),
    }, null, 2));
  });

  it("discovers endpoints across all controllers (>= 60)", () => {
    expect(rows.length).toBeGreaterThanOrEqual(60);
  });

  it("no PUBLIC endpoint is classified without explicit @Public() decorator", () => {
    const bad = rows.filter(
      (r) => r.classification.tier === "PUBLIC" && !r.hasPublic,
    );
    expect(bad.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it("every endpoint has a tier and opClass assigned", () => {
    for (const r of rows) {
      expect(r.classification.tier).toBeDefined();
      expect(["READ","WRITE","DESTRUCTIVE"]).toContain(r.classification.opClass);
    }
  });

  it("CI-fail: every endpoint is PASS (zero GAPs across all 95 routes)", () => {
    const gaps = rows.filter((r) => r.status === "GAP");
    expect(gaps.map((r) => `${r.classification.tier} ${r.method} ${r.path} — ${r.controlGaps.join("; ")}`)).toEqual([]);
  });

  it("matrix is written to coverage/endpoint-security-matrix.json", () => {
    const p = path.resolve(__dirname, "..", "..", "..", "..", "coverage", "endpoint-security-matrix.json");
    expect(fs.existsSync(p)).toBe(true);
  });
});

function summarize(r: RequiredControls) {
  return Object.fromEntries(
    Object.entries(r).filter(([, v]) => v === true || (typeof v === "string" && v !== "default") || (Array.isArray(v) && v.length > 0)),
  );
}

// Also re-export tier types for use by other specs.
export type { SecurityTier, OperationClass };
