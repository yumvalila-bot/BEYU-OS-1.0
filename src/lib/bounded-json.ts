/** Limits for the shared JSON API boundary. They apply before schema validation. */
export const JSON_INPUT_LIMITS = {
  bytes: 1024 * 1024,
  depth: 32,
  arrayItems: 1000,
  objectProperties: 1000,
  stringLength: 65536,
  nodes: 10000,
} as const;

export class JsonInputLimitError extends Error {
  readonly status: number;
  constructor(status: 413 | 422) {
    super("Request payload exceeds allowed limits.");
    this.name = "JsonInputLimitError";
    this.status = status;
  }
}

/** Format failures at strict credential endpoints. No input is included. */
export class JsonRequestFormatError extends Error {
  constructor(readonly status: 400 | 415) {
    super(status === 415 ? "A JSON request is required." : "The request body is invalid.");
    this.name = "JsonRequestFormatError";
  }
}

/** Credential schemas have at most a few 200-character fields; 16 KiB also
 * leaves room for JSON escaping without accepting unbounded unauthenticated input. */
export const CREDENTIAL_JSON_BYTES = 16 * 1024;

/** Iterative traversal avoids recursing on attacker-controlled JSON depth. */
export function assertJsonComplexity(value: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (++count > JSON_INPUT_LIMITS.nodes || current.depth > JSON_INPUT_LIMITS.depth) throw new JsonInputLimitError(422);
    if (typeof current.value === "string" && current.value.length > JSON_INPUT_LIMITS.stringLength) throw new JsonInputLimitError(422);
    if (!current.value || typeof current.value !== "object") continue;
    if (Array.isArray(current.value)) {
      if (current.value.length > JSON_INPUT_LIMITS.arrayItems) throw new JsonInputLimitError(422);
      for (const item of current.value) pending.push({ value: item, depth: current.depth + 1 });
    } else {
      const entries = Object.entries(current.value);
      if (entries.length > JSON_INPUT_LIMITS.objectProperties) throw new JsonInputLimitError(422);
      for (const [key, item] of entries) {
        if (key.length > JSON_INPUT_LIMITS.stringLength) throw new JsonInputLimitError(422);
        pending.push({ value: item, depth: current.depth + 1 });
      }
    }
    if (pending.length + count > JSON_INPUT_LIMITS.nodes) throw new JsonInputLimitError(422);
  }
}

/** Stream raw bytes with a cap even when Content-Length is missing or dishonest. */
async function readBoundedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) throw new JsonInputLimitError(413);
  if (!request.body || request.bodyUsed) throw new JsonRequestFormatError(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw new JsonInputLimitError(413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return data;
}

/** Preserve the Web Request.text() UTF-8 decoding used by webhook signatures. */
export async function readBoundedText(request: Request, maxBytes: number): Promise<string> {
  // Request.text() returns an empty string for an absent body.
  if (!request.body && !request.bodyUsed) return "";
  return new TextDecoder().decode(await readBoundedBytes(request, maxBytes));
}

/** Stream with a byte cap even when Content-Length is missing or dishonest. */
export async function readBoundedJson(
  request: Request,
  options: { maxBytes?: number; strict?: boolean } = {},
): Promise<unknown> {
  const maxBytes = options.maxBytes ?? JSON_INPUT_LIMITS.bytes;
  if (options.strict) {
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (mediaType !== "application/json") throw new JsonRequestFormatError(415);
    if (!request.body || request.bodyUsed) throw new JsonRequestFormatError(400);
  }
  // Preserve the shared parseBody fallback for previously consumed/empty bodies.
  if (!request.body || request.bodyUsed) return {};
  const data = await readBoundedBytes(request, maxBytes);
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: options.strict }).decode(data));
  } catch {
    if (options.strict) throw new JsonRequestFormatError(400);
    // Preserve parseBody's historical malformed/empty JSON behavior.
    return {};
  }
  assertJsonComplexity(json);
  return json;
}

/** Strict streaming boundary for public credential and enrollment endpoints. */
export function readCredentialJson(request: Request): Promise<unknown> {
  return readBoundedJson(request, { maxBytes: CREDENTIAL_JSON_BYTES, strict: true });
}
