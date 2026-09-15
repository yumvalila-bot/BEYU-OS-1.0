/**
 * BEYU OS — EIP-712 TYPED-DATA COMMITMENTS FOR GOVERNED CONTRACT EVIDENCE (§37, §24).
 *
 * Why this exists: the on-chain anchor contracts attest a `bytes32 commitment`
 * for a governed document or obligation. For that attestation to be verifiable
 * by any independent party — and by the smart contract itself — the commitment
 * must be computed to a published standard, not to an ad-hoc hash that only
 * this codebase understands. The standard is EIP-712: `keccak256("\x19\x01" ‖
 * domainSeparator ‖ hashStruct(message))`.
 *
 * What this file is NOT: it is not a signing library. BEYU never holds private
 * keys, never signs on behalf of a party, and never accepts a wallet signature
 * as authority (§3, §58). It computes and verifies commitments so that a
 * signature produced elsewhere can be checked against the same bytes.
 *
 * Verification of correctness: `tests/blockchain/eip712.test.ts` asserts this
 * implementation against the canonical vectors published with EIP-712 itself
 * (the "Ether Mail" example), including keccak-256 of "cow" →
 * 0xcd2a3d9f…d826 and the example's signHash 0xbe609aee…7bd2. A standard
 * re-implementation without published-vector tests would be a liability, not a
 * capability.
 *
 * Keccak-256 here is the FIPS-202-derived Ethereum variant (padding 0x01),
 * implemented from the specification in ~60 lines with BigInt lanes.
 */

const MASK64 = (BigInt('1') << BigInt('64')) - BigInt('1');

/**
 * Lane addressing. FIPS-202 stores A[x][y] at lane 5y + x (x is the fast axis);
 * every read and write in `keccakF` below uses this helper so the two cannot
 * drift apart. The published vectors in the test suite pin it.
 */
function laneIndex(x: number, y: number): number {
  return 5 * y + x;
}

/**
 * Keccak-f[1600] round constants and ρ rotation offsets, generated from the
 * FIPS-202 pseudo-code (rc via the x^8+x^6+x^5+x^4+1 LFSR with bitPosition
 * 2^j−1; r(x,y) via the t = (t+1)(t+2)/2 walk). Both tables are asserted
 * against the published reference vectors in `tests/blockchain/eip712.test.ts`
 * (keccak256("") and the EIP-712 "Ether Mail" example), so a transcription
 * error can never pass unnoticed.
 */
function lfsrStep(state: bigint): bigint {
  // LFSR-86540: feedback from bit 7, shift, XOR the reduction polynomial.
  const next = ((state & BigInt(0x80)) === BigInt(0x80))
    ? ((state << BigInt(1)) ^ BigInt(0x71)) & BigInt(0xff)
    : (state << BigInt(1)) & BigInt(0xff);
  return next;
}

const ROUND_CONSTANTS: bigint[] = (() => {
  const rc: bigint[] = [];
  let lfsr = BigInt(1);
  for (let round = 0; round < 24; round += 1) {
    let value = BigInt(0);
    let term = BigInt(1);
    for (let j = 0; j < 7; j += 1) {
      if ((lfsr & BigInt(1)) === BigInt(1)) value |= BigInt(1) << (term - BigInt(1));
      lfsr = lfsrStep(lfsr);
      term = (term * BigInt(2)) % BigInt(255);
    }
    rc.push(value);
  }
  return rc;
})();

/**
 * ρ rotation offsets r[x][y] (FIPS-202 Table Two), stored in lane order
 * lane = 5y + x:
 *
 *        y=0    y=1   y=2    y=3    y=4
 *   x=0    0     36     3     41     18
 *   x=1    1     44    10     45      2
 *   x=2   62      6    43     15     61
 *   x=3   28     55    25     21     56
 *   x=4   27     20    39      8     14
 *
 * The published vectors in `tests/blockchain/eip712.test.ts` pin this table:
 * a wrong offset changes every digest, so a transcription error fails loudly
 * rather than producing a subtly non-standard commitment.
 */
const ROTATION_OFFSETS: readonly number[] = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

function rotl64(value: bigint, shift: number): bigint {
  const s = BigInt(shift % 64);
  if (s === BigInt('0')) return value;
  return ((value << s) | (value >> (BigInt('64') - s))) & MASK64;
}

