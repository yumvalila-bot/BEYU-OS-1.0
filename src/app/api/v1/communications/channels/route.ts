/**
 * GET /api/v1/communications/channels
 * List governed communication channels — registry is global reference data.
 */

import { guarded, apiOk } from "@/lib/api";
import { listChannels } from "@/lib/communications/channel-registry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "communications:read",
      action: "communications.channels.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const channels = await listChannels();
      return apiOk({ channels, total: channels.length }, ctx.traceId);
    },
  );
}
