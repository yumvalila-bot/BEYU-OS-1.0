/**
 * BEYU OS — SMART CONTRACT GOVERNANCE: MECHANICAL CHECKS.
 *
 * The checks proposed in `BEYU-SCG-09` §4 (V-3…V-7), implemented here as a pure,
 * DB-free, network-free set so they can run in CI and in `npm run verify`
 * without a database. Each check returns findings; the runner exits non-zero on
 * any BLOCKING finding.
 *
 * WHAT THESE CHECKS ARE, HONESTLY:
 *   V-3 — Inventory freshness: the inventory parses, its ids are unique, every
 *         source path it names EXISTS, every automation-bearing source path in
 *         the codebase is REPRESENTED, and the TypeScript register agrees with
 *         the JSON inventory.
 *   V-4 — No-secret assertion: the register and inventory carry no key material,
 *         seed phrase, keystore, credential or address that could sign.
 *   V-6 — Prohibited-claim scan: the BEYU-SCG pack asserts no completion label
 *         (`APPROVED`/`EXECUTED`/`FILED`/`REGISTERED`) as its own status, and no
 *         document declares one.
 *   V-7 — Authorization guard: no automation is marked AUTHORISED in the
 *         inventory, none declares external execution, A7 is not represented as
 *         authorized, and R-AUT-01 is empty.
 *
 * WHAT THEY ARE NOT: a legal opinion, a security certification, a completeness
 * proof, or evidence that any control was *operated*. A control never run is not
 * a control passed — these checks inspect artefacts, not conduct.
 *
 * V-5 (documentation-only footprint) is implemented in the test suite rather
 * than here, because it inspects git rather than the working tree.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AUTOMATION_REGISTRY,
  HUMAN_BINDINGS,
  PERMITTED_CLASSES,
  PROHIBITED_CLASSES,
  automationsWithExternalExecution,
  type AutomationClass,
} from "./registry";

export const SCG_CHECKS_VERSION = "scg-checks-1.0.0";
export const INVENTORY_PATH = "docs/governance/smart-contracts/AUTOMATION_INVENTORY.json";
export const PACK_DIR = "docs/governance/smart-contracts";

export type FindingSeverity = "BLOCKING" | "ADVISORY";

export type Finding = {
  check: string;
  severity: FindingSeverity;
  code: string;
  subject: string;
  detail: string;
};

export type CheckResult = {
  check: string;
  findings: Finding[];
  blocking: number;
  advisory: number;
};

/* ------------------------------------------------------------------ */
/* Inventory model (read straight from the JSON — no second schema)     */
/* ------------------------------------------------------------------ */

export type RawInventoryEntry = {
  id?: unknown;
  name?: unknown;
  class?: unknown;
  source_paths?: unknown;
  tests?: unknown;
  verification?: unknown;
  unattended?: unknown;
  human_binding?: unknown;
  side_effects?: unknown;
  may_not_do?: unknown;
};

export type RawInventory = {
  inventory_id?: unknown;
  grants_authority?: unknown;
  entries?: unknown;
  human_bindings?: unknown;
  authorization?: unknown;
  classes?: unknown;
};

export function readInventory(root: string): { raw: RawInventory | null; error: string | null } {
  const path = join(root, INVENTORY_PATH);
  if (!existsSync(path)) return { raw: null, error: `missing inventory at ${INVENTORY_PATH}` };
  try {
    return { raw: JSON.parse(readFileSync(path, "utf8")) as RawInventory, error: null };
  } catch (err) {
    return { raw: null, error: `inventory is not valid JSON: ${(err as Error).message}` };
  }
}

/* ------------------------------------------------------------------ */
/* V-3 — inventory freshness                                           */
/* ------------------------------------------------------------------ */

/**
 * Source directories that contain automation-bearing behaviour and must have at
 * least one inventory entry pointing into them. This is a COVERAGE FLOOR, not a
 * proof: it catches a whole surface being forgotten, and it says nothing about
 * behaviour inside a directory that is already represented.
 */
