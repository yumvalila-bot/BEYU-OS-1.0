import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Denied } from "@/components/brand";
import { requirePrincipal } from "@/lib/guard";
import { operatingSystemTenantInScope } from "@/lib/operating-systems";

/** Every Agriculture deep link must resolve the canonical Agriculture tenant. */
export const metadata: Metadata = { title: "Agriculture OS" };

export default async function AgricultureLayout({
  children,
}: {
  children: ReactNode;
}) {
  const principal = await requirePrincipal();
  const agricultureInScope = await operatingSystemTenantInScope(
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