function keccakF(state: bigint[]): void {
  for (let round = 0; round < 24; round += 1) {
    // θ
    const c = new Array<bigint>(5);
    for (let x = 0; x < 5; x += 1) {
      c[x] =
        state[laneIndex(x, 0)] ^
        state[laneIndex(x, 1)] ^
        state[laneIndex(x, 2)] ^
        state[laneIndex(x, 3)] ^
        state[laneIndex(x, 4)];
    }
    const d = new Array<bigint>(5);
    for (let x = 0; x < 5; x += 1) {
      d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
    }
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) state[laneIndex(x, y)] ^= d[x];
    }
    // ρ + π:  B[y][2x+3y] = rot(A[x][y], r[x][y])
    const b = new Array<bigint>(25).fill(BigInt('0'));
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        b[laneIndex(y, (2 * x + 3 * y) % 5)] = rotl64(
          state[laneIndex(x, y)],
          ROTATION_OFFSETS[laneIndex(x, y)],
        );
      }
    }
    // χ
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        state[laneIndex(x, y)] =
          b[laneIndex(x, y)] ^ (~b[laneIndex((x + 1) % 5, y)] & b[laneIndex((x + 2) % 5, y)]);
      }
    }
    // ι
    state[0] ^= ROUND_CONSTANTS[round];
  }
}

function bytesToWords(bytes: Uint8Array, wordCount: number): bigint[] {
  const words = new Array<bigint>(wordCount).fill(BigInt('0'));
  for (let i = 0; i < bytes.length; i += 1) {
    words[i >> 3] ^= BigInt(bytes[i]) << BigInt(8 * (i & 7));
  }
  return words;
}

function toHex(bytes: Uint8Array): string {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error("hexToBytes: invalid hex string");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Keccak-256 (Ethereum padding rule 0x01, not SHA3's 0x06). Returns 0x-hex. */
export function keccak256Hex(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? hexToBytes(input) : input;
  const RATE = 136; // 1600/8 - 2*32/8
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / RATE) * RATE);
  padded.set(bytes);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] |= 0x80;
  const state = new Array<bigint>(25).fill(BigInt('0'));
  for (let offset = 0; offset < padded.length; offset += RATE) {
    const block = padded.subarray(offset, offset + RATE);
    const words = bytesToWords(block, RATE / 8);
    for (let i = 0; i < RATE / 8; i += 1) state[i] ^= words[i];
    keccakF(state);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    out[i] = Number((state[i >> 3] >> BigInt(8 * (i & 7))) & BigInt('0xff'));
  }
  return toHex(out);
}

/** UTF-8 keccak-256 of a string (used for typeHash and dynamic members). */
export function keccakUtf8(value: string): string {
  return keccak256Hex(new TextEncoder().encode(value));
}

/* ------------------------------------------------------------------ */
/* Minimal static ABI encoding (32-byte words, head-only)             */
/* ------------------------------------------------------------------ */

export type Eip712Scalar = string | number | bigint | boolean;

function encodeWord(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return clean.padStart(64, "0");
}

/** Encode a single atomic value as one 32-byte hex word (no 0x). */
function encodeAtomic(type: string, value: Eip712Scalar | Record<string, unknown>): string {
  if (type === "uint256" || type === "int256") {
    const n = typeof value === "bigint" ? value : BigInt(value as string | number);
    if (type === "int256" && n < BigInt('0')) {
      const wrapped = (BigInt('1') << BigInt('256')) + n;
      return wrapped.toString(16).padStart(64, "0");
    }
    if (n < BigInt('0') || n >= BigInt('1') << BigInt('256')) throw new Error(`EIP-712: ${type} out of range`);
    return n.toString(16).padStart(64, "0");
  }
  if (type === "bool") {
    if (typeof value !== "boolean") throw new Error("EIP-712: bool member requires a boolean");
    return encodeWord(value ? "1" : "0");
  }
  if (type === "address") {
    if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
      throw new Error("EIP-712: address member requires a 20-byte hex address");
    }
    return encodeWord(value.toLowerCase());
  }
  if (/^bytes([1-9]|[12][0-9]|3[0-2])$/.test(type)) {
    if (typeof value !== "string") throw new Error("EIP-712: bytesN member requires a hex string");
    const size = Number(type.slice(5));
    const bytes = hexToBytes(value);
    if (bytes.length !== size) throw new Error(`EIP-712: expected ${size} bytes for ${type}`);
    // Right-padded (beginning-to-end order, per the EIP).
    const hex = toHex(bytes).slice(2).padEnd(64, "0");
    return hex;
  }
  if (type === "string" || type === "bytes") {
    const bytes = type === "string" ? new TextEncoder().encode(String(value)) : hexToBytes(String(value));
    return keccak256Hex(bytes).slice(2);
  }
  throw new Error(`EIP-712: unsupported atomic type ${type}`);
}

