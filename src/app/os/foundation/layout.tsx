import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { FoundationDenied } from "@/components/foundation-denied";
import { requestIsOnForeignCanonicalHost } from "@/lib/canonical-host";
import { requirePrincipal } from "@/lib/guard";
import { governedTenantInScope } from "@/lib/operating-systems";

/**
 * Foundation records currently mix legal-entity-keyed and foundation-keyed
 * substrates. Every Foundation deep link first proves that the canonical
 * Foundation tenant is inside the principal's resolved tenant/classification
 * scope. Until every nested read can also prove an entity join, a named-entity
 * grant must not fall back to a tenant-wide Foundation query; tenant-wide reads are refused.
 */
export const metadata: Metadata = { title: "Foundation organization" };

export default async function FoundationLayout({
  children,
}: {
  children: ReactNode;
}) {
  const principal = await requirePrincipal();
  // The Foundation sister organization is never served on another canonical
  // destination host. Host → refusal only;
  // the tenant / classification / entity-scope gates below are unchanged and
  // still decide access. `foundation.beyu.co.tz` itself passes through.
  if (await requestIsOnForeignCanonicalHost("FOUNDATION")) notFound();
  let foundationInScope = false;
  try {
    foundationInScope = await governedTenantInScope(principal, "BEYU-FOUNDATION");
  } catch {
    // An unavailable scope resolver can never make Foundation accessible.
    console.error(JSON.stringify({ event: "foundation_layout_authorization_unavailable" }));
  }

  if (!foundationInScope || principal.entityScope.length > 0) {
    return <FoundationDenied />;
  }
  return children;
}
