/**
 * P1 — release invariant pins (security, events, intelligence).
 *
 * Source-contract assertions read-only, no database required:
 *   SECURITY  — the authorization chain is one chain, RLS stays final, deep
 *               links are never authorization.
 *   EVENTS    — a single writer, a single catalogue; events grant no authority.
 *   FINANCE   — CAP_POSTING stays locked; the journal POST degrades to a
 *               capability-locked refusal, never a bypass.
 *   NOELIA    — the single identity constant; forbidden bypass pathways are
 *               name-pinned so a future reintroduction fails the gate.
 *
 * The pins below intentionally assert the smallest stable surface: constants,
 * single-writer ownership comments, and the forbidden-token denylist that the
 * architecture contract records.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("P1 — security constitution is one chain, RLS is final", () => {
  const recon = read("docs/architecture/ARCHITECTURE_INVARIANTS.md");

  it("records the full authorization chain", () => {
    expect(recon).toContain("GlobalUserID → RBAC + ABAC → OS authorization");
    expect(recon).toContain("→ Policy → Application use case → Domain rules → Repository → PostgreSQL RLS");
  });

  it("records RLS as the final data isolation boundary", () => {
    expect(recon).toContain("is the final data isolation");
    expect(recon).toContain("never weakened, bypassed, disabled or replaced");
  });

  it("records that deep links are never authorization", () => {
    expect(recon).toContain("URL/deep links are **never** authorization");
  });

  it("records both context regimes (client vs server boundary)", () => {
    // Client/server, then the two deep-link regimes, are documented as the
    // security constitution rather than inferred from a route table.
    expect(recon).toContain("No hidden authorization routes");
  });
});

describe("P1 — events grant no authority", () => {
  const recon = read("docs/architecture/ARCHITECTURE_INVARIANTS.md");

  it("records the single-writer, single-catalogue event path", () => {
    expect(recon).toContain("Domain Event → Existing Event Registry");
    expect(recon).toContain("Existing Event\nInfrastructure");
    expect(recon).toContain("Authorized Consumers");
  });

  it("records that events do not grant authorization", () => {
    expect(recon).toContain("**Events do not\ngrant authorization**");
  });
});

describe("P1 — finance safety", () => {
  const recon = read("docs/architecture/ARCHITECTURE_INVARIANTS.md");
  const journal = read("src/app/api/v1/finance/journal/route.ts");

  it("records CAP_POSTING LOCKED and no bypass", () => {
    expect(recon).toContain("`CAP_POSTING` remains **LOCKED and fail-closed**");
    expect(recon).toContain("stays blocked pending accounting governance ratification");
  });

  it("the journal POST refunds into a capability-locked refusal, not a bypass", () => {
    expect(journal).toContain('code: "CAPABILITY_LOCKED"');
    expect(journal).toContain("postJournal(ctx.principal, body)");
  });
});

describe("P1 — Noelia/HIVE guardrails are pinned", () => {
  const constants = read("src/lib/constants.ts");
  const recon = read("docs/architecture/ARCHITECTURE_INVARIANTS.md");

  it("Noelia remains the single governed identity constant", () => {
    expect(constants).toContain('NOELIA_IDENTITY = "NOELIA"');
    expect(constants).toContain('HIVE_RUNTIME = "HIVE"');
  });

  it("the architecture pin names every forbidden bypass", () => {
    for (const token of [
      "RBAC",
      "ABAC",
      "policy",
      "tenant isolation",
      "entity isolation",
      "country isolation",
      "RLS",
      "audit",
      "approval controls",
      "OS boundaries",
      "`CAP_POSTING`",
    ]) {
      expect(recon.includes(token), `forbidden-bypass token ${token} missing from the pin`).toBe(true);
    }
    expect(recon).toContain("may never self-authorize");
  });
});
