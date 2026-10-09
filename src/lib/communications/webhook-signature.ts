/**
 * Inbound webhook signature verification for communications providers.
 *
 * Pure functions: no database access, and no ambient environment reads (the
 * secret lookup takes the environment as an explicit argument). Every check
 * fails closed. A missing header, a malformed header, an unimplemented scheme,
 * or a missing or malformed signing secret is a refusal, never a pass.
 *
 * The scheme is selected by the provider's `provider_type`, never by anything
 * the request says about itself:
 *
 *   META_HMAC_SHA256              provider_type META_WHATSAPP | META_WHATSAPP_CLOUD
 *     X-Hub-Signature-256: sha256=<hex HMAC-SHA256(app_secret, raw body)>
 *     Meta's documented scheme. The legacy SHA-1 header is not accepted.
 *
 *   TWILIO_HMAC_SHA1              provider_type TWILIO_SMS
 *     X-Twilio-Signature: <base64 HMAC-SHA1(auth_token, url + sorted params)>
 *     Form-encoded bodies sign the exact public URL plus the sorted form
 *     fields. JSON bodies carry a bodySHA256 query parameter that must equal
 *     sha256(raw body), and the URL alone is signed. The URL-variant handling
 *     (default port, legacy query encoding) mirrors the reference Twilio SDK.
 *
 *   BEYU_TIMESTAMPED_HMAC_SHA256  provider_type GENERIC_SIGNED_WEBHOOK
 *     X-Beyu-Timestamp: <unix seconds>
 *     X-Beyu-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${raw body}`)>
 *     The timestamp is signed and must be within WEBHOOK_MAX_SKEW_SECONDS of
 *     receipt, so a captured request expires on its own.
 *
 * Any other provider_type, including every *_SIMULATED type, has no implemented
 * scheme and is refused with SIGNATURE_SCHEME_NOT_IMPLEMENTED.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { parse as parseQuery, stringify as stringifyQuery } from "node:querystring";

export const WEBHOOK_MAX_SKEW_SECONDS = 300;
export const MIN_SIGNING_SECRET_LENGTH = 16;

export type WebhookSignatureScheme = "META_HMAC_SHA256" | "TWILIO_HMAC_SHA1" | "BEYU_TIMESTAMPED_HMAC_SHA256";

export type SigningSecretRefusal =
  | "SIGNING_SECRET_REF_MISSING"
  | "SIGNING_SECRET_REF_MALFORMED"
  | "SIGNING_SECRET_REF_DENIED"
  | "SIGNING_SECRET_NOT_CONFIGURED"
  | "SIGNING_SECRET_MALFORMED_VALUE"
  | "SIGNING_SECRET_TOO_SHORT";

export type SignatureRefusal =
  | "SIGNATURE_MISSING"
  | "SIGNATURE_MISMATCH"
  | "TIMESTAMP_MISSING"
  | "TIMESTAMP_MALFORMED"
  | "TIMESTAMP_OUT_OF_WINDOW"
  | "CONTENT_TYPE_NOT_FORM"
  | "BODY_HASH_MISMATCH";

export type InboundRefusal = "SIGNATURE_SCHEME_NOT_IMPLEMENTED" | SigningSecretRefusal | SignatureRefusal;

export type VerificationOutcome = { ok: true } | { ok: false; reason: SignatureRefusal };

export type InboundVerification =
  | { verified: true; scheme: WebhookSignatureScheme }
  | { verified: false; scheme: WebhookSignatureScheme | null; reason: InboundRefusal };

const SCHEME_BY_PROVIDER_TYPE: ReadonlyMap<string, WebhookSignatureScheme> = new Map([
  ["META_WHATSAPP", "META_HMAC_SHA256"],
  ["META_WHATSAPP_CLOUD", "META_HMAC_SHA256"],
  ["TWILIO_SMS", "TWILIO_HMAC_SHA1"],
  ["GENERIC_SIGNED_WEBHOOK", "BEYU_TIMESTAMPED_HMAC_SHA256"],
]);

/** Environment variable names are the only form a signing secret reference may take. */
const SIGNING_SECRET_REF_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;

/** Platform credentials must never double as webhook signing keys. */
const CREDENTIAL_ENV_NAMES: ReadonlySet<string> = new Set([
  "DATABASE_URL",
  "BEYU_RUNTIME_DATABASE_URL",
  "BEYU_ADMIN_DATABASE_URL",
  "BEYU_TEST_DATABASE_URL",
  "AUTH_SECRET",
  "MFA_ENCRYPTION_KEY",
  "BEYU_INTERNAL_SERVICE_TOKEN",
  "BEYU_BOOTSTRAP_PASSWORD",
  "BEYU_RUNTIME_DB_PASSWORD",
]);

const SHA256_HEX = /^[0-9a-fA-F]{64}$/;
const SHA256_PREFIX = "sha256=";
const UNIX_SECONDS = /^\d{10}$/;

export function signatureSchemeFor(providerType: string): WebhookSignatureScheme | null {
  return SCHEME_BY_PROVIDER_TYPE.get(providerType) ?? null;
}

