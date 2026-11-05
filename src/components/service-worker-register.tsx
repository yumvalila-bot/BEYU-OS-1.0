"use client";

import { useEffect } from "react";

/**
 * Registers the BEYU OS service worker on supported browsers.
 * Registration is non-blocking and failure is non-fatal.
 * Security: SW only caches public static assets; no private data.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Don't register in dev to avoid stale cache confusion
    // But register always in production — the SW is safe
    const url = "/sw.js";
    navigator.serviceWorker
      .register(url, { scope: "/" })
      .then((reg) => {
        // Listen for updates
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (next) {
            next.addEventListener("statechange", () => {
              if (next.state === "installed" && navigator.serviceWorker.controller) {
                // New version available — let it activate on next load; do not force
              }
            });
          }
        });
      })
      .catch(() => {
        // Registration failure is non-fatal; app works without offline cache
      });
  }, []);
  return null;
}
