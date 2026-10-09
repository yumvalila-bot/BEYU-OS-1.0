import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Denied } from "@/components/brand";
import { requirePrincipal } from "@/lib/guard";
import { governedTenantInScope } from "@/lib/operating-systems";
import { requestIsOnForeignOSHost } from "@/lib/canonical-host";

/** Every Agriculture deep link must resolve the canonical Agriculture tenant. */
export const metadata: Metadata = { title: "Agriculture OS" };

export default async function AgricultureLayout({
  children,
}: {
  children: ReactNode;
}) {
  const principal = await requirePrincipal();
  // Agriculture OS is never served on another Sector OS's canonical subdomain
  // (`health.beyu.co.tz/os/agriculture`). Host → refusal only; the tenant /
  // classification gate below is unchanged and still decides access.
  if (await requestIsOnForeignOSHost("AGRICULTURE")) notFound();
  const agricultureInScope = await governedTenantInScope(
    principal,
    "BEYU-AGRI",
  );
  if (!agricultureInScope) {
    return (
      <Denied
        reason="Agriculture OS is outside the current tenant and classification scope."
        capability="agriculture:data.read"
      />
    );
  }
  return children;
}
