import type { ReactNode } from "react";
import { Denied } from "@/components/brand";
import { requirePrincipal } from "@/lib/guard";

/**
 * Foundation records currently mix legal-entity-keyed and foundation-keyed
 * substrates. Until every nested read can prove an entity join, a named-entity
 * grant must not fall back to a tenant-wide Foundation query.
 */
export default async function FoundationLayout({
  children,
}: {
  children: ReactNode;
}) {
  const principal = await requirePrincipal();
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
