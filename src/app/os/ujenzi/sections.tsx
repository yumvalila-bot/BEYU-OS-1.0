import Link from "next/link";

/**
 * Ujenzi OS section navigation — every destination is a REAL route with a
 * server-side authorization check. Nothing here is a placeholder link: the
 * list mirrors the implemented workspace surfaces. Sections render data from
 * the governed Ujenzi tables only.
 */
export const UJENZI_SECTIONS = [
  { href: "/os/ujenzi", label: "Overview" },
  { href: "/os/ujenzi/projects", label: "Projects" },
  { href: "/os/ujenzi/boq-cost", label: "BOQ & Cost" },
  { href: "/os/ujenzi/procurement", label: "Procurement" },
  { href: "/os/ujenzi/materials", label: "Materials" },
  { href: "/os/ujenzi/equipment", label: "Equipment" },
  { href: "/os/ujenzi/site", label: "Site Operations" },
  { href: "/os/ujenzi/quality", label: "Quality" },
  { href: "/os/ujenzi/hse", label: "HSE" },
  { href: "/os/ujenzi/variations", label: "Variations" },
  { href: "/os/ujenzi/claims", label: "Claims" },
  { href: "/os/ujenzi/payments", label: "Payments" },
  { href: "/os/ujenzi/handover", label: "Handover" },
] as const;

export function UjenziSectionNav({ current }: { current: string }) {
  return (
    <nav aria-label="Ujenzi OS sections" className="flex flex-wrap gap-1.5">
      {UJENZI_SECTIONS.map((section) => {
        const active = section.href === current;
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017] ${
              active
                ? "border-[#D4A017]/60 bg-[#d4af37]/15 text-[#8a6d10] dark:text-[#efd98f]"
                : "border-[color:var(--beyu-line)] beyu-muted hover:border-[#D4A017]/50"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
