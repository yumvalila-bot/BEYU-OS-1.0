/**
 * Governed-release failure annotations.
 *
 * The deploy job's failure reason used to exist only in the step log, leaving
 * the API with nothing but "Process completed with exit code 1". These tests
 * pin both halves of the replacement: the reason becomes API-visible, and
 * publishing it never publishes infrastructure topology.
 */
import { describe, expect, it } from "vitest";
import { annotateError, annotateGateFailures, failSanitized } from "../../scripts/lib/ci-annotation";

const SENTINEL_PASSWORD = "SuperSecret123";
const SENTINEL_DSN = `postgresql://postgres.projref:${SENTINEL_PASSWORD}@db.projref.supabase.co:5432/postgres`;

function captureStdout(fn: () => void): string {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout as unknown as { write: (c: string) => boolean }).write = ((c: string) => {
    chunks.push(c);
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    (process.stdout as unknown as { write: unknown }).write = original;
  }
  return chunks.join("");
}

describe("ci-annotation", () => {
  it("emits a single-line ::error:: workflow command inside GitHub Actions", () => {
    const prev = process.env.GITHUB_ACTIONS;
    process.env.GITHUB_ACTIONS = "true";
    try {
      const out = captureStdout(() => annotateError("migration", "PERMISSION_DENIED (SQLSTATE 42501)"));
      expect(out).toBe("::error title=migration::migration: PERMISSION_DENIED (SQLSTATE 42501)\n");
    } finally {
      if (prev === undefined) delete process.env.GITHUB_ACTIONS;
      else process.env.GITHUB_ACTIONS = prev;
    }
  });

  it("is silent outside GitHub Actions so local runs stay clean", () => {
    const prev = process.env.GITHUB_ACTIONS;
    delete process.env.GITHUB_ACTIONS;
    try {
      expect(captureStdout(() => annotateError("migration", "PERMISSION_DENIED"))).toBe("");
    } finally {
      if (prev !== undefined) process.env.GITHUB_ACTIONS = prev;
    }
  });

  it("flattens multi-line detail so the workflow command cannot be truncated", () => {
    const prev = process.env.GITHUB_ACTIONS;
    process.env.GITHUB_ACTIONS = "true";
    try {
      const out = captureStdout(() => annotateError("verify", "gate one\ngate two"));
      expect(out.trim().split("\n")).toHaveLength(1);
      expect(out).toContain("gate one | gate two");
    } finally {
      if (prev === undefined) delete process.env.GITHUB_ACTIONS;
      else process.env.GITHUB_ACTIONS = prev;
    }
  });

  it("strips workflow-command metacharacters from the title", () => {
    const prev = process.env.GITHUB_ACTIONS;
    process.env.GITHUB_ACTIONS = "true";
    try {
      const out = captureStdout(() => annotateError("bad::title\nwith%meta", "DETAIL"));
      expect(out).toMatch(/^::error title=badtitlewithmeta::/);
    } finally {
      if (prev === undefined) delete process.env.GITHUB_ACTIONS;
      else process.env.GITHUB_ACTIONS = prev;
    }
  });

  it("failSanitized publishes a failure CLASS, never the DSN or password", () => {
    const prev = process.env.GITHUB_ACTIONS;
    process.env.GITHUB_ACTIONS = "true";
    // failSanitized terminates the process by contract; stub exit so the
    // assertion can observe what it published.
    const realExit = process.exit;
    let exitCode: number | undefined;
    (process as unknown as { exit: (c?: number) => void }).exit = (c?: number) => {
      exitCode = c;
      throw new Error("__exit__");
    };
    const err = Object.assign(new Error(`connect ECONNREFUSED for ${SENTINEL_DSN}`), {
      code: "ECONNREFUSED",
    });
    let out = "";
    try {
      out = captureStdout(() => {
        try {
          failSanitized("migration", err);
        } catch {
          /* swallow the stubbed exit */
        }
      });
    } finally {
      (process as unknown as { exit: unknown }).exit = realExit;
      if (prev === undefined) delete process.env.GITHUB_ACTIONS;
      else process.env.GITHUB_ACTIONS = prev;
    }
    expect(exitCode).toBe(1);
    expect(out).toContain("CONNECTION_REFUSED");
    expect(out).not.toContain(SENTINEL_PASSWORD);
    expect(out).not.toContain("supabase.co");
    expect(out).not.toContain("projref");
  });

  it("annotateGateFailures stays silent when every gate passed", () => {
    const prev = process.env.GITHUB_ACTIONS;
    process.env.GITHUB_ACTIONS = "true";
    try {
      expect(captureStdout(() => annotateGateFailures("verify", []))).toBe("");
    } finally {
      if (prev === undefined) delete process.env.GITHUB_ACTIONS;
      else process.env.GITHUB_ACTIONS = prev;
    }
  });
});
