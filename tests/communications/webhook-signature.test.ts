/**
 * Inbound webhook signature verification — pure, no database.
 *
 * Every known-answer vector below was computed OUTSIDE this repository: Meta and
 * generic signatures with OpenSSL, Twilio signatures with the official Twilio SDK
 * (twilio@5, validateRequest / validateRequestWithBody). The code under test is
 * never used to produce its own expected values.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  resolveSigningSecret,
  signatureSchemeFor,
  verifyInboundWebhook,
  verifyMetaSignature,
  verifyTimestampedSignature,
  verifyTwilioSignature,
  WEBHOOK_MAX_SKEW_SECONDS,
} from "@/lib/communications/webhook-signature";

const META_SECRET = "meta-app-secret-test-0123456789";
const META_BODY =
  '{"object":"whatsapp_business_account","entry":[{"id":"WABA_TEST","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"255700000000","phone_number_id":"PNID_TEST"},"contacts":[{"profile":{"name":"Test Sender"},"wa_id":"255700000001"}],"messages":[{"from":"255700000001","id":"wamid.TEST0001","timestamp":"1791552000","type":"text","text":{"body":"Habari"}}]}}]}]}';
const META_SIGNATURE = "sha256=5766588aa15af67775f9f122785928ea3be056ca57dfd59dca51c30f7be0fb2a";

const GENERIC_SECRET = "generic-webhook-secret-test-0123456789";
const GENERIC_TIMESTAMP = "1791552000";
const GENERIC_BODY =
  '{"event_id":"EVT-GEN-0001","type":"MESSAGE","from":"ops@beyu.example.test","to":"inbox@beyu.example.test","text":"Habari"}';
const GENERIC_SIGNATURE = "sha256=0ee15c1612b7efe1b584a2191a1e0e2a9917e0346289a63f9c9e5ae2deaf96c8";
const GENERIC_RECEIVED_AT = new Date(Number(GENERIC_TIMESTAMP) * 1000 + 1000);

const TWILIO_TOKEN = "twilio-test-token-0123456789abcdef";
const TWILIO_FORM_URL = "https://beyu.example.test/api/v1/communications/webhook/SMS_LIVE";
const TWILIO_FORM_BODY =
  "MessageSid=SM0123456789abcdef0123456789abcdef&From=%2B255700000001&To=%2B255700000000&Body=Habari%2C+ni+saa+ngapi%3F";
const TWILIO_FORM_SIGNATURE = "ld3rzqBpzFjvOzvUlwa/LqDfZEQ=";
const TWILIO_QUERY_URL = `${TWILIO_FORM_URL}?tenant_hint=abc&region=tz`;
const TWILIO_QUERY_SIGNATURE = "/4FEIXMOOoPlWfmBLIPTdrAtLNI=";
const TWILIO_JSON_BODY = '{"MessageSid":"SM0123456789abcdef0123456789abcdef","From":"+255700000001","Body":"Habari"}';
const TWILIO_JSON_URL =
  `${TWILIO_FORM_URL}?bodySHA256=1b6e954dcf3c68cb75830d1e8c5568367a344b1c964fafceea1289299bd4d594`;
const TWILIO_JSON_SIGNATURE = "zs69YiWNFWbj7Y5HvjDznYmYsec=";
const FORM = "application/x-www-form-urlencoded";

describe("webhook signature — fixtures are internally consistent", () => {
  // Guards against an accidental edit to a vector or body. It uses Node crypto directly, not the module under test.
  it("the Meta and generic vectors match a direct HMAC over the fixture bodies", () => {
    expect(`sha256=${createHmac("sha256", META_SECRET).update(META_BODY).digest("hex")}`).toBe(META_SIGNATURE);
    expect(
      `sha256=${createHmac("sha256", GENERIC_SECRET).update(`${GENERIC_TIMESTAMP}.${GENERIC_BODY}`).digest("hex")}`,
    ).toBe(GENERIC_SIGNATURE);
  });
});

describe("webhook signature — scheme is chosen by provider_type only", () => {
  it("maps each implemented provider type to exactly one scheme", () => {
    expect(signatureSchemeFor("META_WHATSAPP")).toBe("META_HMAC_SHA256");
    expect(signatureSchemeFor("META_WHATSAPP_CLOUD")).toBe("META_HMAC_SHA256");
    expect(signatureSchemeFor("TWILIO_SMS")).toBe("TWILIO_HMAC_SHA1");
    expect(signatureSchemeFor("GENERIC_SIGNED_WEBHOOK")).toBe("BEYU_TIMESTAMPED_HMAC_SHA256");
  });

  it("refuses every other provider type, including simulated and substring look-alikes", () => {
    for (const providerType of [
      "META_WHATSAPP_SIMULATED",
      "SMS_SIMULATED",
      "EMAIL_SIMULATED",
      "SENDGRID_EMAIL",
      "BEYU_IN_APP",
      "BEYU_INTERNAL",
      "TWILIO_SMS_LEGACY",
      "",
    ]) {
      expect(signatureSchemeFor(providerType), providerType).toBeNull();
    }
  });
});

describe("webhook signature — signing secret resolution", () => {
  const env = {
    BEYU_WH_WA_SECRET: "meta-app-secret-test-0123456789",
    BEYU_WH_SHORT: "fifteen-chars-x",
    BEYU_WH_SPACED: " meta-app-secret-test-0123456789 ",
    BEYU_WH_EMPTY: "",
    AUTH_SECRET: "a-platform-credential-that-must-not-be-reused",
  };

  it("accepts a reference that names a configured environment variable", () => {
    expect(resolveSigningSecret("BEYU_WH_WA_SECRET", env)).toEqual({ ok: true, secret: env.BEYU_WH_WA_SECRET });
  });

  it("refuses a missing reference", () => {
    for (const ref of [null, undefined, ""]) {
      expect(resolveSigningSecret(ref, env)).toEqual({ ok: false, reason: "SIGNING_SECRET_REF_MISSING" });
    }
  });

  it("refuses a reference that is not an environment variable name, including a pasted secret", () => {
    for (const ref of ["whsec_live_0123456789abcdef", "lower_case_name", "HAS SPACE", "A", "sk_live_123"]) {
      expect(resolveSigningSecret(ref, env), ref).toEqual({ ok: false, reason: "SIGNING_SECRET_REF_MALFORMED" });
    }
  });

  it("refuses references to platform credentials", () => {
    expect(resolveSigningSecret("AUTH_SECRET", env)).toEqual({ ok: false, reason: "SIGNING_SECRET_REF_DENIED" });
    expect(resolveSigningSecret("DATABASE_URL", env)).toEqual({ ok: false, reason: "SIGNING_SECRET_REF_DENIED" });
  });

  it("refuses a reference whose variable is unset or empty", () => {
    expect(resolveSigningSecret("BEYU_WH_UNSET", env)).toEqual({ ok: false, reason: "SIGNING_SECRET_NOT_CONFIGURED" });
    expect(resolveSigningSecret("BEYU_WH_EMPTY", env)).toEqual({ ok: false, reason: "SIGNING_SECRET_NOT_CONFIGURED" });
  });

  it("refuses a value with surrounding whitespace, and a value shorter than the minimum", () => {
    expect(resolveSigningSecret("BEYU_WH_SPACED", env)).toEqual({ ok: false, reason: "SIGNING_SECRET_MALFORMED_VALUE" });
    expect(resolveSigningSecret("BEYU_WH_SHORT", env)).toEqual({ ok: false, reason: "SIGNING_SECRET_TOO_SHORT" });
  });
});

describe("webhook signature — Meta X-Hub-Signature-256", () => {
  const body = META_BODY;

  it("accepts the known-answer signature over the raw body", () => {
    expect(verifyMetaSignature({ appSecret: META_SECRET, rawBody: body, presented: META_SIGNATURE })).toEqual({ ok: true });
  });

  it("accepts an upper-case hex digest, since hex is case-insensitive", () => {
    const upper = `sha256=${META_SIGNATURE.slice(7).toUpperCase()}`;
    expect(verifyMetaSignature({ appSecret: META_SECRET, rawBody: body, presented: upper })).toEqual({ ok: true });
  });

  it("refuses the sha256= prefix on its own (the old prefix-only check accepted this)", () => {
    expect(verifyMetaSignature({ appSecret: META_SECRET, rawBody: body, presented: "sha256=" })).toEqual({
      ok: false,
      reason: "SIGNATURE_MISMATCH",
    });
    expect(verifyMetaSignature({ appSecret: META_SECRET, rawBody: body, presented: `sha256=${"a".repeat(64)}` })).toEqual({
      ok: false,
      reason: "SIGNATURE_MISMATCH",
    });
  });

  it("refuses a valid-looking digest for a body that differs by one byte", () => {
    const tampered = body.replace("Habari", "Habarj");
    expect(verifyMetaSignature({ appSecret: META_SECRET, rawBody: tampered, presented: META_SIGNATURE })).toEqual({
      ok: false,
      reason: "SIGNATURE_MISMATCH",
    });
  });

  it("refuses a digest produced with a different secret", () => {
    expect(verifyMetaSignature({ appSecret: "another-app-secret-0123456789", rawBody: body, presented: META_SIGNATURE })).toEqual({
      ok: false,
      reason: "SIGNATURE_MISMATCH",
    });
  });

  it("refuses bare hex without the prefix, and the legacy SHA-1 header format", () => {
    const bare = META_SIGNATURE.slice(7);
    expect(verifyMetaSignature({ appSecret: META_SECRET, rawBody: body, presented: bare }).ok).toBe(false);
    expect(verifyMetaSignature({ appSecret: META_SECRET, rawBody: body, presented: `sha1=${"0".repeat(40)}` }).ok).toBe(false);
  });

  it("reports a missing header as missing", () => {
    expect(verifyMetaSignature({ appSecret: META_SECRET, rawBody: body, presented: null })).toEqual({
      ok: false,
      reason: "SIGNATURE_MISSING",
    });
  });

  it("never passes with an empty secret, even for a digest computed with the empty key", () => {
    const emptyKeyDigest = `sha256=${createHmac("sha256", "").update(body).digest("hex")}`;
    expect(verifyMetaSignature({ appSecret: "", rawBody: body, presented: emptyKeyDigest }).ok).toBe(false);
  });
});

describe("webhook signature — generic signed webhook (X-Beyu-Timestamp / X-Beyu-Signature)", () => {
  const verify = (overrides: Partial<Parameters<typeof verifyTimestampedSignature>[0]> = {}) =>
    verifyTimestampedSignature({
      secret: GENERIC_SECRET,
      timestamp: GENERIC_TIMESTAMP,
      rawBody: GENERIC_BODY,
      presented: GENERIC_SIGNATURE,
      receivedAt: GENERIC_RECEIVED_AT,
      ...overrides,
    });

  it("accepts the known-answer signature inside the window", () => {
    expect(verify()).toEqual({ ok: true });
  });

  it("accepts a request exactly at the skew boundary and refuses one second beyond it", () => {
    const atBoundary = new Date((Number(GENERIC_TIMESTAMP) + WEBHOOK_MAX_SKEW_SECONDS) * 1000);
    const beyond = new Date((Number(GENERIC_TIMESTAMP) + WEBHOOK_MAX_SKEW_SECONDS + 1) * 1000);
    expect(verify({ receivedAt: atBoundary })).toEqual({ ok: true });
    expect(verify({ receivedAt: beyond })).toEqual({ ok: false, reason: "TIMESTAMP_OUT_OF_WINDOW" });
  });

  it("refuses an authentic but future-dated request beyond the window", () => {
    const earlier = new Date((Number(GENERIC_TIMESTAMP) - WEBHOOK_MAX_SKEW_SECONDS - 1) * 1000);
    expect(verify({ receivedAt: earlier })).toEqual({ ok: false, reason: "TIMESTAMP_OUT_OF_WINDOW" });
  });

  it("reveals a stale window only for an authentic request, never for a forgery", () => {
    const stale = new Date((Number(GENERIC_TIMESTAMP) + 3600) * 1000);
    expect(verify({ receivedAt: stale, presented: `sha256=${"b".repeat(64)}` })).toEqual({
      ok: false,
      reason: "SIGNATURE_MISMATCH",
    });
  });

  it("refuses a replay: the old signature presented with a fresh timestamp", () => {
    const fresh = String(Number(GENERIC_TIMESTAMP) + 60);
    expect(verify({ timestamp: fresh, receivedAt: new Date((Number(fresh) + 1) * 1000) })).toEqual({
      ok: false,
      reason: "SIGNATURE_MISMATCH",
    });
  });

  it("refuses a signature computed over the body alone, without the timestamp prefix", () => {
    const bodyOnly = `sha256=${createHmac("sha256", GENERIC_SECRET).update(GENERIC_BODY).digest("hex")}`;
    expect(verify({ presented: bodyOnly })).toEqual({ ok: false, reason: "SIGNATURE_MISMATCH" });
  });

  it("refuses a missing or malformed timestamp", () => {
    expect(verify({ timestamp: null })).toEqual({ ok: false, reason: "TIMESTAMP_MISSING" });
    expect(verify({ timestamp: "17915520000" })).toEqual({ ok: false, reason: "TIMESTAMP_MALFORMED" });
    expect(verify({ timestamp: "yesterday" })).toEqual({ ok: false, reason: "TIMESTAMP_MALFORMED" });
  });

  it("reports a missing signature as missing", () => {
    expect(verify({ presented: undefined })).toEqual({ ok: false, reason: "SIGNATURE_MISSING" });
  });
});

describe("webhook signature — Twilio X-Twilio-Signature", () => {
  it("accepts the form known-answer signed over the exact URL and sorted fields", () => {
    expect(
      verifyTwilioSignature({
        authToken: TWILIO_TOKEN,
        requestUrl: TWILIO_FORM_URL,
        contentType: `${FORM}; charset=utf-8`,
        rawBody: TWILIO_FORM_BODY,
        presented: TWILIO_FORM_SIGNATURE,
      }),
    ).toEqual({ ok: true });
  });

  it("does not depend on the order of the form fields in the body", () => {
    const reordered = TWILIO_FORM_BODY.split("&").reverse().join("&");
    expect(
      verifyTwilioSignature({
        authToken: TWILIO_TOKEN,
        requestUrl: TWILIO_FORM_URL,
        contentType: FORM,
        rawBody: reordered,
        presented: TWILIO_FORM_SIGNATURE,
      }),
    ).toEqual({ ok: true });
  });

  it("includes the query string of the exact URL in the signed material", () => {
    expect(
      verifyTwilioSignature({
        authToken: TWILIO_TOKEN,
        requestUrl: TWILIO_QUERY_URL,
        contentType: FORM,
        rawBody: TWILIO_FORM_BODY,
        presented: TWILIO_QUERY_SIGNATURE,
      }),
    ).toEqual({ ok: true });
    expect(
      verifyTwilioSignature({
        authToken: TWILIO_TOKEN,
        requestUrl: TWILIO_QUERY_URL.replace("region=tz", "region=ke"),
        contentType: FORM,
        rawBody: TWILIO_FORM_BODY,
        presented: TWILIO_QUERY_SIGNATURE,
      }),
    ).toEqual({ ok: false, reason: "SIGNATURE_MISMATCH" });
  });

  it("refuses the same signature presented for a different public URL", () => {
    expect(
      verifyTwilioSignature({
        authToken: TWILIO_TOKEN,
        requestUrl: "https://attacker.example.test/api/v1/communications/webhook/SMS_LIVE",
        contentType: FORM,
        rawBody: TWILIO_FORM_BODY,
        presented: TWILIO_FORM_SIGNATURE,
      }),
    ).toEqual({ ok: false, reason: "SIGNATURE_MISMATCH" });
  });

  it("refuses a form body with one field altered", () => {
    expect(
      verifyTwilioSignature({
        authToken: TWILIO_TOKEN,
        requestUrl: TWILIO_FORM_URL,
        contentType: FORM,
        rawBody: TWILIO_FORM_BODY.replace("Habari", "Habarj"),
        presented: TWILIO_FORM_SIGNATURE,
      }),
    ).toEqual({ ok: false, reason: "SIGNATURE_MISMATCH" });
  });

  it("refuses a different auth token", () => {
    expect(
      verifyTwilioSignature({
        authToken: "a-different-auth-token-000000",
        requestUrl: TWILIO_FORM_URL,
        contentType: FORM,
        rawBody: TWILIO_FORM_BODY,
        presented: TWILIO_FORM_SIGNATURE,
      }),
    ).toEqual({ ok: false, reason: "SIGNATURE_MISMATCH" });
  });

  it("accepts the explicit default port, since the signature covers the URL with or without it", () => {
    const explicitDefault = TWILIO_FORM_URL.replace("beyu.example.test", "beyu.example.test:443");
    expect(
      verifyTwilioSignature({
        authToken: TWILIO_TOKEN,
        requestUrl: explicitDefault,
        contentType: FORM,
        rawBody: TWILIO_FORM_BODY,
        presented: TWILIO_FORM_SIGNATURE,
      }),
    ).toEqual({ ok: true });
  });

  it("accepts a non-default port when the signature was computed with that port, and refuses another port", () => {
    const port8443Url = TWILIO_FORM_URL.replace("beyu.example.test", "beyu.example.test:8443");
    const port8443Signature = "geoR0D/sLPT0ewxglP/TnfVMrNE=";
    const port9443Signature = "1B443isWd3rd/X8BcmK2V/kmKPw=";
    expect(
      verifyTwilioSignature({
        authToken: TWILIO_TOKEN,
        requestUrl: port8443Url,
        contentType: FORM,
        rawBody: TWILIO_FORM_BODY,
        presented: port8443Signature,
      }),
    ).toEqual({ ok: true });
    expect(
      verifyTwilioSignature({
        authToken: TWILIO_TOKEN,
        requestUrl: port8443Url,
        contentType: FORM,
        rawBody: TWILIO_FORM_BODY,
        presented: port9443Signature,
      }),
    ).toEqual({ ok: false, reason: "SIGNATURE_MISMATCH" });
  });

  it("accepts a JSON body whose SHA-256 is carried in bodySHA256 and signed in the URL", () => {
    expect(
      verifyTwilioSignature({
        authToken: TWILIO_TOKEN,
        requestUrl: TWILIO_JSON_URL,
        contentType: "application/json",
        rawBody: TWILIO_JSON_BODY,
        presented: TWILIO_JSON_SIGNATURE,
      }),
    ).toEqual({ ok: true });
  });

  it("refuses a JSON body modified after signing, because its hash no longer matches bodySHA256", () => {
    expect(
      verifyTwilioSignature({
        authToken: TWILIO_TOKEN,
        requestUrl: TWILIO_JSON_URL,
        contentType: "application/json",
        rawBody: TWILIO_JSON_BODY.replace("Habari", "Habarj"),
        presented: TWILIO_JSON_SIGNATURE,
      }),
    ).toEqual({ ok: false, reason: "BODY_HASH_MISMATCH" });
  });

  it("refuses a JSON body without bodySHA256 and any body that is not form-encoded", () => {
    expect(
      verifyTwilioSignature({
        authToken: TWILIO_TOKEN,
        requestUrl: TWILIO_FORM_URL,
        contentType: "application/json",
        rawBody: TWILIO_FORM_BODY,
        presented: TWILIO_FORM_SIGNATURE,
      }),
    ).toEqual({ ok: false, reason: "CONTENT_TYPE_NOT_FORM" });
  });

  it("reports a missing signature as missing, and an unparseable URL as a mismatch", () => {
    expect(
      verifyTwilioSignature({ authToken: TWILIO_TOKEN, requestUrl: TWILIO_FORM_URL, contentType: FORM, rawBody: TWILIO_FORM_BODY, presented: "" }),
    ).toEqual({ ok: false, reason: "SIGNATURE_MISSING" });
    expect(
      verifyTwilioSignature({ authToken: TWILIO_TOKEN, requestUrl: "not a url", contentType: FORM, rawBody: TWILIO_FORM_BODY, presented: TWILIO_FORM_SIGNATURE }),
    ).toEqual({ ok: false, reason: "SIGNATURE_MISMATCH" });
  });
});

describe("webhook signature — verifyInboundWebhook (scheme, secret and signature together)", () => {
  const env = { BEYU_WH_WA_SECRET: META_SECRET, BEYU_WH_SMS_TOKEN: TWILIO_TOKEN, BEYU_WH_GEN_SECRET: GENERIC_SECRET };

  it("verifies a Meta request when the secret is configured and the header is valid, regardless of header case", () => {
    expect(
      verifyInboundWebhook({
        providerType: "META_WHATSAPP",
        signingSecretRef: "BEYU_WH_WA_SECRET",
        requestUrl: "https://beyu.example.test/api/v1/communications/webhook/WA_LIVE",
        rawBody: META_BODY,
        headers: { "X-Hub-Signature-256": META_SIGNATURE },
        receivedAt: new Date(),
        env,
      }),
    ).toEqual({ verified: true, scheme: "META_HMAC_SHA256" });
  });

  it("refuses an unsigned Meta request even when a secret is configured", () => {
    expect(
      verifyInboundWebhook({
        providerType: "META_WHATSAPP",
        signingSecretRef: "BEYU_WH_WA_SECRET",
        requestUrl: "https://beyu.example.test/api/v1/communications/webhook/WA_LIVE",
        rawBody: META_BODY,
        headers: {},
        receivedAt: new Date(),
        env,
      }),
    ).toEqual({ verified: false, scheme: "META_HMAC_SHA256", reason: "SIGNATURE_MISSING" });
  });

  it("refuses a provider with no signing secret reference, even if the signature would be valid", () => {
    expect(
      verifyInboundWebhook({
        providerType: "META_WHATSAPP",
        signingSecretRef: null,
        requestUrl: "https://beyu.example.test/api/v1/communications/webhook/WA_LIVE",
        rawBody: META_BODY,
        headers: { "x-hub-signature-256": META_SIGNATURE },
        receivedAt: new Date(),
        env,
      }),
    ).toEqual({ verified: false, scheme: "META_HMAC_SHA256", reason: "SIGNING_SECRET_REF_MISSING" });
  });

  it("refuses a simulated provider without reading any secret", () => {
    expect(
      verifyInboundWebhook({
        providerType: "META_WHATSAPP_SIMULATED",
        signingSecretRef: "BEYU_WH_WA_SECRET",
        requestUrl: "https://beyu.example.test/api/v1/communications/webhook/WHATSAPP_SIMULATED",
        rawBody: META_BODY,
        headers: { "x-hub-signature-256": META_SIGNATURE },
        receivedAt: new Date(),
        env,
      }),
    ).toEqual({ verified: false, scheme: null, reason: "SIGNATURE_SCHEME_NOT_IMPLEMENTED" });
  });

  it("verifies a Twilio form request using the configured auth token and the exact URL", () => {
    expect(
      verifyInboundWebhook({
        providerType: "TWILIO_SMS",
        signingSecretRef: "BEYU_WH_SMS_TOKEN",
        requestUrl: TWILIO_FORM_URL,
        rawBody: TWILIO_FORM_BODY,
        headers: { "content-type": FORM, "x-twilio-signature": TWILIO_FORM_SIGNATURE },
        receivedAt: new Date(),
        env,
      }),
    ).toEqual({ verified: true, scheme: "TWILIO_HMAC_SHA1" });
  });

  it("verifies a generic signed request with its timestamp inside the window", () => {
    expect(
      verifyInboundWebhook({
        providerType: "GENERIC_SIGNED_WEBHOOK",
        signingSecretRef: "BEYU_WH_GEN_SECRET",
        requestUrl: "https://beyu.example.test/api/v1/communications/webhook/EMAIL_LIVE",
        rawBody: GENERIC_BODY,
        headers: { "x-beyu-timestamp": GENERIC_TIMESTAMP, "x-beyu-signature": GENERIC_SIGNATURE },
        receivedAt: GENERIC_RECEIVED_AT,
        env,
      }),
    ).toEqual({ verified: true, scheme: "BEYU_TIMESTAMPED_HMAC_SHA256" });
  });
});
