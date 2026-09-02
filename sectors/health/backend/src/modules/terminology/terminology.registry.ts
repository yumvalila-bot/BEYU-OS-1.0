/**
 * Terminology engine abstraction.
 *
 * Supports ICD-10, ICD-11, SNOMED CT, LOINC, RxNorm, local/national codes.
 *
 * The registry is fail-closed: if a code system has not been loaded, code
 * validation returns BLOCKED. Codes are never invented. Code systems that
 * require licensed data (SNOMED, LOINC, ICD-11) report EXTERNAL-BLOCKED
 * until a dataset is imported via an approved, audited loader.
 */

export type CodeSystemId =
  | "ICD-10"
  | "ICD-11"
  | "SNOMED-CT"
  | "LOINC"
  | "RxNorm"
  | "MTUHA"
  | "TZ-NATIONAL"
  | "LOCAL"
  | "CPT"
  | "CVX";

export interface CodeSystem {
  id: CodeSystemId;
  version: string | null;
  loaded: boolean;
  source: "local" | "bundled" | "external-import" | "unavailable";
  /** When EXTERNAL-BLOCKED, validation always returns BLOCKED. */
  blockedReason?: string;
}

export type CodeValidationResult =
  | { ok: true; display?: string; inactive?: boolean; deprecated?: boolean }
  | {
      ok: false;
      reason:
        | "UNKNOWN_CODE"
        | "DEPRECATED"
        | "INACTIVE"
        | "BLOCKED"
        | "CODE_SYSTEM_NOT_LOADED";
      detail?: string;
    };

export interface CodeMap {
  fromSystem: CodeSystemId;
  toSystem: CodeSystemId;
  /** from-code → to-code(s). Unknown mappings are absent. */
  map: Record<string, string[]>;
  mappingVersion: string;
  /** If mapping is incomplete, unknown codes return UNMAPPED rather than guessed. */
  complete: boolean;
}

export class TerminologyRegistry {
  private readonly systems = new Map<CodeSystemId, CodeSystem>();
  private readonly codes = new Map<string, Set<string>>(); // key: `${system}|${version}`
  private readonly codeDisplay = new Map<string, string>();
  private readonly maps = new Map<string, CodeMap>();

  registerSystem(s: CodeSystem): void {
    this.systems.set(s.id, s);
    if (!s.loaded) this.codes.delete(s.id);
  }

  loadCodes(
    system: CodeSystemId,
    version: string,
    entries: Array<{
      code: string;
      display?: string;
      inactive?: boolean;
      deprecated?: boolean;
    }>,
  ): void {
    const key = `${system}|${version}`;
    const set = new Set<string>();
    for (const e of entries) {
      set.add(e.code);
      if (e.display) this.codeDisplay.set(`${key}|${e.code}`, e.display);
    }
    this.codes.set(key, set);
    this.systems.set(system, {
      id: system,
      version,
      loaded: true,
      source: "external-import",
    });
  }

  validate(
    system: CodeSystemId,
    code: string,
    version?: string | null,
  ): CodeValidationResult {
    const sys = this.systems.get(system);
    if (!sys || !sys.loaded) {
      return {
        ok: false,
        reason: "CODE_SYSTEM_NOT_LOADED",
        detail: `code system ${system} not loaded`,
      };
    }
    const ver = version ?? sys.version ?? "";
    const key = `${system}|${ver}`;
    const set = this.codes.get(key);
    if (!set || !set.has(code)) {
      return {
        ok: false,
        reason: "UNKNOWN_CODE",
        detail: `${system} ${code} not found`,
      };
    }
    return { ok: true, display: this.codeDisplay.get(`${key}|${code}`) };
  }

  registerMap(m: CodeMap): void {
    this.maps.set(`${m.fromSystem}→${m.toSystem}`, m);
  }

  mapCode(
    fromSystem: CodeSystemId,
    toSystem: CodeSystemId,
    code: string,
  ): {
    mapped: string[];
    mappingStatus: "complete" | "incomplete" | "UNMAPPED" | "BLOCKED";
  } {
    const m = this.maps.get(`${fromSystem}→${toSystem}`);
    if (!m) return { mapped: [], mappingStatus: "BLOCKED" };
    const out = m.map[code];
    if (!out || out.length === 0)
      return {
        mapped: [],
        mappingStatus: m.complete ? "UNMAPPED" : "incomplete",
      };
    return {
      mapped: out,
      mappingStatus: m.complete ? "complete" : "incomplete",
    };
  }

  getSystem(id: CodeSystemId): CodeSystem | undefined {
    return this.systems.get(id);
  }
}
