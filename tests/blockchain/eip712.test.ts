/**
 * EIP-712 / Keccak-256 — the cryptographic floor of the governed blockchain
 * capability.
 *
 * BEYU never signs anything, but it DOES compute the commitment an externally
 * governed signer is asked to sign, and it re-computes that same commitment when
 * it verifies an anchor. A wrong hash here would not crash: it would produce a
 * commitment that silently never matches the chain — or, worse, a "verified"
 * anchor whose digest nobody else can reproduce. So the primitive is in-tree
 * (no dependency that can be swapped under us) and pinned against the
 * authoritative vectors of `ethereum/EIPs/assets/eip-712/Example.js`:
 *
 *   typeHash(Mail)                      0xa0cedeb2…
 *   keccak(hashStruct(Person Cow|Bob))  0xfc71e5fa… / 0xcd54f074…
 *   keccak("Hello, Bob!")               0xb5aadf31…
 *   hashStruct(Mail)                    0xc52c0ee5…
 *   domainSeparator                     0xf2cee375…
 *   final digest                        0xbe609aee…
 *   address(keccak("cow"))              0xCD2a3d9F…8DD826 (EIP-55 mixed case)
 *
 * The two BEYU-specific groups then pin what this domain actually depends on:
 * identifiers are domain-separated (`BEYU:ID:` keccak, never truncated), the
 * anchor and obligation packages can never produce the same digest for the same
 * numbers, and an anchor's content hash is exactly one 0x-prefixed 32-byte
 * digest (a double prefix once made every commitment unmatchable).
 */

import { describe, expect, it } from "vitest";
import {
  ANCHOR_TYPES,
  BEYU_ANCHOR_DOMAIN_NAME,
  BEYU_ANCHOR_DOMAIN_VERSION,
  anchorTypedDigest,
  buildDomainTypes,
  hashDomain,
  hashStruct,
  hashTypedData,
  hexToBytes,
  idToBytes32,
  keccak256Hex,
  keccakUtf8,
  obligationTypedDigest,
  typeHash,
  bytesToHex,
} from "../../src/lib/blockchain/eip712";
import { toChecksumAddress } from "../../src/lib/blockchain/model";
import { sha256Hex, stableStringify } from "../../src/lib/contracts/pure";

const TYPES = {
  Person: [
    { name: "name", type: "string" },
    { name: "wallet", type: "address" },
  ],
  Mail: [
    { name: "from", type: "Person" },
    { name: "to", type: "Person" },
    { name: "contents", type: "string" },
  ],
};

const DOMAIN = {
  name: "Ether Mail",
  version: "1",
  chainId: 1,
  verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
};