export type Eip712Types = Record<string, ReadonlyArray<{ name: string; type: string }>>;

function encodeType(primary: string, types: Eip712Types): string {
  const deps = new Set<string>();
  const collect = (name: string, seen: Set<string>) => {
    if (seen.has(name)) return;
    seen.add(name);
    const members = types[name];
    if (!members) throw new Error(`EIP-712: unknown struct type ${name}`);
    for (const m of members) {
      const base = m.type.replace(/\[\d*\]$/, "");
      if (types[base]) {
        deps.add(base);
        collect(base, seen);
      }
    }
  };
  collect(primary, new Set());
  const sorted = [...deps].filter((d) => d !== primary).sort();
  const body = (name: string) =>
    `${name}(${types[name]
      .map((m) => `${m.type} ${m.name}`)
      .join(",")})`;
  return body(primary) + sorted.map(body).join("");
}

/** encodeData per EIP-712: typeHash omitted, members concatenated (32-byte words). */
function encodeData(primary: string, message: Record<string, unknown>, types: Eip712Types): string {
  const members = types[primary];
  if (!members) throw new Error(`EIP-712: unknown struct type ${primary}`);
  let out = "";
  for (const m of members) {
    const value = message[m.name];
    if (value === undefined) throw new Error(`EIP-712: message is missing member ${primary}.${m.name}`);
    if (/\[\d*\]$/.test(m.type)) {
      const baseType = m.type.replace(/\[\d*\]$/, "");
      const arr = value as unknown[];
      const encoded = arr.map((item) =>
        types[baseType]
          ? hashStruct(baseType, item as Record<string, unknown>, types).slice(2)
          : encodeAtomic(baseType, item as Eip712Scalar),
      );
      out += keccak256Hex(hexToBytes("0x" + encoded.join(""))).slice(2);
      continue;
    }
    if (types[m.type]) {
      out += hashStruct(m.type, value as Record<string, unknown>, types).slice(2);
      continue;
    }
    out += encodeAtomic(m.type, value as Eip712Scalar);
  }
  return out;
}

export function typeHash(primary: string, types: Eip712Types): string {
  return keccakUtf8(encodeType(primary, types));
}

export function hashStruct(primary: string, message: Record<string, unknown>, types: Eip712Types): string {
  return keccak256Hex(hexToBytes(typeHash(primary, types) + encodeData(primary, message, types)));
}

export type Eip712DomainFields = {
  name?: string;
  version?: string;
  chainId?: number | bigint;
  verifyingContract?: string;
  salt?: string;
};

/**
 * The EIP712Domain struct, built in the EIP-specified field order, skipping
 * absent fields (name, version, chainId, verifyingContract, salt).
 */
export function buildDomainTypes(domain: Eip712DomainFields): { types: Eip712Types; message: Record<string, unknown> } {
  const fields: Array<{ name: string; type: string; value: unknown }> = [];
  if (domain.name !== undefined) fields.push({ name: "name", type: "string", value: domain.name });
  if (domain.version !== undefined) fields.push({ name: "version", type: "string", value: domain.version });
  if (domain.chainId !== undefined) fields.push({ name: "chainId", type: "uint256", value: domain.chainId });
  if (domain.verifyingContract !== undefined)
    fields.push({ name: "verifyingContract", type: "address", value: domain.verifyingContract });
  if (domain.salt !== undefined) fields.push({ name: "salt", type: "bytes32", value: domain.salt });
  return {
    types: { EIP712Domain: fields.map(({ name, type }) => ({ name, type })) },
    message: Object.fromEntries(fields.map(({ name, value }) => [name, value])),
  };
}

export function hashDomain(domain: Eip712DomainFields): string {
  const built = buildDomainTypes(domain);
  return hashStruct("EIP712Domain", built.message, built.types);
}

