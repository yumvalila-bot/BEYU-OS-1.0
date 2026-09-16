"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

/**
 * Navigation link with correct current-page semantics.
 *
 * `aria-current="page"` is set from the resolved pathname, so assistive
 * technology reports which module the user is in. Both the desktop sidebar and
 * the mobile overflow bar render through this component so the two can never
 * disagree about the current route.
 *
 * The icon is purely decorative (`aria-hidden`): the visible text label is the
 * accessible name on every variant, so the icon never carries meaning alone.
 */
export function NavLink({
  href,
  label,
  icon,
  variant = "sidebar",
}: {
  href: string;
  label: string;
  icon?: IconName;
  variant?: "sidebar" | "chip";
}) {
  const pathname = usePathname();
  const active = href === "/os" ? pathname === "/os" : pathname.startsWith(href);

  if (variant === "chip") {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-[11.5px] transition ${
          active
            ? "border-[#d4af37]/60 bg-[#d4af37]/15 font-semibold text-[#efd98f]"
            : "border-[color:var(--beyu-line)] text-white/70 hover:text-white"
        }`}
      >
        {icon && <Icon name={icon} className="h-3.5 w-3.5 shrink-0" />}
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] transition ${
        active
          ? "bg-[#d4af37]/15 font-semibold text-[#efd98f] shadow-[inset_2px_0_0_0_#d4af37]"
          : "text-white/65 hover:bg-white/5 hover:text-white"
      }`}
    >
      {icon && (
        <Icon
          name={icon}
          className={`h-4 w-4 shrink-0 ${active ? "text-[#d4af37]" : "text-white/45"}`}
        />
      )}
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}
