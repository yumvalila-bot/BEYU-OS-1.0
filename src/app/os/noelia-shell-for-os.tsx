"use client";

/**
 * The existing Noelia shell, bound to the ACTIVE canonical Sector OS route.
 *
 * WHY THIS WRAPPER EXISTS
 *   An App Router layout never receives the request pathname, so the control
 *   plane shell (`src/app/os/layout.tsx`) cannot know whether it is rendering
 *   `/os`, `/os/finance`, `/os/agriculture`, `/os/ujenzi`, `/os/foundation` or
 *   `/os/health`. The Noelia shell accepts an `activeOS` context explicitly
 *   ("server-resolved or client-resolved — display-only"), so the context is
 *   resolved here, on the client, from the CANONICAL registry via
 *   `noeliaOSContextForPath()`. The shell itself, the appearance engine and the
 *   canonical Noelia assets are all unchanged; nothing about Noelia's identity,
 *   visual system or governance is redesigned.
 *
 * WHAT THIS IS NOT
 *   This is not a second Noelia, a second appearance system, or an
 *   authorization surface of any kind:
 *   • every governed fact the shell shows (ai:noelia.query, MFA posture,
 *     provider mode, principal name) is still resolved server-side in the
 *     layout and passed through unchanged;
 *   • the OS context affects PRESENTATION ONLY — the contextual appearance
 *     engine reads no Principal, no `can()` and no policy, and this wrapper
 *     cannot grant, widen or imply access;
 *   • a route that is not in the registry (or is not authorized) resolves to
 *     the BEYU OS control-plane context; the page itself has already been
 *     refused server-side by its own guard, so no sector context is fabricated
 *     for a route the principal cannot open.
 */
import type { ComponentProps } from "react";
import { usePathname } from "next/navigation";
import { NoeliaShell } from "@/components/noelia-shell";
import { noeliaOSContextForPath } from "@/lib/os-context";

export function NoeliaShellForOS(
  props: Omit<ComponentProps<typeof NoeliaShell>, "activeOS">,
) {
  const pathname = usePathname();
  return <NoeliaShell {...props} activeOS={noeliaOSContextForPath(pathname)} />;
}
