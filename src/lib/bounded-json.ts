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

/** Stream with a byte cap even when Content-Length is missing or dishonest. */
export async function readBoundedJson(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > JSON_INPUT_LIMITS.bytes) throw new JsonInputLimitError(413);
  // Match the previous request.json().catch(() => ({})) behavior for absent or consumed bodies.
  if (!request.body || request.bodyUsed) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > JSON_INPUT_LIMITS.bytes) {
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
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(data));
  } catch {
    // Preserve parseBody's historical malformed/empty JSON behavior.
    return {};
  }
  assertJsonComplexity(json);
  return json;
}