const AUTOMATION_BEARING_DIRS = [
  "src/lib/payments/",
  "src/lib/contracts/",
  "src/lib/blockchain/",
  "src/lib/noelia/",
  "src/lib/data-governance/",
  "src/lib/execution/",
  "src/lib/governance/",
  "src/lib/hcm",
  "src/app/api/v1/internal/events/",
] as const;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function checkInventoryFreshness(root: string): CheckResult {
  const findings: Finding[] = [];
  const add = (severity: FindingSeverity, code: string, subject: string, detail: string) =>
    findings.push({ check: "V-3", severity, code, subject, detail });

  const { raw, error } = readInventory(root);
  if (error || !raw) {
    add("BLOCKING", "INVENTORY_UNREADABLE", INVENTORY_PATH, error ?? "unreadable");
    return tally("V-3", findings);
  }

  if (raw.inventory_id !== "BEYU-SCG-04A") {
    add("BLOCKING", "INVENTORY_ID", INVENTORY_PATH, `inventory_id is ${JSON.stringify(raw.inventory_id)}, expected "BEYU-SCG-04A"`);
  }

  const entries = Array.isArray(raw.entries) ? (raw.entries as RawInventoryEntry[]) : null;
  if (!entries) {
    add("BLOCKING", "INVENTORY_ENTRIES", INVENTORY_PATH, "`entries` is missing or not an array");
    return tally("V-3", findings);
  }

  // Unique ids, and id-shape.
  const seen = new Set<string>();
  for (const entry of entries) {
    const id = typeof entry.id === "string" ? entry.id : "";
    if (!/^AUT-\d{2}$/.test(id)) {
      add("BLOCKING", "ENTRY_ID_SHAPE", id || "(none)", "entry id must match /^AUT-\\d{2}$/");
      continue;
    }
    if (seen.has(id)) add("BLOCKING", "ENTRY_ID_DUPLICATE", id, "duplicate entry id");
    seen.add(id);
  }

  // Every declared source path must exist.
  for (const entry of entries) {
    const id = typeof entry.id === "string" ? entry.id : "(none)";
    for (const p of asStringArray(entry.source_paths)) {
      if (!existsSync(join(root, p))) {
        add("BLOCKING", "SOURCE_PATH_MISSING", id, `source_paths entry does not exist: ${p}`);
      }
    }
    for (const p of asStringArray(entry.tests)) {
      if (!existsSync(join(root, p))) {
        add("BLOCKING", "TEST_PATH_MISSING", id, `tests entry does not exist: ${p}`);
      }
    }
  }

  // Coverage floor across automation-bearing directories.
  const allPaths = entries.flatMap((e) => asStringArray(e.source_paths));
  for (const dir of AUTOMATION_BEARING_DIRS) {
    if (!allPaths.some((p) => p.startsWith(dir))) {
      add("BLOCKING", "DIRECTORY_UNREPRESENTED", dir, `no inventory entry references ${dir}; a whole automation surface may be missing from the register`);
    }
  }

  // The TypeScript register must agree with the JSON inventory — same count,
  // same ids, same classes. Two sources of truth that may drift is exactly the
  // defect this check exists for.
  const byId = new Map<string, RawInventoryEntry>();
  for (const entry of entries) if (typeof entry.id === "string") byId.set(entry.id, entry);

  for (const record of AUTOMATION_REGISTRY) {
    const entry = byId.get(record.id);
    if (!entry) {
      add("BLOCKING", "REGISTER_NOT_IN_INVENTORY", record.id, "the TypeScript register carries an id absent from the JSON inventory");
      continue;
    }
    if (entry.class !== record.class) {
      add("BLOCKING", "CLASS_DRIFT", record.id, `inventory class ${JSON.stringify(entry.class)} != register class ${record.class}`);
    }
    const rawPaths = asStringArray(entry.source_paths);
    const missing = record.sourcePaths.filter((p) => !rawPaths.includes(p));
    if (missing.length > 0) {
      add("BLOCKING", "SOURCE_DRIFT", record.id, `register source paths absent from the inventory: ${missing.join(", ")}`);
    }
  }

  for (const id of byId.keys()) {
    if (!AUTOMATION_REGISTRY.some((r) => r.id === id)) {
      add("BLOCKING", "INVENTORY_NOT_IN_REGISTER", id, "the JSON inventory carries an id absent from the TypeScript register");
    }
  }

  // Human binding ids referenced by entries must resolve.
  const bindingIds = new Set(HUMAN_BINDINGS.map((b) => b.id));
  for (const entry of entries) {
    for (const ref of asStringArray(entry.human_binding)) {
      if (/^HB-\d{2}$/.test(ref) && !bindingIds.has(ref)) {
        add("BLOCKING", "HUMAN_BINDING_UNRESOLVED", String(entry.id), `references ${ref}, which is not a registered human binding`);
      }
    }
  }
  const rawBindings = Array.isArray(raw.human_bindings) ? (raw.human_bindings as { id?: unknown }[]) : [];
  for (const b of rawBindings) {
    const id = typeof b.id === "string" ? b.id : "";
    if (id && !bindingIds.has(id)) {
      add("BLOCKING", "INVENTORY_BINDING_NOT_IN_REGISTER", id, "inventory human binding absent from the TypeScript register");
    }
  }
  if (rawBindings.length !== HUMAN_BINDINGS.length) {
    add("BLOCKING", "BINDING_COUNT_DRIFT", "human_bindings", `inventory has ${rawBindings.length}, register has ${HUMAN_BINDINGS.length}`);
  }

  return tally("V-3", findings);
}

