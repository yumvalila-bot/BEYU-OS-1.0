import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { baseUrl, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();
const url = `${baseUrl()}/os/foundation/registry`;
async function assertNoAccess(cookie: string) {
  const res = await fetch(url, { headers: { cookie }, redirect: "manual" });
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toContain("sign-in");
  expect(await res.text()).not.toContain("Foundation Registry");
}
describe.skipIf(!available)("Foundation live session revocation and expiry", () => {
  it("rejects a real session after logout revokes it", async () => {
    const cookie = await login("foundation.director@beyu.os");
    expect((await fetch(url, { headers: { cookie }, redirect: "manual" })).status).toBe(200);
    await fetch(`${baseUrl()}/api/v1/auth/logout`, { method: "POST", headers: { cookie } });
    await assertNoAccess(cookie);
  }, 180_000);
  it("rejects a real session whose disposable database expiry has passed", async () => {
    const cookie = await login("foundation.director@beyu.os");
    const token = cookie.split(";").find((v) => v.trim().startsWith("beyu_os_session="))!.trim().split("=")[1];
    const hash = createHash("sha256").update(token).digest("hex");
    try {
      expect((await fetch(url, { headers: { cookie }, redirect: "manual" })).status).toBe(200);
      const changed = await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.tokenHash, hash)).returning({ id: sessions.id });
      expect(changed).toHaveLength(1);
      await assertNoAccess(cookie);
    } finally {
      await fetch(`${baseUrl()}/api/v1/auth/logout`, { method: "POST", headers: { cookie } });
    }
  }, 180_000);
});
