import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Denied } from "@/components/brand";
import { requestIsOnForeignOSHost } from "@/lib/canonical-host";
import { requirePrincipal } from "@/lib/guard";
import { operatingSystemTenantInScope } from "@/lib/operating-systems";

/**
 * Foundation records currently mix legal-entity-keyed and foundation-keyed
 * substrates. Every Foundation deep link first proves that the canonical
 * Foundation tenant is inside the principal's resolved tenant/classification
 * scope. Until every nested read can also prove an entity join, a named-entity
 * grant must not fall back to a tenant-wide Foundation query.
 */
export const metadata: Metadata = { title: "Foundation OS" };

export default async function FoundationLayout({
  children,
}: {
  children: ReactNode;
}) {
  const principal = await requirePrincipal();
  // Foundation OS is never served on another canonical host: not on a sibling
  // OS's host (`finance.beyu.co.tz/os/foundation`) and not on a shared-surface
  // host (`familyoffice.beyu.co.tz`, `noelia.beyu.co.tz`). Host → refusal only;
  // the tenant / classification / entity-scope gates below are unchanged and
  // still decide access. `foundation.beyu.co.tz` itself passes through.
  if (await requestIsOnForeignOSHost("FOUNDATION")) notFound();
  const foundationInScope = await operatingSystemTenantInScope(
    principal,
    "BEYU-FOUNDATION",
  );

  if (!foundationInScope) {
    return (
      <Denied
        reason="Foundation OS is outside the current tenant and classification scope."
        capability="foundation:registry.read"
      />
    );
  }
  if (principal.entityScope.length > 0) {
    return (
      <Denied
        reason="Foundation OS contains related records without a canonical legal-entity key; tenant-wide reads are refused under an entity-scoped grant."
        capability="foundation:registry.read"
      />
    );
  }
  return children;
}
