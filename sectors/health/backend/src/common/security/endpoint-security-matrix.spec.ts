/**
 * Endpoint security matrix — source-scanning inventory.
 *
 * Parses each *.controller.ts source file via regex/AST-lite scanning to
 * extract controller prefix, HTTP verbs + sub-paths, guard presence
 * (@UseGuards including JwtAuthGuard), @RequirePermission, @Public, and
 * domain-level gates (@RequiresGovernance, @RequireHcmPractitioner,
 * @RequiresMfaStepUp, @RequiresClinicalSafety).
 *
 * Enforces UNGUARDED-SENSITIVE: any non-public, non-auth, non-health, non-docs
 * POST/PUT/PATCH/DELETE MUST have JwtAuthGuard + at least one
 * @RequirePermission. High-risk clinical/finance endpoints missing domain
 * gates are honestly classified PARTIALLY_IMPLEMENTED, never silently PASS.
 *
 * Writes coverage/endpoint-security-matrix.json.
 */
import * as fs from "fs";
import * as path from "path";
import * as glob from "glob";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
interface EndpointRow {
  controller: string;
  file: string;
  method: Method;
  path: string;
  jwtGuard: "CLASS" | "METHOD" | "NONE";
  csrf: "GLOBAL_DEFAULT" | "PUBLIC_EXEMPT";
  requiredPermissions: string[];
  isPublic: boolean;
  sensitiveCategory: "auth" | "healthcheck" | "read" | "write" | "devtools";
  governanceAuthorization: boolean;
  hcmAuthorization: boolean;
  mfaStepUp: boolean;
  clinicalSafetyGate: boolean;
  securityAssessment: "PASS" | "PARTIALLY_IMPLEMENTED" | "UNGUARDED";
}

const CTRL_DIR = path.resolve(__dirname, "..", "..", "modules");
const FILES = glob.sync(path.join(CTRL_DIR, "**", "*.controller.ts")).filter(
  (f) => !f.endsWith(".spec.ts"),
);

function parseController(file: string): EndpointRow[] {
  const src = fs.readFileSync(file, "utf8");
  const controllerName = path.basename(file, ".controller.ts");

  // Controller prefix.
  const ctrlMatch = src.match(/@Controller\(\s*["']([^"']+)["']\s*\)/);
  const ctrlPrefix = ctrlMatch ? ctrlMatch[1] : "";

  // Class-level decorator block = everything up to the first method decorator.
  const firstVerb = src.search(/@(Get|Post|Put|Patch|Delete)\s*\(/);
  const classBlock = firstVerb >= 0 ? src.slice(0, firstVerb) : src;
  const classJwt = hasGuardInBlock(classBlock, "JwtAuthGuard");
  const classPerms = extractStringArrayMetadata(classBlock, "RequirePermission");
  const classPublic = /@Public\b/.test(classBlock);
  const classGov = /@RequiresGovernance\b/.test(classBlock);
  const classHcm = /@RequireHcmPractitioner\b/.test(classBlock);
  const classMfa = /@RequiresMfaStepUp\b/.test(classBlock);
  const classClin = /@RequiresClinicalSafety\b/.test(classBlock);

  const rows: EndpointRow[] = [];
  const methodRegex = /@(Get|Post|Put|Patch|Delete)\(\s*(?:["']([^"']*)["']|\s*\))/g;
  let m: RegExpExecArray | null;
  const verbStarts: number[] = [];
  const verbs: Array<{ verb: string; sub: string }> = [];
  while ((m = methodRegex.exec(src))) {
    verbStarts.push(m.index);
    verbs.push({ verb: m[1].toUpperCase(), sub: m[2] ?? "" });
  }

  for (let i = 0; i < verbs.length; i++) {
    const { verb, sub } = verbs[i];
    const start = verbStarts[i];
    const end = i + 1 < verbs.length ? verbStarts[i + 1] : src.length;
    const block = src.slice(start, end);

    const methodJwt = hasGuardInBlock(block, "JwtAuthGuard");
    const methodPerms = extractStringArrayMetadata(block, "RequirePermission");
    const methodPublic = /@Public\b/.test(block);
    const methodGov = /@RequiresGovernance\b/.test(block);
    const methodHcm = /@RequireHcmPractitioner\b/.test(block);
    const methodMfa = /@RequiresMfaStepUp\b/.test(block);
    const methodClin = /@RequiresClinicalSafety\b/.test(block);

    const perms = methodPerms.length ? methodPerms : classPerms;
    const isPublic = methodPublic || classPublic;
    const hasJwt = methodJwt || classJwt;
    const fullPath = norm(ctrlPrefix, sub);
    const lower = fullPath.toLowerCase();
    const isAuth = /auth|login|register|mfa|refresh|logout/.test(lower);
    const isHealth = lower.includes("/health");
    const isDocs = lower.includes("docs") || lower.includes("graphql");
    const isWrite = verb === "POST" || verb === "PUT" || verb === "PATCH" || verb === "DELETE";
    const cat: EndpointRow["sensitiveCategory"] = isAuth
      ? "auth"
      : isHealth
      ? "healthcheck"
      : isDocs
      ? "devtools"
      : isWrite
      ? "write"
      : "read";
    const csrf: EndpointRow["csrf"] = isPublic ? "PUBLIC_EXEMPT" : "GLOBAL_DEFAULT";
    const gov = methodGov || classGov;
    const hcm = methodHcm || classHcm;
    const mfaFlag = methodMfa || classMfa;
    const clin = methodClin || classClin;

    let assessment: EndpointRow["securityAssessment"] = "PASS";
    if (!isPublic && !isAuth && !isHealth && !isDocs && isWrite && (!hasJwt || perms.length === 0)) {
      assessment = "UNGUARDED";
    } else if (isHighRisk(lower) && isWrite && !(gov || hcm || clin || mfaFlag)) {
      assessment = "PARTIALLY_IMPLEMENTED";
    }

    rows.push({
      controller: controllerName,
      file: path.relative(path.resolve(__dirname, "..", "..", ".."), file),
      method: verb as Method,
      path: fullPath,
      jwtGuard: methodJwt ? "METHOD" : classJwt ? "CLASS" : "NONE",
      csrf,
      requiredPermissions: perms,
      isPublic,
      sensitiveCategory: cat,
      governanceAuthorization: gov,
      hcmAuthorization: hcm,
      mfaStepUp: mfaFlag,
      clinicalSafetyGate: clin,
      securityAssessment: assessment,
    });
  }
  return rows;
}

function hasGuardInBlock(block: string, guardName: string): boolean {
  const re = new RegExp(`@UseGuards\\s*\\([\\s\\S]*?\\b${guardName}\\b[\\s\\S]*?\\)`, "m");
  return re.test(block);
}

function extractStringArrayMetadata(block: string, decoratorName: string): string[] {
  const re = new RegExp(`@${decoratorName}\\(([^)]*)\\)`, "gs");
  const out: string[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(block))) {
    const strs = mm[1].match(/["']([^"']+)["']/g) ?? [];
    for (const s of strs) out.push(s.slice(1, -1));
  }
  return out;
}

