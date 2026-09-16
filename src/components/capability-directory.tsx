import Link from "next/link";
import { Icon, type IconName } from "./icons";

export type CapabilityDirectoryItem = {
  href: string;
  name: string;
  description: string;
  icon: IconName;
};

/**
 * Reusable discovery cards for capability hubs.
 *
 * Callers must filter `items` with the server-side authorization primitive
 * before rendering. The card never grants access; its destination repeats the
 * real guard. Icons are decorative because every card has a visible name, and
 * the route is printed so deep links remain discoverable without hover.
 */
export function CapabilityDirectory({
  items,
  emptyMessage,
}: {
  items: CapabilityDirectoryItem[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[color:var(--beyu-line)] px-5 py-8 text-center text-[12.5px] beyu-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const descriptionId = `capability-${item.href.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-describedby={descriptionId}
            className="beyu-panel group flex min-h-36 items-start gap-3.5 px-4 py-4 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37] hover:border-[#d4af37]/60"
          >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#d4af37]/35 bg-[#d4af37]/10 text-[#8a6d10] dark:text-[#efd98f]">
              <Icon name={item.icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold tracking-tight group-hover:underline">
                {item.name}
              </span>
              <span id={descriptionId} className="mt-1 block text-[11.5px] leading-relaxed beyu-muted">
                {item.description}
              </span>
              <span className="mt-2 block break-all font-mono text-[10px] text-[#8a6d10] dark:text-[#efd98f]">
                {item.href}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