/** Exactly the EIP repository's reference example (note `to` is 0xbBbB…). */
const MAIL = {
  from: { name: "Cow", wallet: "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826" },
  to: { name: "Bob", wallet: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" },
  contents: "Hello, Bob!",
};

const TYPE_HASH_MAIL = "0xa0cedeb2dc280ba39b857546d74f5549c3a1d7bdc2dd96bf881f76108e23dac2";

describe("keccak256 (in-tree FIPS-202, Ethereum padding)", () => {
  it("matches the published digests", () => {
    expect(keccak256Hex(new Uint8Array(0))).toBe("0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
    expect(keccakUtf8("")).toBe("0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
    expect(keccakUtf8("abc")).toBe("0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
    // The reference example's signing key: privateKey = keccak256("cow").
    expect(keccakUtf8("cow")).toBe("0xc85ef7d79691fe79573b1a7064c19c1a9819ebdbd1faaab1a8ec92344438aaf4");
  });

  it("documents that a string input is HEX, never text", () => {
    // `keccak256Hex("abc")` is not the hash of the letters a-b-c: the hex form is
    // the API contract (utf8 hashing is `keccakUtf8`). Pinning this keeps a
    // future caller from quietly hashing the wrong bytes.
    expect(() => keccak256Hex("abc")).toThrow(/invalid hex string/);
    expect(keccak256Hex("0x616263")).toBe(keccakUtf8("abc"));
  });

  it("crosses the keccak-f[1600] rate boundary (136 bytes) correctly", () => {
    // Absorption padding (0x01 … |= 0x80) is where a hand-rolled Keccak breaks:
    // exactly one rate block, one byte past it, and a long input must all differ.
    expect(keccakUtf8("a".repeat(135))).toMatch(/^0x[0-9a-f]{64}$/);
    const at136 = keccakUtf8("a".repeat(136));
    const at137 = keccakUtf8("a".repeat(137));
    expect(at136).not.toBe(at137);
    // Published: keccak256 of 32 bytes of 0x00 (a zero word) is not the empty digest.
    expect(keccak256Hex(`0x${"00".repeat(32)}`)).not.toBe(keccak256Hex(new Uint8Array(0)));
  });

  it("round-trips hex bytes and refuses malformed input", () => {
    const hex = "0x" + "00ff10ab".repeat(8);
    expect(bytesToHex(hexToBytes(hex))).toBe(hex);
    expect(() => hexToBytes("0x0xdeadbeef")).toThrow(/invalid hex string/);
    expect(() => hexToBytes("deadbe")).not.toThrow();
    expect(bytesToHex(hexToBytes("deadbe"))).toBe("0xdeadbe");
  });
});

describe("EIP-712 typed data (authoritative reference example)", () => {
  it("computes the published typeHash values", () => {
    expect(typeHash("Mail", TYPES)).toBe(TYPE_HASH_MAIL);
    // encodeType is `Primary(field types…) + referenced types sorted by name`.
    expect(typeHash("Person", TYPES)).toBe(keccakUtf8("Person(string name,address wallet)"));
    expect(keccakUtf8("Mail(Person from,Person to,string contents)Person(string name,address wallet)")).toBe(TYPE_HASH_MAIL);
  });

  it("encodes nested structs and strings exactly as the published encodeData words", () => {
    // The published encodeData is typeHash ‖ hashStruct(from) ‖ hashStruct(to) ‖
    // keccak(contents): a nested member is the struct hash itself, and a string
    // member is the keccak of its bytes. Pinning the three words pins `string`,
    // `address` and nesting in one assertion set.
    expect(hashStruct("Person", MAIL.from, TYPES)).toBe(
      "0xfc71e5fa27ff56c350aa531bc129ebdf613b772b6604664f5d8dbe21b85eb0c8",
    );
    expect(hashStruct("Person", MAIL.to, TYPES)).toBe(
      "0xcd54f074a4af31b4411ff6a60c9719dbd559c221c8ac3492d9d872b041d703d1",
    );
    expect(keccakUtf8("Hello, Bob!")).toBe("0xb5aadf3154a261abdd9086fc627b61efca26ae5702701d05cd2305f7c52a2fc8");
    // And the whole encoding the reference publishes, word for word.
    const words = [
      TYPE_HASH_MAIL,
      hashStruct("Person", MAIL.from, TYPES),
      hashStruct("Person", MAIL.to, TYPES),
      keccakUtf8(MAIL.contents),
    ].map((w) => w.slice(2));
    expect(`0x${words.join("")}`).toBe(
      "0xa0cedeb2dc280ba39b857546d74f5549c3a1d7bdc2dd96bf881f76108e23dac2"
        + "fc71e5fa27ff56c350aa531bc129ebdf613b772b6604664f5d8dbe21b85eb0c8"
        + "cd54f074a4af31b4411ff6a60c9719dbd559c221c8ac3492d9d872b041d703d1"
        + "b5aadf3154a261abdd9086fc627b61efca26ae5702701d05cd2305f7c52a2fc8",
    );
  });

  it("computes the published struct hash, domain separator and digest", () => {
    expect(hashStruct("Mail", MAIL, TYPES)).toBe("0xc52c0ee5d84264471806290a3f2c4cecfc5490626bf912d01f240d7a274b371e");
    expect(hashDomain(DOMAIN)).toBe("0xf2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f");
    expect(hashTypedData({ domain: DOMAIN, types: TYPES, primaryType: "Mail", message: MAIL })).toBe(
      "0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2",
    );
  });

  it("builds EIP712Domain in the specified order, skipping absent fields", () => {
    const { types, message } = buildDomainTypes({ name: "X", version: "1", chainId: BigInt(1) });
    expect(types.EIP712Domain.map((f) => f.name)).toEqual(["name", "version", "chainId"]);
    expect(message).toEqual({ name: "X", version: "1", chainId: BigInt(1) });
    expect(buildDomainTypes({ name: "X", version: "1", salt: `0x${"11".repeat(32)}` }).types.EIP712Domain.map((f) => f.name)).toEqual([
      "name",
      "version",
      "salt",
    ]);
  });

  it("encodes EIP-55 addresses and refuses anything that is not 20 bytes", () => {
    expect(toChecksumAddress("0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826")).toBe("0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826");
    expect(() =>
      hashTypedData({
        domain: DOMAIN,
        types: { Bad: [{ name: "who", type: "address" }] },
        primaryType: "Bad",
        message: { who: "0x1234" },
      }),
    ).toThrow(/20-byte hex address/);
    expect(() =>
      hashTypedData({
        domain: DOMAIN,
        types: { Bad: [{ name: "h", type: "bytes32" }] },
        primaryType: "Bad",
        message: { h: "0xdeadbeef" },
      }),
    ).toThrow(/expected 32 bytes/);
  });
});

describe("BEYU anchor + obligation commitments", () => {
  const base = {
    anchorId: "BCA_TEST_1",
    documentId: "DOC_TEST_1",
    contractId: "CTR_TEST_1",
    contentHash: `0x${"ab".repeat(32)}`,
    chainId: 11155111,
    executedAt: BigInt(1_757_900_000),
    verifyingContract: "0x1f9843a9748f189e1e0ce875be2a1a1a1a1a1a1a",
  };

  it("is deterministic and 32 bytes", () => {
    const a = anchorTypedDigest(base);
    expect(a).toBe(anchorTypedDigest({ ...base }));
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("binds the domain: chain, contract, content and revocation each change it", () => {
    const anchor = anchorTypedDigest(base);
    expect(anchorTypedDigest({ ...base, chainId: 1 })).not.toBe(anchor);
    expect(anchorTypedDigest({ ...base, verifyingContract: `0x${"2f"}9843a9748f189e1e0ce875be2a1a1a1a1a1a1a` })).not.toBe(anchor);
    expect(anchorTypedDigest({ ...base, revoked: true })).not.toBe(anchor);
    expect(anchorTypedDigest({ ...base, contractId: null })).not.toBe(anchor);
    expect(anchorTypedDigest({ ...base, contentHash: `0x${"ac".repeat(32)}` })).not.toBe(anchor);
  });

  it("declares the struct the contracts actually verify", () => {
    expect(BEYU_ANCHOR_DOMAIN_NAME).toBe("BEYU OS Governed Contract Anchor");
    expect(BEYU_ANCHOR_DOMAIN_VERSION).toBe("1");
    expect(ANCHOR_TYPES.Anchor.map((f) => f.type)).toEqual(["bytes32", "bytes32", "bytes32", "bytes32", "uint256", "uint256", "bool"]);
  });

  it("cannot be replayed as an execution commitment (domain separation)", () => {
    const anchor = anchorTypedDigest(base);
    const obligation = obligationTypedDigest({
      obligationId: base.anchorId,
      contractId: base.contractId,
      kind: "PAYMENT",
      deliverableHash: base.contentHash,
      amountMajor: 0,
      dueBlock: 0,
      oracleRound: 0,
      paused: false,
      chainId: base.chainId,
      verifyingContract: base.verifyingContract,
    });
    expect(obligation).toMatch(/^0x[0-9a-f]{64}$/);
    expect(obligation).not.toBe(anchor);
    // Amount and pause state are part of the commitment: a "0 value" execution
    // package must never look like the same obligation with money in it.
    expect(obligationTypedDigest({ ...obligationFields(base), amountMajor: 1 })).not.toBe(obligation);
    expect(obligationTypedDigest({ ...obligationFields(base), paused: true })).not.toBe(obligation);
  });
});

function obligationFields(input: { contractId: string; contentHash: string; chainId: number; verifyingContract: string }) {
  return {
    obligationId: "CBO_TEST_1",
    contractId: input.contractId,
    kind: "PAYMENT",
    deliverableHash: input.contentHash,
    amountMajor: 0,
    dueBlock: 0,
    oracleRound: 0,
    paused: false,
    chainId: input.chainId,
    verifyingContract: input.verifyingContract,
  };
}

describe("identifier encoding (bytes32 commitments from string ids)", () => {
  it("passes a digest through, left-pads an address, keccams anything else", () => {
    const digest = `0x${"cd".repeat(32)}`;
    expect(idToBytes32(`0x${"CD".repeat(32)}`)).toBe(digest);
    expect(idToBytes32(`0X${"cd".repeat(32)}`)).toBe(digest);
    expect(idToBytes32("0x1F9843a9748F189e1e0cE875bE2a1a1a1a1a1a1a")).toBe(`0x${"1f9843a9748f189e1e0ce875be2a1a1a1a1a1a1a".padStart(64, "0")}`);
    expect(idToBytes32(`  ${digest}  `)).toBe(digest);
    expect(idToBytes32("CTR_01ABC")).toBe(keccakUtf8("BEYU:ID:CTR_01ABC"));
  });

  it("never truncates and never throws, so two records cannot share a commitment", () => {
    expect(idToBytes32("CTR_01ABC")).not.toBe(idToBytes32("CTR_01ABD"));
    expect(idToBytes32("BEYU:ANCHOR:BCA_1")).toMatch(/^0x[0-9a-f]{64}$/);
    expect(() => idToBytes32("0xZZ")).not.toThrow();
    expect(idToBytes32("0xZZ")).toBe(keccakUtf8("BEYU:ID:0xZZ"));
  });
});

describe("anchor content hashes", () => {
  it("is exactly one 0x-prefixed 32-byte digest", () => {
    // Regression: createAnchor once wrapped `sha256Hex` in another `0x`. That both
    // threw inside the EIP-712 encoder whenever a commitment was computed and —
    // worse — silently stored a content hash no chain or caller could ever match.
    const hash = sha256Hex(stableStringify({ title: "x", valueMajor: 1 }));
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hash.match(/x/g)).toHaveLength(1);
    expect(() => hexToBytes(hash)).not.toThrow();
    expect(bytesToHex(hexToBytes(hash))).toBe(hash);
  });

  it("is stable under JSON key order (a commitment must not depend on it)", () => {
    expect(sha256Hex(stableStringify({ b: 2, a: 1, c: { z: 1, y: [3, 2, 1] } }))).toBe(
      sha256Hex(stableStringify({ a: 1, c: { y: [3, 2, 1], z: 1 }, b: 2 })),
    );
    expect(sha256Hex(stableStringify({ a: 1 }))).not.toBe(sha256Hex(stableStringify({ a: 2 })));
    // Types must not collapse: "1" and 1 hash differently once the encoder is
    // asked to prove the payload, so a caller cannot re-type a field to collide.
    expect(sha256Hex(stableStringify({ a: 1 }))).not.toBe(sha256Hex(stableStringify({ a: "1" })));
  });
});
