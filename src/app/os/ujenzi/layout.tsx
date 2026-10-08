import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Denied } from "@/components/brand";
import { requirePrincipal } from "@/lib/guard";
import { operatingSystemTenantInScope } from "@/lib/operating-systems";
import { requestIsOnForeignOSHost } from "@/lib/canonical-host";

/**
 * Every Ujenzi deep link must resolve the canonical Ujenzi tenant
 * (BEYU-UJENZI) inside the principal's resolved tenant/classification scope —
 * the same boundary the API guard enforces independently for every
 * ujenzi:* route. A named-entity grant cannot read tenant-wide construction
 * records, so it is refused here exactly as it is at the API boundary.
 */
export const metadata: Metadata = { title: "Ujenzi OS" };

export default async function UjenziLayout({
  children,
}: {
  children: ReactNode;
}) {
  const principal = await requirePrincipal();
  // Ujenzi OS is never served on another Sector OS's canonical subdomain
  // (`finance.beyu.co.tz/os/ujenzi`). Host → refusal only; the tenant /
  // classification / entity-scope gates below are unchanged and still decide.
  if (await requestIsOnForeignOSHost("UJENZI")) notFound();
  const ujenziInScope = await operatingSystemTenantInScope(
    principal,
    "BEYU-UJENZI",
  );
  if (!ujenziInScope) {
    return (
      <Denied
        reason="Ujenzi OS is outside the current tenant and classification scope."
        capability="ujenzi:data.read"
      />
    );
  }
  if (principal.entityScope.length > 0) {
    return (
      <Denied
        reason="Ujenzi OS includes relational operational rows without a canonical legal-entity key on every table; tenant-wide reads are refused under an entity-scoped grant."
        capability="ujenzi:data.read"
      />
    );
  }
  return children;
}
