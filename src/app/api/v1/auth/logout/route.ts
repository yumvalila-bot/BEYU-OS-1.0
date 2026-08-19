import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeSession } from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { apiOk } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/constants";
import { newId, ID_PREFIX } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const traceId = newId(ID_PREFIX.event);
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await revokeSession(token);
    await recordAudit({ action: "identity.logout", objectType: "SESSION", objectId: "self", traceId });
  }
  jar.delete(SESSION_COOKIE);
  return apiOk({ authenticated: false }, traceId);
}