/** The digest that must be signed / attested: keccak256(0x1901 ‖ domain ‖ struct). */
export function hashTypedData(input: {
  domain: Eip712DomainFields;
  types: Eip712Types;
  primaryType: string;
  message: Record<string, unknown>;
}): string {
  const domain = hashDomain(input.domain);
  const struct = hashStruct(input.primaryType, input.message, input.types);
  return keccak256Hex(hexToBytes("0x1901" + domain.slice(2) + struct.slice(2)));
}

/* ------------------------------------------------------------------ */
/* BEYU anchor commitment envelope (the exact struct the contracts use) */
/* ------------------------------------------------------------------ */

export const BEYU_ANCHOR_DOMAIN_NAME = "BEYU OS Governed Contract Anchor";
export const BEYU_ANCHOR_DOMAIN_VERSION = "1";

export const ANCHOR_TYPES: Eip712Types = {
  Anchor: [
    { name: "anchorId", type: "bytes32" },
    { name: "documentId", type: "bytes32" },
    { name: "contractId", type: "bytes32" },
    { name: "contentHash", type: "bytes32" },
    { name: "chainId", type: "uint256" },
    { name: "executedAt", type: "uint256" },
    { name: "revoked", type: "bool" },
  ],
};

/** 32-byte padded commitment of a BEYU identifier (ids are strings; anchors are bytes32). */
export function idToBytes32(id: string): string {
  // A "0X" prefix is a valid way to write hex and must not silently fall through
  // to the identifier hash: the same value must always encode to one bytes32.
  const raw = id.trim();
  const trimmed = /^0X/i.test(raw) ? `0x${raw.slice(2)}` : raw;
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return "0x" + trimmed.slice(2).toLowerCase().padStart(64, "0");
  return keccakUtf8(`BEYU:ID:${trimmed}`);
}

/** The on-chain-verifiable digest for an anchor record. */
export function anchorTypedDigest(input: {
  anchorId: string;
  documentId: string;
  contractId?: string | null;
  contentHash: string;
  chainId: number | bigint;
  executedAt: number | bigint;
  revoked?: boolean;
  verifyingContract: string;
}): string {
  const message = {
    anchorId: idToBytes32(input.anchorId),
    documentId: idToBytes32(input.documentId),
    contractId: idToBytes32(input.contractId ?? "BEYU:NONE"),
    contentHash: input.contentHash,
    chainId: input.chainId,
    executedAt: input.executedAt,
    revoked: input.revoked ?? false,
  };
  return hashTypedData({
    domain: {
      name: BEYU_ANCHOR_DOMAIN_NAME,
      version: BEYU_ANCHOR_DOMAIN_VERSION,
      chainId: input.chainId,
      verifyingContract: input.verifyingContract,
    },
    types: ANCHOR_TYPES,
    primaryType: "Anchor",
    message,
  });
}

/** The on-chain-verifiable digest for an obligation execution package. */
export const OBLIGATION_TYPES: Eip712Types = {
  ObligationExecution: [
    { name: "obligationId", type: "bytes32" },
    { name: "contractId", type: "bytes32" },
    { name: "kindHash", type: "bytes32" },
    { name: "deliverableHash", type: "bytes32" },
    { name: "amountMajor", type: "uint256" },
    { name: "dueBlock", type: "uint256" },
    { name: "oracleRound", type: "uint256" },
    { name: "paused", type: "bool" },
  ],
};

export function obligationTypedDigest(input: {
  obligationId: string;
  contractId: string;
  kind: string;
  deliverableHash: string;
  amountMajor: number | bigint;
  dueBlock: number | bigint;
  oracleRound: number | bigint;
  paused: boolean;
  chainId: number | bigint;
  verifyingContract: string;
}): string {
  return hashTypedData({
    domain: {
      name: "BEYU OS Governed Obligation Execution",
      version: "1",
      chainId: input.chainId,
      verifyingContract: input.verifyingContract,
    },
    types: OBLIGATION_TYPES,
    primaryType: "ObligationExecution",
    message: {
      obligationId: idToBytes32(input.obligationId),
      contractId: idToBytes32(input.contractId),
      kindHash: keccakUtf8(input.kind),
      deliverableHash: input.deliverableHash,
      amountMajor: input.amountMajor,
      dueBlock: input.dueBlock,
      oracleRound: input.oracleRound,
      paused: input.paused,
    },
  });
}

export { toHex as bytesToHex, hexToBytes };
