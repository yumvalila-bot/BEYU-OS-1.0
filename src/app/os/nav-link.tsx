"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === "/os" ? pathname === "/os" : pathname.startsWith(href);
  return (
    <Link
      href={href}
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