/* ------------------------------------------------------------------ */
/* V-4 — no secrets, no signing material                               */
/* ------------------------------------------------------------------ */

const SECRET_PATTERNS: readonly { code: string; re: RegExp; what: string }[] = [
  { code: "PRIVATE_KEY_BLOCK", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, what: "a PEM private key block" },
  { code: "EVM_ADDRESS", re: /\b0x[0-9a-fA-F]{40}\b/, what: "a 20-byte hex address" },
  { code: "HEX32_SECRET", re: /\b0x[0-9a-fA-F]{64}\b/, what: "a 32-byte hex value (private key or digest-shaped secret)" },
  { code: "SEED_PHRASE_HINT", re: /\b(seed phrase|mnemonic|keystore|passphrase|recovery share)\b\s*[:=]\s*\S/i, what: "a seed phrase, keystore, passphrase or recovery share assignment" },
  { code: "MNEMONIC_WORDS", re: /\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/, what: "a word sequence of mnemonic length" },
  { code: "BEARER_TOKEN", re: /\b(ghp_|github_pat_|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/, what: "a long-lived bearer credential" },
];

export function checkNoSecrets(root: string): CheckResult {
  const findings: Finding[] = [];
  const add = (severity: FindingSeverity, code: string, subject: string, detail: string) =>
    findings.push({ check: "V-4", severity, code, subject, detail });

  const targets = [INVENTORY_PATH, `${PACK_DIR}/REGISTERS_AND_TEMPLATES.md`, `${PACK_DIR}/SIGNING_KEY_CUSTODY_AND_ATTESTATION_GOVERNANCE.md`];
  for (const rel of targets) {
    const path = join(root, rel);
    if (!existsSync(path)) {
      add("ADVISORY", "TARGET_ABSENT", rel, "check target is absent; nothing verified for this document");
      continue;
    }
    const text = readFileSync(path, "utf8");
    // A registered *document* is allowed to NAME these patterns in a prohibition
    // (SCG-03 does exactly that). What it may never do is carry a VALUE. Values
    // are detected by pattern; naming them in prose is detected by requiring that
    // every hit sits inside a line that also reads as a prohibition.
    for (const { code, re, what } of SECRET_PATTERNS) {
      const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
      for (const match of text.matchAll(global)) {
        const line = text.slice(text.lastIndexOf("\n", match.index ?? 0) + 1, text.indexOf("\n", match.index ?? 0));
        const isProhibitionProse = /\b(no|never|prohibit|forbid|must not|may not|without)\b/i.test(line);
        add(
          isProhibitionProse ? "ADVISORY" : "BLOCKING",
          isProhibitionProse ? "PATTERN_NAMED_IN_PROHIBITION" : code,
          rel,
          isProhibitionProse ? `${what} named inside a prohibition statement (no value present)` : `${what} appears as a VALUE: ${line.trim().slice(0, 120)}`,
        );
      }
    }
  }

  // The register itself must never carry a value, prohibition prose or not.
  const serialized = JSON.stringify(AUTOMATION_REGISTRY);
  for (const { code, re, what } of SECRET_PATTERNS) {
    if (re.test(serialized)) {
      add("BLOCKING", code, "AUTOMATION_REGISTRY", `the TypeScript register carries ${what}`);
    }
  }

  return tally("V-4", findings);
}

/* ------------------------------------------------------------------ */
/* V-6 — prohibited claims in the pack                                 */
/* ------------------------------------------------------------------ */

/** The exact status values a document's front matter may declare. */
const ALLOWED_FRONT_MATTER_STATUSES = [
  "PRELIMINARY_FRAMEWORK",
  "CONDITIONAL_DRAFT",
  "TEMPLATE_NOT_EXECUTED",
  "INFORMATIONAL",
  "COMPLETE_DRAFT",
  "BLOCKED",
] as const;

/**
 * The pack-level banner, permitted ONLY on the pack's own `README.md`.
 *
 * This is not a document status and must not become one: it is the banner both
 * packs (legal and smart-contract) carry on their READMEs to say that the pack
 * as a whole is drafting work product. It is listed separately, and confined to
 * one file, precisely so that it cannot be used to launder a document status —
 * `README.md` has no `Document ID` and is the only file this applies to.
 */
const PACK_LEVEL_BANNER = "DRAFT FOR PROFESSIONAL REVIEW";
const PACK_LEVEL_BANNER_FILES = ["README.md"] as const;

const COMPLETION_LABELS = ["APPROVED", "EXECUTED", "FILED", "REGISTERED"] as const;

export function checkProhibitedClaims(root: string, files: readonly string[]): CheckResult {
  const findings: Finding[] = [];
  const add = (severity: FindingSeverity, code: string, subject: string, detail: string) =>
    findings.push({ check: "V-6", severity, code, subject, detail });

  let statusLines = 0;
  for (const rel of files) {
    const path = join(root, rel);
    if (!existsSync(path)) {
      add("BLOCKING", "DOCUMENT_MISSING", rel, "registered document is absent from disk");
      continue;
    }
    const text = readFileSync(path, "utf8");

    // 1 — front-matter status must come from the vocabulary, and must never be
    //     a completion label. The pack-level banner is permitted on README.md
    //     only, and is still subject to the completion-label prohibition.
    const isPackReadme = PACK_LEVEL_BANNER_FILES.some((f) => rel.endsWith(`/${f}`) || rel === f);
    for (const line of text.split("\n")) {
      const m = /^\*{0,2}Status\*{0,2}:\s*(.+)$/.exec(line);
      if (!m) continue;
      statusLines += 1;
      const value = m[1];
      const declared = ALLOWED_FRONT_MATTER_STATUSES.find((s) => value.includes(s));
      const banner = isPackReadme && value.includes(PACK_LEVEL_BANNER);
      if (!declared && !banner) {
        add("BLOCKING", "STATUS_NOT_IN_VOCABULARY", rel, `Status declares none of the vocabulary labels: ${value.trim().slice(0, 120)}`);
      }
      if (!declared && banner && !isPackReadme) {
        add("BLOCKING", "PACK_BANNER_OUTSIDE_README", rel, "the pack-level banner may appear only on the pack README");
      }
      for (const label of COMPLETION_LABELS) {
        if (new RegExp(`^\\s*\`?${label}\`?\\s*(—|$)`).test(value)) {
          add("BLOCKING", "COMPLETION_LABEL_AS_STATUS", rel, `Status declares ${label} without an evidence reference, which the pack's status rule forbids`);
        }
      }
    }
  }

  if (statusLines === 0) {
    add("BLOCKING", "NO_STATUS_LINES", PACK_DIR, "no document declared a Status line; the scan proved nothing");
  }

  // 2 — the inventory must not represent an automation as authorized.
  const { raw } = readInventory(root);
  const entries = raw && Array.isArray(raw.entries) ? (raw.entries as Record<string, unknown>[]) : [];
  for (const entry of entries) {
    const id = String(entry.id ?? "(none)");
    for (const [key, value] of Object.entries(entry)) {
      if (/authoriz|authoris|approv|grant/i.test(key) && value !== false && value !== null) {
        add("BLOCKING", "AUTHORIZATION_FIELD_PRESENT", id, `inventory entry carries ${key}=${JSON.stringify(value)}; the inventory page may not hold authorization (SCG-04 AU-20)`);
      }
    }
    const blob = JSON.stringify(entry);
    if (/"authorized"\s*:\s*true/i.test(blob) || /"authorised"\s*:\s*true/i.test(blob)) {
      add("BLOCKING", "AUTHORIZED_TRUE", id, "entry is marked authorized");
    }
    if (entry.class === "A7" && !/prohibit/i.test(blob)) {
      add("BLOCKING", "A7_WITHOUT_PROHIBITION", id, "an A7 (external execution) entry exists without a recorded prohibition");
    }
  }

  return tally("V-6", findings);
}

/* ------------------------------------------------------------------ */
/* V-7 — authorization and external-execution guards                   */
/* ------------------------------------------------------------------ */

/**
 * Patterns that indicate a REAL signing surface, as opposed to prose that
 * prohibits one.
 *
 * The distinction matters and is easy to get wrong: `src/lib/blockchain/model.ts`
 * contains the bare string `"privateKey"` — inside `FORBIDDEN_EVENT_FIELDS`, a
 * denylist that *rejects* private keys from event payloads. A token-level scan
 * flags that as a signing surface and is therefore useless; it would pressure a
 * future maintainer to delete a protection. These patterns match CALLS and
 * VALUES, which no prohibition needs to contain.
 */
const SIGNING_SURFACE_PATTERNS: readonly { code: string; re: RegExp; what: string }[] = [
  { code: "SIGN_CALL", re: /\b(?:sign|send|broadcast|submit)Transaction\s*\(/, what: "a transaction signing or submission call" },
  { code: "WALLET_CONSTRUCT", re: /\bnew\s+Wallet\s*\(|\bcreateWalletClient\s*\(|\bhdkey\b|\bmnemonicToAccount\s*\(/, what: "a wallet or keyring construction" },
  // The optional type annotation matters: `privateKey: string = process.env.X`
  // is a key-shaped binding, and a pattern that only looked for `name:value`
  // would miss it.
  { code: "KEY_VALUE", re: /\b(?:privateKey|secretKey|mnemonic|seedPhrase|signingKey)\s*(?::\s*[A-Za-z_$][\w$<>[\]|.\s]*?)?\s*[:=]\s*(?:process\.env|\b0x[0-9a-fA-F]{8,}|["'`][^"'`]{12,}["'`])/, what: "a key-shaped VALUE bound to a variable" },
  { code: "SIGNER_METHOD", re: /\bwalletClient\s*\.\s*\w+\(|\bsigner\s*\.\s*(?:sign|send)\w*\(/, what: "a signer or wallet-client method call" },
  { code: "KEYFILE_READ", re: /\breadFileSync\s*\([^)]*(?:keystore|\.key|wallet\.json)/i, what: "a keystore or key file read" },
] as const;

/** Extra packages that would introduce a signing capability. */
const FORBIDDEN_SIGNING_PACKAGES = ["viem", "ethers", "web3", "wagmi", "@solana/web3.js", "ethereumjs-wallet", "bip39", "@ethereumjs/tx"] as const;

/** The governed domain: where a signing surface would be a governance defect. */
const SIGNING_SCAN_DIRS = ["src/lib/blockchain", "src/lib/smart-contracts", "src/lib/execution", "src/lib/payments"] as const;

/**
 * Files exempt from their own scan.
 *
 * This module states the prohibition, so its source contains the patterns it
 * looks for. Scanning policy as though it were behaviour produces findings that
 * can only be resolved by weakening the policy — the exact wrong direction. The
 * exemption is one file and is listed here rather than pattern-matched, so it
 * cannot quietly grow.
 */
const SIGNING_SCAN_EXEMPT = ["src/lib/smart-contracts/checks.ts"] as const;

/**
 * Remove comments, so that PROSE about a key is not mistaken for a key.
 *
 * A comment is not a capability: an explanatory note that `privateKey: string =
 * process.env.X` would be dangerous must not register as the danger itself. A
 * regex literal (like the patterns below) survives this treatment and therefore
 * still has to clear the pattern on its own — which is why the exemption above
 * also exists, rather than relying on stripping alone.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function walkTs(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSafe(dir)) {
    const full = join(dir, entry);
    if (statIsDir(full)) walkTs(full, out);
    else if (/\.(ts|tsx|mts|cts)$/.test(entry)) out.push(full);
  }
  return out;
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function statIsDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Scan the governed domain for a signing capability.
 *
 * A finding here is BLOCKING and means the platform has acquired the ability to
 * move value — which `SCG-04` AU-2/AU-3 and `SCG-07` R-3 prohibit, and which
 * nothing in this repository is authorised to do.
 */
export function checkNoSigningSurface(root: string): Finding[] {
  const findings: Finding[] = [];
  const add = (severity: FindingSeverity, code: string, subject: string, detail: string) =>
    findings.push({ check: "V-7", severity, code, subject, detail });

  for (const rel of SIGNING_SCAN_DIRS) {
    for (const file of walkTs(join(root, rel))) {
      const shown = file.slice(root.length + 1);
      if (SIGNING_SCAN_EXEMPT.some((e) => e === shown)) continue;
      const text = stripComments(readFileSync(file, "utf8"));
      for (const { code, re, what } of SIGNING_SURFACE_PATTERNS) {
        const match = re.exec(text);
        if (match) {
          add("BLOCKING", code, shown, `the governed domain contains ${what}: ${JSON.stringify(match[0].slice(0, 80))}`);
        }
      }
    }
  }

  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
    for (const dep of FORBIDDEN_SIGNING_PACKAGES) {
      if (deps.has(dep)) add("BLOCKING", "SIGNING_PACKAGE", "package.json", `${dep} is installed; a signing library is a signing capability`);
    }
  }

  return findings;
}

export function checkAuthorizationGuards(root: string = process.cwd()): CheckResult {
  const findings: Finding[] = [];
  const add = (severity: FindingSeverity, code: string, subject: string, detail: string) =>
    findings.push({ check: "V-7", severity, code, subject, detail });

  // A7 is prohibited and carries no authority type.
  for (const cls of PROHIBITED_CLASSES) {
    if (PERMITTED_CLASSES.includes(cls)) {
      add("BLOCKING", "PROHIBITED_CLASS_PERMITTED", cls, "a prohibited class also appears in the permitted set");
    }
  }
  if (!PROHIBITED_CLASSES.includes("A7")) {
    add("BLOCKING", "A7_NOT_PROHIBITED", "A7", "A7 must remain prohibited");
  }

  // No automation may declare external execution.
  const executing = automationsWithExternalExecution();
  if (executing.length > 0) {
    add("BLOCKING", "EXTERNAL_EXECUTION_DECLARED", executing.map((a) => a.id).join(", "), "an automation declares external execution; none may");
  }

  // Every registered automation must declare the permitted class set membership
  // and grantsAuthority false.
  for (const record of AUTOMATION_REGISTRY) {
    if (!PERMITTED_CLASSES.includes(record.class as AutomationClass)) {
      add("BLOCKING", "REGISTERED_CLASS_NOT_PERMITTED", record.id, `class ${record.class} is not in the permitted set`);
    }
    if (record.grantsAuthority !== false) {
      add("BLOCKING", "ENTRY_GRANTS_AUTHORITY", record.id, "an inventory record claims to grant authority");
    }
    if (record.externalExecution !== false) {
      add("BLOCKING", "ENTRY_EXTERNAL_EXECUTION", record.id, "an inventory record claims external execution");
    }
  }

  // R-AUT-01 must be empty: authorization requires a constituted body, an
  // adopted process and a governed decision, none of which exists. If this ever
  // fails, the failure is a governance change, not a test to relax.
  const authorized = AUTOMATION_REGISTRY.filter((a) => (a as { status?: string }).status === "AUTHORISED");
  if (authorized.length > 0) {
    add("BLOCKING", "R_AUT_01_NOT_EMPTY", authorized.map((a) => a.id).join(", "), "R-AUT-01 holds an authorized automation; authorizing requires a governed decision this repository cannot evidence");
  }
  if (AUTOMATION_REGISTRY.some((a) => !("status" in a))) {
    // Absence of a status field IS the empty register: nothing is authorized.
  }

  // No signing capability anywhere in the governed domain.
  findings.push(...checkNoSigningSurface(root));

  return tally("V-7", findings);
}

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */

function tally(check: string, findings: Finding[]): CheckResult {
  return {
    check,
    findings,
    blocking: findings.filter((f) => f.severity === "BLOCKING").length,
    advisory: findings.filter((f) => f.severity === "ADVISORY").length,
  };
}

export function runScgChecks(root: string, packFiles: readonly string[]): CheckResult[] {
  return [
    checkInventoryFreshness(root),
    checkNoSecrets(root),
    checkProhibitedClaims(root, packFiles),
    checkAuthorizationGuards(),
  ];
}
