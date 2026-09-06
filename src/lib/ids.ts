import { randomBytes } from "node:crypto";

/**
 * BEYU OS identifier factory.
 * All identifiers are immutable, prefixed, sortable and globally unique.
 * Format: <prefix>_<base32 time><base32 random>
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

function encode(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += ALPHABET[b >> 3] + ALPHABET[((b & 0b111) << 2) % 32];
  }
  return out;
}

export const ID_PREFIX = {
  tenant: "TEN",
  jurisdiction: "JUR",
  legalEntity: "LEN",
  orgUnit: "ORG",
  ownership: "OWN",
  appointment: "APT",
  osRegistry: "OSR",
  sot: "SOT",
  party: "PTY",
  user: "USR",
  session: "SES",
  role: "ROL",
  rolePermission: "RPM",
  roleAssignment: "RAS",
  emergency: "EMG",
  delegation: "DLG",
  consent: "CNS",
  article: "ART",
  policy: "POL",
  body: "GOV",
  member: "GMB",
  resolution: "RES",
  vote: "VOT",
  approval: "APR",
  workflow: "WFL",
  instance: "WFI",
  task: "TSK",
  objective: "OBJ",
  risk: "RSK",
  control: "CTL",
  obligation: "OBL",
  assessment: "ASM",
  legal: "LGL",
  anomaly: "ANM",
  continuity: "BCP",
  period: "FPR",
  account: "ACC",
  journal: "JNL",
  journalLine: "JNLL",
  treasury: "TRS",
  capital: "CAP",
  waterfallConfig: "WFC",
  waterfallTier: "WFT",
  waterfallRun: "WFR",
  waterfallLine: "WFRL",
  taxStrategy: "TAX",
  taxAssessment: "TXA",
  position: "POS",
  employee: "EMP",
  employmentEvent: "EME",
  workforceRequest: "WRQ",
  familyMember: "FAM",
  beneficiary: "BEN",
  vaultItem: "VLT",
  program: "PRG",
  sectorMetric: "SMT",
  document: "DOC",
  event: "EVT",
  audit: "AUD",
  aiDecision: "AID",
  noeliaAction: "NAR",
  noeliaWorkflow: "NWF",
  noeliaWorkflowStep: "NWS",
  noeliaSchedule: "NSH",
  noeliaScheduleRun: "NSR",
  knowledge: "KNW",
  notification: "NTF",
  integration: "INT",
  dataAsset: "DAT",
  adr: "ADR",
  regulatoryChange: "REG",
  aiIdentity: "AII",
  provider: "PROV",
  model: "MOD",
  evaluation: "AEV",
  incident: "AIC",
  killSwitch: "AKS",
  routing: "ART",
  modelLifecycle: "MLC",
  providerLifecycle: "PLC",
  modelProvenance: "MPV",
  modelArtifact: "MAT",
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

export function newId(prefix: IdPrefix): string {
  const time = Date.now().toString(32).toUpperCase().padStart(10, "0");
  return `${prefix}_${time}${encode(randomBytes(6))}`;
}

/** Deterministic identifier for seed/reference data (idempotent bootstrapping). */
export function fixedId(prefix: IdPrefix, key: string): string {
  return `${prefix}_${key.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}
