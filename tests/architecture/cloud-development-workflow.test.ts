import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const devcontainer = JSON.parse(
  readFileSync(join(root, ".devcontainer", "devcontainer.json"), "utf8"),
) as {
  image: string;
  postCreateCommand: string;
  postStartCommand: string;
  forwardPorts: number[];
  portsAttributes: Record<string, { visibility?: string }>;
};
const bootstrap = readFileSync(
  join(root, "scripts", "infra", "codespaces-bootstrap.sh"),
  "utf8",
);
const start = readFileSync(
  join(root, "scripts", "infra", "codespaces-start.sh"),
  "utf8",
);
const workflow = readFileSync(
  join(root, "docs", "operations", "CLOUD_DEVELOPMENT_WORKFLOW.md"),
  "utf8",
);

describe("cloud-first development environment", () => {
  it("uses the repository's CI Node major and reproducible bootstrap scripts", () => {
    expect(devcontainer.image).toContain("javascript-node:1-22-bookworm");
    expect(devcontainer.postCreateCommand).toContain("codespaces-bootstrap.sh");
    expect(devcontainer.postStartCommand).toContain("codespaces-start.sh");
  });

  it("keeps the forwarded database port private", () => {
    expect(devcontainer.forwardPorts).toContain(5432);
    expect(devcontainer.portsAttributes["5432"]?.visibility).toBe("private");
  });

  it("refuses production mode and non-loopback database DSNs", () => {
    expect(bootstrap).toContain('env.BEYU_CLOUD_DEV_ENV !== "1"');
    expect(bootstrap).toContain('env.BEYU_ENV === "production"');
    expect(bootstrap).toContain('["127.0.0.1", "localhost", "::1"].includes(url.hostname)');
    expect(start).toContain('["127.0.0.1", "localhost", "::1"].includes(url.hostname)');
    expect(bootstrap).not.toContain("pooler.supabase.com");
  });

  it("keeps Preview database access separate from cloud CI and production", () => {
    expect(workflow).toContain("Preview must not receive DATABASE_URL");
    expect(workflow).toContain("Ephemeral PostgreSQL 16 service container");
    expect(workflow).toContain("human-controlled");
  });
});
