/**
 * Production database release is never automatic (audit H-9; decision D-6).
 *
 * A push to main may run the read-only live preflight. Every job that migrates,
 * publishes a release record, verifies the live runtime or runs the Production
 * Verification Gate must run only on an explicit workflow_dispatch with mode=deploy.
 * The check is textual, which matches the other workflow guards in this repository.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW = join(__dirname, "..", "..", ".github", "workflows", "db-release.yml");
const lines = readFileSync(WORKFLOW, "utf8").split("\n");

function jobCondition(job: string): string {
  const start = lines.findIndex((l) => l === `  ${job}:`);
  expect(start, `job ${job} exists`).toBeGreaterThan(-1);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[a-z][a-z0-9-]*:$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const block = lines.slice(start, end);
  const ifAt = block.findIndex((l) => /^ {4}if:/.test(l));
  expect(ifAt, `job ${job} has an if: condition`).toBeGreaterThan(-1);
  const conditionLines = [block[ifAt]];
  for (let i = ifAt + 1; i < block.length && /^ {6}\S/.test(block[i]); i++) conditionLines.push(block[i]);
  return conditionLines.join("\n");
}

describe("production database release is dispatch-only (D-6)", () => {
  for (const job of ["deploy", "release-record", "runtime-verify", "pvg"]) {
    it(`${job} runs only on workflow_dispatch with mode=deploy`, () => {
      const condition = jobCondition(job);
      expect(condition).not.toMatch(/github\.event_name == 'push'/);
      expect(condition).not.toMatch(/github\.event_name == 'schedule'/);
      expect(condition).toMatch(/github\.event_name == 'workflow_dispatch'/);
      expect(condition).toMatch(/inputs\.mode == 'deploy'/);
    });
  }

  it("the read-only live preflight may still run on push, and mutates nothing", () => {
    const condition = jobCondition("live-preflight");
    expect(condition).toMatch(/github\.event_name == 'push'/);
    expect(condition).not.toMatch(/inputs\.mode == 'deploy' \|\|/);
  });

  it("no job bound to the Production environment may run on push", () => {
    // Structural backstop: a future mutating job added with `environment:
    // Production` is caught even if it is missing from the list above.
    const prodJobs: string[] = [];
    let current: string | null = null;
    for (const line of lines) {
      const jobMatch = line.match(/^ {2}([a-z][a-z0-9-]*):\s*$/);
      if (jobMatch) {
        current = jobMatch[1];
        continue;
      }
      if (current && /^ {4}environment: Production/.test(line)) prodJobs.push(current);
    }
    expect(prodJobs.length).toBeGreaterThan(0);
    for (const job of prodJobs) {
      expect(jobCondition(job)).not.toMatch(/github\.event_name == 'push'/);
    }
  });

  it("the header records the dispatch-only invariant", () => {
    expect(lines.join("\n")).toMatch(/NO AUTOMATIC PRODUCTION MIGRATION \(decision D-6\)/);
  });
});
