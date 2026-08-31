import { createHmac, randomBytes } from "crypto";

/**
 * RFC 6238 TOTP / RFC 4226 HOTP using Node crypto (no external dependency).
 *
 * Defaults: SHA-1, 6 digits, 30-second period. These match Google Authenticator,
 * Microsoft Authenticator, Authy, etc. Window drift allowance is 1 period
 * (±30s) unless configured otherwise.
 */

export interface TotpConfig {
  period?: number;     // seconds; default 30
  digits?: number;     // 6 or 8; default 6
  algorithm?: "sha1" | "sha256" | "sha512";
  driftWindow?: number; // number of periods to check on each side; default 1
}

const DEFAULT_CFG: Required<TotpConfig> = {
  period: 30,
  digits: 6,
  algorithm: "sha1",
  driftWindow: 1,
};

export function generateTotpSecret(bytes = 20): Buffer {
  // 20 bytes = 160 bits, base32-encoded ≈ 32 chars — standard for TOTP.
  return randomBytes(bytes);
}

/** Encode a buffer as unpadded RFC 4648 base32. */
export function base32Encode(buf: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    out += alphabet[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

export function base32Decode(s: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error("TOTP_BASE32_INVALID");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

function hotp(key: Buffer, counter: bigint, digits: number, algorithm: string): string {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(counter, 0);
  const hmac = createHmac(algorithm.toUpperCase().replace("SHA", "sha"), key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const mod = 10 ** digits;
  return String(code % mod).padStart(digits, "0");
}

export function totpToken(secret: Buffer, cfg: TotpConfig = {}, at: Date = new Date()): string {
  const c = { ...DEFAULT_CFG, ...cfg };
  const counter = BigInt(Math.floor(at.getTime() / 1000 / c.period));
  return hotp(secret, counter, c.digits, c.algorithm);
}

export interface TotpVerifyResult {
  ok: boolean;
  /** The counter that matched (for replay tracking / last-used-counter storage). */
  matchedCounter?: bigint;
}

/**
 * Verify a TOTP token. Accepts tokens within driftWindow periods of the current
 * time. Returns ok=false for malformed input or mismatch.
 *
 * To prevent replay the caller MUST record the highest accepted counter per
 * factor and reject any token whose matchedCounter <= last_used_counter.
 */
export function totpVerify(
  secret: Buffer,
  token: string,
  cfg: TotpConfig = {},
  at: Date = new Date(),
): TotpVerifyResult {
  const c = { ...DEFAULT_CFG, ...cfg };
  if (!/^\d{6,8}$/.test(token)) return { ok: false };
  const current = BigInt(Math.floor(at.getTime() / 1000 / c.period));
  for (let i = -c.driftWindow; i <= c.driftWindow; i++) {
    const counter = current + BigInt(i);
    if (hotp(secret, counter, c.digits, c.algorithm) === token) {
      return { ok: true, matchedCounter: counter };
    }
  }
  return { ok: false };
}

/**
 * Build an otpauth:// URI for QR-code enrollment (we do NOT generate QR images
 * server-side — that's client-side; we just return the URI string).
 */
export function totpUri(args: {
  secretBase32: string;
  label: string;          // e.g. "user@tenant" or "alice@hospital.tz"
  issuer?: string;        // e.g. "BEYU Health OS"
  period?: number;
  digits?: number;
  algorithm?: "sha1" | "sha256" | "sha512";
}): string {
  const { secretBase32, label, issuer = "BEYU Health OS" } = args;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: (args.algorithm ?? "sha1").toUpperCase(),
    digits: String(args.digits ?? 6),
    period: String(args.period ?? 30),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}
