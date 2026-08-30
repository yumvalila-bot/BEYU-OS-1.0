import { ConsoleLogger } from "@nestjs/common";

/** Keys whose values are redacted before a log record is emitted. */
const SECRET_KEYS = new Set([
  "password",
  "passwd",
  "secret",
  "token",
  "refresh_token",
  "access_token",
  "authorization",
  "api_key",
  "apikey",
  "cookie",
  "jwt",
]);

function redactValue(key: string): string {
  const k = key.toLowerCase();
  for (const s of SECRET_KEYS) {
    if (k.includes(s)) return "[REDACTED]";
  }
  return "[REDACTED]";
}

/**
 * Structured (JSON-lines) application logger. Emits one JSON object per line
 * with `ts` (epoch ms), `level`, and `msg`. Optional `ctx` fields are emitted
 * verbatim except for known secret keys, which are always redacted, so no
 * secrets or PII credentials reach the log stream. No raw tokens or passwords
 * are ever logged.
 */
export class JsonLogger extends ConsoleLogger {
  override log(message: string, ...optionalParams: any[]): void {
    this.write("info", message, optionalParams[0]);
  }
  override error(message: string, ...optionalParams: any[]): void {
    this.write("error", message, optionalParams[0]);
  }
  override warn(message: string, ...optionalParams: any[]): void {
    this.write("warn", message, optionalParams[0]);
  }
  override debug(message: string, ...optionalParams: any[]): void {
    this.write("debug", message, optionalParams[0]);
  }
  override verbose(message: string, ...optionalParams: any[]): void {
    this.write("verbose", message, optionalParams[0]);
  }

  private write(
    level: string,
    message: string,
    ctx: Record<string, unknown> | undefined,
  ): void {
    const record: Record<string, unknown> = {
      ts: Date.now(),
      level,
      msg: message,
    };
    if (ctx && typeof ctx === "object") {
      for (const [k, v] of Object.entries(ctx)) {
        record[k] = SECRET_KEYS.has(k.toLowerCase()) ? redactValue(k) : v;
      }
    }
    const line = JSON.stringify(record);
    if (level === "error") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  }
}
