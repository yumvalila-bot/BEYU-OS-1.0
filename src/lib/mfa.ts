import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sha256 } from "./crypto";

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const DEFAULT_WINDOW = 1; // +/- 30 seconds tolerance

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function keyMaterial(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY ?? process.env.AUTH_SECRET ?? "development-only-mfa-key-change-before-production";
  if ((process.env.NODE_ENV === "production" || process.env.BEYU_ENV === "production") && raw.includes("development-only")) {
    throw new Error("MFA_ENCRYPTION_KEY or AUTH_SECRET is required in production");
  }
  return Buffer.from(sha256(raw), "hex");
}

export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    out += BASE32[parseInt(chunk, 2)];
  }
  return out;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 TOTP secret");
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function currentTotpStep(at = Date.now()): number {
  return Math.floor(at / 1000 / TOTP_STEP_SECONDS);
}

export function generateTotpCode(secret: string, at = Date.now()): string {
  return hotp(secret, currentTotpStep(at));
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptSecret(encrypted: string): string {
  const [v, ivB64, tagB64, ctB64] = encrypted.split(":");
  if (v !== "v1" || !ivB64 || !tagB64 || !ctB64) throw new Error("Unsupported encrypted secret format");
  const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}

export type TotpVerifyResult =
  | { ok: true; step: number }
  | { ok: false; reason: "INVALID" | "REPLAY" | "EXPIRED_OR_FUTURE" };

export function verifyTotp(params: {
  secret: string;
  code: string;
  lastAcceptedStep?: number | null;
  at?: number;
  window?: number;
}): TotpVerifyResult {
  const code = params.code.trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "INVALID" };
  const nowStep = currentTotpStep(params.at ?? Date.now());
  const window = params.window ?? DEFAULT_WINDOW;
  for (let step = nowStep - window; step <= nowStep + window; step++) {
    const expected = hotp(params.secret, step);
    const a = Buffer.from(expected);
    const b = Buffer.from(code);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      if (params.lastAcceptedStep != null && step <= params.lastAcceptedStep) {
        return { ok: false, reason: "REPLAY" };
      }
      return { ok: true, step };
    }
  }
  return { ok: false, reason: "EXPIRED_OR_FUTURE" };
}

export function hashRecoveryCode(code: string): string {
  return sha256(`mfa-recovery:${code.trim().toUpperCase()}`);
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => randomBytes(6).toString("base64url").toUpperCase());
}