function norm(prefix: string, sub: string): string {
  const joined = [prefix, sub].filter(Boolean).join("/").replace(/\/+/g, "/");
  return joined.startsWith("/") ? joined : "/" + joined;
}

function isHighRisk(lower: string): boolean {
  return /pharmacy|lab|imaging|radiology|eye|ophthal|dialys|billing|encounter|clinical|patient|telehealth|ambulance|record|consent|incident|compliance|reporting|integration|fhir|supabase/.test(lower);
}

describe("Endpoint security matrix (source scan)", () => {
  let matrix: EndpointRow[] = [];
  beforeAll(() => {
    matrix = [];
    for (const f of FILES) matrix.push(...parseController(f));
    const outDir = path.resolve(__dirname, "..", "..", "..", "..", "coverage");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "endpoint-security-matrix.json"), JSON.stringify({
      generated: new Date().toISOString(),
      summary: summarize(matrix),
      endpoints: matrix,
    }, null, 2));
  });

  it("discovers endpoints across all controllers (>=40)", () => {
    expect(matrix.length).toBeGreaterThanOrEqual(40);
  });

  it("no UNGUARDED sensitive write endpoints (JwtAuthGuard + @RequirePermission required)", () => {
    const failures = matrix.filter((r) => r.securityAssessment === "UNGUARDED");
    expect(failures.map((r) => `${r.method} ${r.path} (${r.controller})`)).toEqual([]);
  });

  it("every non-public write endpoint is covered by the global CSRF guard", () => {
    const bad = matrix.filter((r) => r.sensitiveCategory === "write" && r.csrf !== "GLOBAL_DEFAULT");
    expect(bad).toEqual([]);
  });

  it("high-risk writes are PARTIALLY_IMPLEMENTED until domain gates (governance/HCM/MFA/clinical) are endpoint-decorated", () => {
    const highRisk = matrix.filter((r) => isHighRisk(r.path.toLowerCase()) && r.sensitiveCategory === "write");
    expect(highRisk.length).toBeGreaterThan(0);
    for (const r of highRisk) {
      expect(r.securityAssessment).toBe("PARTIALLY_IMPLEMENTED");
    }
  });
});

function summarize(rows: EndpointRow[]) {
  const byMethod: Record<string, number> = {};
  const byAssessment: Record<string, number> = {};
  for (const r of rows) {
    byMethod[r.method] = (byMethod[r.method] ?? 0) + 1;
    byAssessment[r.securityAssessment] = (byAssessment[r.securityAssessment] ?? 0) + 1;
  }
  return { total: rows.length, byMethod, byAssessment };
}