/**
 * Resolve a provider's signing secret reference to a usable secret value.
 * The reference is an environment variable name. The value is never logged or
 * persisted by this module.
 */
export function resolveSigningSecret(
  ref: string | null | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): { ok: true; secret: string } | { ok: false; reason: SigningSecretRefusal } {
  if (!ref) return { ok: false, reason: "SIGNING_SECRET_REF_MISSING" };
  if (!SIGNING_SECRET_REF_PATTERN.test(ref)) return { ok: false, reason: "SIGNING_SECRET_REF_MALFORMED" };
  if (CREDENTIAL_ENV_NAMES.has(ref)) return { ok: false, reason: "SIGNING_SECRET_REF_DENIED" };
  const value = env[ref];
  if (typeof value !== "string" || value.length === 0) return { ok: false, reason: "SIGNING_SECRET_NOT_CONFIGURED" };
  if (value !== value.trim() || /[\r\n]/.test(value)) return { ok: false, reason: "SIGNING_SECRET_MALFORMED_VALUE" };
  if (value.length < MIN_SIGNING_SECRET_LENGTH) return { ok: false, reason: "SIGNING_SECRET_TOO_SHORT" };
  return { ok: true, secret: value };
}

function sameBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function sha256HexFromHeader(header: string): Buffer | null {
  if (!header.startsWith(SHA256_PREFIX)) return null;
  const hex = header.slice(SHA256_PREFIX.length);
  return SHA256_HEX.test(hex) ? Buffer.from(hex, "hex") : null;
}

/** Meta: X-Hub-Signature-256 = sha256=HEX(HMAC-SHA256(app_secret, raw_body)). */
export function verifyMetaSignature(input: {
  appSecret: string;
  rawBody: string;
  presented: string | null | undefined;
}): VerificationOutcome {
  const presented = (input.presented ?? "").trim();
  if (!presented) return { ok: false, reason: "SIGNATURE_MISSING" };
  const declared = sha256HexFromHeader(presented);
  if (!input.appSecret || !declared) return { ok: false, reason: "SIGNATURE_MISMATCH" };
  const expected = createHmac("sha256", input.appSecret).update(input.rawBody, "utf8").digest();
  return sameBytes(declared, expected) ? { ok: true } : { ok: false, reason: "SIGNATURE_MISMATCH" };
}

/**
 * Generic signed webhook: X-Beyu-Signature over `${timestamp}.${raw_body}`, with
 * X-Beyu-Timestamp inside the skew window. The signature is checked before the
 * window, so only an authentic request can reveal that it is stale.
 */
export function verifyTimestampedSignature(input: {
  secret: string;
  timestamp: string | null | undefined;
  rawBody: string;
  presented: string | null | undefined;
  receivedAt: Date;
  maxSkewSeconds?: number;
}): VerificationOutcome {
  const presented = (input.presented ?? "").trim();
  if (!presented) return { ok: false, reason: "SIGNATURE_MISSING" };
  const timestamp = (input.timestamp ?? "").trim();
  if (!timestamp) return { ok: false, reason: "TIMESTAMP_MISSING" };
  if (!UNIX_SECONDS.test(timestamp)) return { ok: false, reason: "TIMESTAMP_MALFORMED" };
  const declared = sha256HexFromHeader(presented);
  if (!input.secret || !declared) return { ok: false, reason: "SIGNATURE_MISMATCH" };
  const expected = createHmac("sha256", input.secret).update(`${timestamp}.${input.rawBody}`, "utf8").digest();
  if (!sameBytes(declared, expected)) return { ok: false, reason: "SIGNATURE_MISMATCH" };
  const skewSeconds = Math.abs(Math.floor(input.receivedAt.getTime() / 1000) - Number(timestamp));
  const window = input.maxSkewSeconds ?? WEBHOOK_MAX_SKEW_SECONDS;
  return skewSeconds <= window ? { ok: true } : { ok: false, reason: "TIMESTAMP_OUT_OF_WINDOW" };
}

function formFields(rawBody: string): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const [name, value] of new URLSearchParams(rawBody)) {
    const values = grouped.get(name);
    if (values) values.push(value);
    else grouped.set(name, [value]);
  }
  return grouped;
}

/** Sorted name+value concatenation. Repeated names contribute each distinct value once, sorted, as the reference SDK does. */
function serializeFormFields(fields: ReadonlyMap<string, readonly string[]>): string {
  let out = "";
  for (const name of [...fields.keys()].sort()) {
    const values = fields.get(name) ?? [];
    const distinct = values.length > 1 ? [...new Set(values)].sort() : values;
    for (const value of distinct) out += name + value;
  }
  return out;
}

function withoutPort(url: URL): string {
  const copy = new URL(url.toString());
  copy.port = "";
  return copy.toString();
}

function withStandardPort(url: URL): string {
  if (url.port) return url.toString();
  const port = url.protocol === "https:" ? ":443" : ":80";
  let out = `${url.protocol}//`;
  out += url.username;
  out += url.password ? `:${url.password}` : "";
  out += url.username || url.password ? "@" : "";
  out += url.host ? url.host + port : "";
  out += url.pathname + url.search + url.hash;
  return out;
}

