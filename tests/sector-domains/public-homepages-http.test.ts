import { request } from "node:http";
import { describe, expect, it } from "vitest";

// This suite exercises anonymous HTTP separately from database-backed login.
// If configured, an unreachable server or a wrong canonical domain is a failure.
const base = process.env.BEYU_TEST_BASE_URL;
const domain = process.env.BEYU_TEST_PUBLIC_DOMAIN;
const destinations = [
  ["health", "Health OS", "Clinical care"],
  ["finance", "Finance OS", "CAP_POSTING"],
  ["agriculture", "Agriculture OS", "livestock"],
  ["ujenzi", "Ujenzi OS", "Engineering"],
  ["foundation", "BEYU Foundation", "nonprofit"],
  ["familyoffice", "Family Office", "Wealth Planning"],
  ["noelia", "Noelia AI", "HIVE"],
] as const;

function get(path: string, host: string): Promise<{ status: number; body: string; location?: string }> {
  const url = new URL(base!);
  return new Promise((resolve, reject) => {
    const req = request({ hostname: url.hostname, port: url.port, method: "GET", path, headers: { host } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: body.replace(/<!--[^>]{0,8}-->/g, ""), location: res.headers.location }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe.skipIf(!base || !domain)("public destination HTTP boundary", () => {
  for (const [label, name, content] of destinations) {
    it(`${label}: anonymous homepage is distinct from sign-in`, async () => {
      const host = `${label}.${domain}`;
      const home = await get("/", host);
      expect(home.status).toBe(200);
      expect(home.body).toContain('id="dest-title"');
      expect(home.body).toContain(name);
      expect(home.body.toLowerCase()).toContain(content.toLowerCase());
      expect(home.body).toContain('href="/sign-in"');
      expect(home.body).not.toContain('type="password"');
      const signin = await get("/sign-in", host);
      expect(signin.status).toBe(200);
      expect(signin.body).toContain('type="password"');
      expect(signin.body).not.toContain('id="dest-title"');
    });
  }
  it("the apex is central and hostile lookalikes never select a destination", async () => {
    const central = await get("/", domain!);
    expect(central.status).toBe(200);
    expect(central.body).not.toContain('id="dest-title"');
    const hostile = await get("/", `health.${domain}.attacker.example`);
    expect(hostile.status).toBe(200);
    expect(hostile.body).not.toContain('id="dest-title"');
    expect(hostile.body).toContain('type="password"');
  });
  it("anonymous Health workspace is not served", async () => {
    for (const path of ["/os/health", "/health/os"]) {
      const res = await get(path, `health.${domain}`);
      expect(res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)).toBe(true);
    }
  });
});
