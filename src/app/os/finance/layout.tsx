import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/guard";
import { requestIsOnForeignSectorHost } from "@/lib/sector-host";

/**
 * Finance OS canonical-host boundary.
 *
 * This layout adds exactly ONE thing: Finance OS is never served on another
 * Sector OS's canonical subdomain (`health.beyu.co.tz/os/finance`). The host
 * is resolved from configuration and the canonical catalogue and can only
 * REFUSE. It is NOT an authorization layer — every Finance page keeps its own
 * `requireAccess("finance:…")` guard, tenant/entity scope and RLS exactly as
 * before, and a neutral host (www, apex, preview, localhost) passes through.
 */
export default async function FinanceLayout({ children }: { children: ReactNode }) {
  await requirePrincipal();
  if (await requestIsOnForeignSectorHost("FINANCE")) notFound();
  return children;
}
