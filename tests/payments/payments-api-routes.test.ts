/**
 * BEYU OS — Payments API Route Coverage.
 *
 * Closes the payment API-route coverage gap recorded by earlier phases: Finance
 * OS had an API-schema test file (tests/finance/finance-api-routes.test.ts) but
 * the payment subsystem had no equivalent executable coverage asserting that
 * the documented /api/v1/payments/* surface exists, exports only the expected
 * HTTP methods, and imports cleanly.
 *
 * Importing every route module makes a broken export (wrong import, non-standard
 * method symbol such as the agriculture `POST_events` defect, missing function)
 * fail collection here rather than at deployment.
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const PAYMENTS_ROUTES_ROOT = join(process.cwd(), "src/app/api/v1/payments");

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findRouteFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out.sort();
}

const SUPPORTED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** Expected HTTP surface per route path (relative to /api/v1/payments). */
const EXPECTED: Record<string, string[]> = {
  "exceptions/[id]/resolve": ["POST"],
  providers: ["GET"],
  reconciliation: ["GET", "POST"],
  settlements: ["GET", "POST", "OPTIONS"],
  "transactions/[id]/accounting": ["POST"],
  "transactions/[id]/review": ["POST"],
  "transactions/[id]": ["GET"],
  transactions: ["GET"],
  "webhook/[provider]": ["POST", "GET"],
};

describe("Payments OS — API route coverage", () => {
  const routeFiles = findRouteFiles(PAYMENTS_ROUTES_ROOT);

  it("covers every documented payments route path", async () => {
    const paths = routeFiles
      .map((f) => f.replace(PAYMENTS_ROUTES_ROOT + "/", "").replace("/route.ts", ""))
      .sort();
    expect(paths).toEqual(Object.keys(EXPECTED).sort());
  });

  it("every route module imports cleanly and exports only supported HTTP methods", async () => {
    for (const file of routeFiles) {
      const rel = file.replace(PAYMENTS_ROUTES_ROOT + "/", "").replace("/route.ts", "");
      const mod = (await import(file)) as Record<string, unknown>;
      const exportedNames = Object.keys(mod).filter(
        (name) => name !== "dynamic" && name !== "revalidate" && name !== "runtime" && name !== "preferredRegion",
      );
      const expected = EXPECTED[rel];
      expect(expected, `route ${rel} has no expected-method entry`).toBeDefined();

      // Every export must be a supported HTTP method and must be expected.
      for (const name of exportedNames) {
        expect(SUPPORTED_METHODS.has(name), `route ${rel} exports unsupported symbol ${name}`).toBe(true);
        expect(expected, `route ${rel} exports ${name} but it is not in the expected surface`).toContain(name);
        expect(typeof mod[name], `route ${rel} export ${name} is not callable`).toBe("function");
      }
      // Every expected method must actually be exported.
      for (const method of expected) {
        expect(typeof mod[method], `route ${rel} is missing expected method ${method}`).toBe("function");
      }
    }
  });

  it("no payments route file exports a non-standard method symbol (POST_events class of defect)", async () => {
    for (const file of routeFiles) {
      const source = await import("node:fs/promises").then((fs) => fs.readFile(file, "utf8"));
      for (const line of source.split("\n")) {
        const match = /export\s+(?:async\s+)?(?:const\s+|function\s+)?([A-Z]+_[A-Za-z]+)\s*=?\s*(?:async|\(|function)/.exec(line);
        if (match) {
          expect(SUPPORTED_METHODS.has(match[1]), `${file}: non-standard method export ${match[1]}`).toBe(true);
        }
      }
    }
  });
});
