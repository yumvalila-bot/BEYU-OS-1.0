/**
 * GET /api/v1/government/agencies
 *
 * The Government Integration Registry as an endpoint: per agency, the
 * separate verified facts (interface kind, auth model, credential status,
 * integration status, blockers) plus the mounted adapter's self-report.
 * There is no single "integrated" boolean anywhere in this response — the
 * status model refuses to express it (§16.14).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { governmentAgencies } from "@/db/schema";
import { guarded } from "@/lib/api";
import { createDefaultGovernmentGateway } from "@/lib/government";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "government:integration.read",
      action: "government.agencies.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "GOVERNMENT_AGENCY" },
    },
    async () => {
      const gateway = createDefaultGovernmentGateway();
      const adapters = new Map(gateway.list().map((a) => [a.agencyCode, a]));
      const rows = await db.select().from(governmentAgencies);
      return NextResponse.json({
        agencies: rows.map((row) => ({
          code: row.code,
          name: row.name,
          countryCode: row.countryCode,
          category: row.category,
          consumers: row.consumers,
          integrationStatus: row.integrationStatus,
          interfaceKind: row.interfaceKind,
          authModel: row.authModel,
          credentialStatus: row.credentialStatus,
          // Env-var NAMES only; values never leave the process environment.
          credentialRefs: row.credentialRefs,
          officialDocsUrl: row.officialDocsUrl,
          blockedReason: row.blockedReason,
          adapter: adapters.get(row.code)
            ? {
                mounted: true,
                isMock: adapters.get(row.code)!.isMock,
                selfReportedStatus: adapters.get(row.code)!.status,
              }
            : { mounted: false },
        })),
      });
    },
  );
}
