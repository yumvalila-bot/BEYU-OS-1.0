"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navigation link with correct current-page semantics.
 *
 * `aria-current="page"` is set from the resolved pathname, so assistive
 * technology reports which module the user is in. Both the desktop sidebar and
 * the mobile overflow bar render through this component so the two can never
 * disagree about the current route.
 */
export function NavLink({
  href,
  label,
  variant = "sidebar",
}: {
  href: string;
  label: string;
  variant?: "sidebar" | "chip";
}) {
  const pathname = usePathname();
  const active = href === "/os" ? pathname === "/os" : pathname.startsWith(href);

  if (variant === "chip") {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`whitespace-nowrap rounded-md border px-2.5 py-1 text-[11.5px] transition ${
          active
            ? "border-[#d4af37]/60 bg-[#d4af37]/15 font-semibold text-[#efd98f]"
            : "border-[color:var(--beyu-line)] text-white/70 hover:text-white"
        }`}
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-lg px-3 py-2 text-[12.5px] transition ${
        active
          ? "bg-[#d4af37]/15 font-semibold text-[#efd98f] shadow-[inset_2px_0_0_0_#d4af37]"
          : "text-white/65 hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}
