"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BeyuLogo } from "@/components/beyu-logo";
import { Icon, type IconName } from "@/components/icons";
import { NavLink } from "./nav-link";
import { SignOutButton } from "./sign-out-button";

export type OsNavigationGroup = {
  group: string;
  items: Array<{ href: string; label: string; icon: IconName }>;
};

export type OsNavigationPrincipal = {
  displayName: string;
  email: string;
  roles: string[];
  tenantCode: string;
  clearance: string;
  canSwitchOperatingSystem: boolean;
};

function NavigationSections({
  groups,
  label,
}: {
  groups: OsNavigationGroup[];
  label: string;
}) {
  return (
    <nav aria-label={label} className="beyu-scroll flex-1 overflow-y-auto px-3 py-4">
      {groups.map((section) => (
        <details key={section.group} open className="group/nav mb-3">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-white/50 outline-none transition hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-[#d4af37] [&::-webkit-details-marker]:hidden">
            <span className="beyu-kicker">{section.group}</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[9.5px] tabular-nums text-white/30">{section.items.length}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-3 w-3 motion-safe:transition-transform group-open/nav:rotate-180"
              >
                <path d="m5 7.5 5 5 5-5" />
              </svg>
            </span>
          </summary>
          <div className="mt-0.5 space-y-0.5">
            {section.items.map((item) => (
              <NavLink
                key={`${section.group}:${item.href}:${item.label}`}
                href={item.href}
                label={item.label}
                icon={item.icon}
              />
            ))}
          </div>
        </details>
      ))}
    </nav>
  );
}

function IdentityFooter({ principal }: { principal: OsNavigationPrincipal }) {
  return (
    <div className="border-t border-white/10 px-5 py-4">
      <div className="text-[12px] font-semibold text-white">{principal.displayName}</div>
      <div className="mt-0.5 truncate text-[10.5px] text-white/50">{principal.email}</div>
      <div className="mt-2 flex flex-wrap gap-1">
        {principal.roles.map((role) => (
          <span
            key={role}
            className="rounded border border-[#d4af37]/40 px-1.5 py-[2px] text-[9.5px] tracking-wide text-[#efd98f]"
          >
            {role}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="truncate text-[9.5px] tracking-[0.14em] text-white/40">
          {principal.tenantCode} · {principal.clearance}
        </span>
        <SignOutButton />
      </div>
      {principal.canSwitchOperatingSystem && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <Link
            href="/launcher"
            className="flex items-center gap-2 text-[11px] text-white/70 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37]"
          >
            <Icon name="command" className="h-4 w-4" />
            <span>Switch operating system</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function NavigationBrand() {
  return (
    <div className="px-5 pb-4 pt-5">
      <BeyuLogo variant="light" size={40} href="/os" />
      <p className="mt-2 text-[9.5px] tracking-[0.16em] text-white/40">
        Bridging Care. Building Trust.
      </p>
    </div>
  );
}

/** Persistent desktop navigation. Groups use native, keyboard-operable details. */
export function DesktopNavigation({
  groups,
  principal,
}: {
  groups: OsNavigationGroup[];
  principal: OsNavigationPrincipal;
}) {
  return (
    <aside
      aria-label="BEYU OS module navigation"
      className="beyu-shell hidden h-screen w-[284px] shrink-0 flex-col border-r border-white/10 xl:sticky xl:top-0 xl:flex"
    >
      <NavigationBrand />
      <div className="beyu-gold-rule mx-5" />
      <NavigationSections groups={groups} label="Primary" />
      <IdentityFooter principal={principal} />
    </aside>
  );
}

/**
 * Mobile drawer and tablet collapsible sidebar.
 *
 * It is opened by an explicit button (never hover), traps initial focus on its
 * close control, closes on Escape or route change, restores focus, and prevents
 * the obscured document from scrolling while open.
 */
export function ResponsiveNavigation({
  groups,
  principal,
}: {
  groups: OsNavigationGroup[];
  principal: OsNavigationPrincipal;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled") && element.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!panelRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open BEYU OS navigation"
        aria-controls="beyu-responsive-navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-[12px] font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37] xl:hidden"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span className="hidden sm:inline">Modules</span>
      </button>

      <div
        className={`fixed inset-0 z-50 xl:hidden ${open ? "visible" : "invisible pointer-events-none"}`}
        aria-hidden={!open}
      >
        <button
          type="button"
          aria-label="Close navigation backdrop"
          tabIndex={-1}
          onClick={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
          className={`absolute inset-0 bg-[#050f22]/70 backdrop-blur-[2px] motion-safe:transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          ref={panelRef}
          id="beyu-responsive-navigation"
          role="dialog"
          aria-modal="true"
          aria-label="Responsive BEYU OS navigation"
          className={`beyu-shell absolute inset-y-0 left-0 flex w-[min(90vw,350px)] flex-col border-r border-white/10 shadow-2xl motion-safe:transition-transform motion-safe:duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-start justify-between gap-3 pr-3">
            <NavigationBrand />
            <button
              ref={closeRef}
              type="button"
              aria-label="Close BEYU OS navigation"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className="mt-4 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37]"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="beyu-gold-rule mx-5" />
          <NavigationSections groups={groups} label="Modules" />
          <IdentityFooter principal={principal} />
        </aside>
      </div>
    </>
  );
}
