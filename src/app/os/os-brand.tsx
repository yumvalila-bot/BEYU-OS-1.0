"use client";

import { usePathname } from "next/navigation";
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { BEYU_CONTROL_PLANE, SECTOR_OPERATING_SYSTEMS } from "@/lib/operating-system-catalog";

/** Presentation, not route discovery or authorization. Family Office is a capability. */
export function operatingSurfaceName(pathname: string): string {
  const within = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  if (within("/os/family")) return "Family Office";
  return SECTOR_OPERATING_SYSTEMS.find(({ href }) => within(href))?.name ?? BEYU_CONTROL_PLANE.name;
}

export function OsBrand({ size = 40 }: { size?: number }) {
  const name = operatingSurfaceName(usePathname());
  return (
    <a href="/os" aria-label={`${name} — BEYU OS home`} className="inline-flex min-w-0 items-center gap-2 rounded text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37]">
      <BeyuOsLogo size={size} decorative className="shrink-0 rounded-sm" />
      <span className="text-sm font-semibold">{name}</span>
    </a>
  );
}