/** Re-encode the query string the way the legacy querystring module does, as the reference SDK does. */
function withLegacyQuery(url: string): string {
  const parsed = new URL(url);
  if (!parsed.search) return url;
  const query = parseQuery(parsed.search.slice(1));
  parsed.search = "";
  return `${parsed.toString()}?${stringifyQuery(query)}`;
}

function twilioUrlCandidates(rawUrl: string): string[] {
  const parsed = new URL(rawUrl);
  const bare = withoutPort(parsed);
  const standard = withStandardPort(parsed);
  return [...new Set([bare, withLegacyQuery(bare), standard, withLegacyQuery(standard)])];
}

function twilioSignatureMatches(
  authToken: string,
  presented: string,
  requestUrl: string,
  fields: ReadonlyMap<string, readonly string[]>,
): VerificationOutcome {
  const presentedBytes = Buffer.from(presented, "utf8");
  const suffix = serializeFormFields(fields);
  for (const candidate of twilioUrlCandidates(requestUrl)) {
    const expected = createHmac("sha1", authToken).update(candidate + suffix, "utf8").digest("base64");
    if (sameBytes(presentedBytes, Buffer.from(expected, "utf8"))) return { ok: true };
  }
  return { ok: false, reason: "SIGNATURE_MISMATCH" };
}

/**
 * Twilio: X-Twilio-Signature. `requestUrl` must be the exact public URL Twilio
 * called, including its query string. Never decoded or re-encoded by the caller.
 */
export function verifyTwilioSignature(input: {
  authToken: string;
  requestUrl: string;
  contentType: string | null | undefined;
  rawBody: string;
  presented: string | null | undefined;
}): VerificationOutcome {
  const presented = (input.presented ?? "").trim();
  if (!presented) return { ok: false, reason: "SIGNATURE_MISSING" };
  if (!input.authToken) return { ok: false, reason: "SIGNATURE_MISMATCH" };
  let url: URL;
  try {
    url = new URL(input.requestUrl);
  } catch {
    return { ok: false, reason: "SIGNATURE_MISMATCH" };
  }
  if (url.searchParams.has("bodySHA256")) {
    const declaredHash = Buffer.from((url.searchParams.get("bodySHA256") ?? "").toLowerCase(), "utf8");
    const actualHash = Buffer.from(createHash("sha256").update(input.rawBody, "utf8").digest("hex"), "utf8");
    if (!sameBytes(declaredHash, actualHash)) return { ok: false, reason: "BODY_HASH_MISMATCH" };
    return twilioSignatureMatches(input.authToken, presented, input.requestUrl, new Map());
  }
  if (!(input.contentType ?? "").toLowerCase().includes("application/x-www-form-urlencoded")) {
    return { ok: false, reason: "CONTENT_TYPE_NOT_FORM" };
  }
  return twilioSignatureMatches(input.authToken, presented, input.requestUrl, formFields(input.rawBody));
}

/**
 * Verify one inbound request against the scheme implied by the provider type.
 * `headers` names are matched case-insensitively.
 */
export function verifyInboundWebhook(input: {
  providerType: string;
  signingSecretRef: string | null;
  requestUrl: string;
  rawBody: string;
  headers: Readonly<Record<string, string>>;
  receivedAt: Date;
  env?: Readonly<Record<string, string | undefined>>;
}): InboundVerification {
  const scheme = signatureSchemeFor(input.providerType);
  if (!scheme) return { verified: false, scheme: null, reason: "SIGNATURE_SCHEME_NOT_IMPLEMENTED" };

  const secret = resolveSigningSecret(input.signingSecretRef, input.env ?? process.env);
  if (!secret.ok) return { verified: false, scheme, reason: secret.reason };

  const headers = new Map(Object.entries(input.headers).map(([name, value]) => [name.toLowerCase(), value]));
  const header = (name: string): string | null => headers.get(name) ?? null;

  let outcome: VerificationOutcome;
  switch (scheme) {
    case "META_HMAC_SHA256":
      outcome = verifyMetaSignature({
        appSecret: secret.secret,
        rawBody: input.rawBody,
        presented: header("x-hub-signature-256"),
      });
      break;
    case "TWILIO_HMAC_SHA1":
      outcome = verifyTwilioSignature({
        authToken: secret.secret,
        requestUrl: input.requestUrl,
        contentType: header("content-type"),
        rawBody: input.rawBody,
        presented: header("x-twilio-signature"),
      });
      break;
    case "BEYU_TIMESTAMPED_HMAC_SHA256":
      outcome = verifyTimestampedSignature({
        secret: secret.secret,
        timestamp: header("x-beyu-timestamp"),
        rawBody: input.rawBody,
        presented: header("x-beyu-signature"),
        receivedAt: input.receivedAt,
      });
      break;
  }
  return outcome.ok ? { verified: true, scheme } : { verified: false, scheme, reason: outcome.reason };
}
