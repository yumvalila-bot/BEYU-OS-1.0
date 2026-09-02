/**
 * CSRF route-inventory test.
 *
 * Walks every source *.controller.ts via fs and introspects Reflect metadata
 * on the compiled classes (loaded at runtime via ts-jest) to enumerate
 * every HTTP method decorator. Fails if any @Public() POST/PUT/PATCH/DELETE
 * route is NOT on the explicit allow list. The global CsrfDoubleSubmitGuard
 * is registered as APP_GUARD; @Public() is the sole escape hatch.
 */
import "reflect-metadata";
import * as path from "path";
import * as fs from "fs";
import { IS_PUBLIC_KEY } from "./csrf-double-submit.guard";

const BACKEND_SRC = path.resolve(__dirname, "..", "..");

const ALLOWED_PUBLIC_MUTATING = new Set([
  "POST /auth/login",
  "POST /auth/register",
  "POST /auth/refresh",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== "node_modules") {
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith(".controller.ts")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

describe("CSRF route inventory — @Public() mutating endpoints are allow-listed", () => {
  it("no @Public() POST/PUT/PATCH/DELETE route outside the explicit allow list exists", () => {
    const files = walk(BACKEND_SRC);
    const publicMutating: Array<{ method: string; fullPath: string }> = [];

    for (const file of files) {
      // Genuinely dynamic: `file` is discovered by walking the source tree at
      // runtime, so no static import can express it. Matches the existing
      // project convention for this rule (base.repository, e2e-harness,
      // ai-governance.service, src/test/e2e/*).
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(file.replace(/\.ts$/, ""));
      for (const exported of Object.values(mod as Record<string, any>)) {
        if (typeof exported !== "function") continue;
        const ctrlPath: string = Reflect.getMetadata("path", exported) ?? "";
        const isController =
          !!Reflect.getMetadata("controller", exported) ||
          ctrlPath !== undefined;
        if (!isController) continue;
        const ctrlPublic =
          Reflect.getMetadata(IS_PUBLIC_KEY, exported) === true;
        const proto = exported.prototype;
        if (!proto) continue;
        for (const name of Object.getOwnPropertyNames(proto)) {
          if (name === "constructor") continue;
          const fn = proto[name];
          if (typeof fn !== "function") continue;
          for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
            if (!Reflect.getMetadata(m.toLowerCase(), fn)) continue;
            const handlerPath = Reflect.getMetadata("path", fn) ?? "";
            const isPublic =
              ctrlPublic || Reflect.getMetadata(IS_PUBLIC_KEY, fn) === true;
            if (isPublic) {
              publicMutating.push({
                method: m,
                fullPath: normalizePath(ctrlPath, handlerPath),
              });
            }
          }
        }
      }
    }

    for (const { method, fullPath } of publicMutating) {
      const key = `${method} ${fullPath}`;
      if (!ALLOWED_PUBLIC_MUTATING.has(key)) {
        throw new Error(
          `@Public() mutating endpoint '${key}' is NOT on the CSRF allow list. ` +
            `Either remove @Public(), apply CSRF protection, or explicitly add ` +
            `to ALLOWED_PUBLIC_MUTATING after security review.`,
        );
      }
    }
  });
});

function normalizePath(ctrl: string, handler: string): string {
  const c = "/" + (ctrl ?? "").replace(/^\/|\/$/g, "");
  const h = handler ? "/" + String(handler).replace(/^\/|\/$/g, "") : "";
  const joined = (c + h).replace(/\/+/g, "/") || "/";
  return joined === "/" ? "/" : joined.replace(/\/$/, "");
}
