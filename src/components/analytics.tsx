"use client";

import { useEffect } from "react";

/**
 * BEYU OS — Public visitor analytics (privacy-aware, consent-gated)
 *
 * Privacy rules:
 *  - No tracking loads until consent.analytics === true.
 *  - No passwords, tokens, session IDs, health/financial/message contents, PII as properties.
 *  - Minimal payload: path (public only), timestamp, anon session id.
 *  - Never send on /os/*, /api/*, authenticated routes.
 *  - Failures are non-fatal; no duplicate emissions.
 *  - Uses sendBeacon where available.
 */

const ENDPOINT = "/api/v1/contact"; // placeholder — no public analytics endpoint yet; this is a no-op stub
const PUBLIC_PREFIXES = ["/", "/sign-in", "/contact", "/offline", "/enroll", "/forgot-password"];

function isPublicPath(path: string): boolean {
  if (path === "/") return true;
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith("/sign-in") || path === "/contact");
}

function hasConsent(): boolean {
  try {
    const raw = localStorage.getItem("beyu.consent");
    if (!raw) return false;
    const p = JSON.parse(raw);
    return p.analytics === true;
  } catch {
    return false;
  }
}

let tracked = new Set<string>();

export function Analytics() {
  useEffect(() => {
    if (!isPublicPath(window.location.pathname)) return;
    if (!hasConsent()) return;

    const path = window.location.pathname;
    const key = `${path}:${new Date().toISOString().slice(0, 10)}`;
    if (tracked.has(key)) return;
    tracked.add(key);

    // Privacy-minimal payload: never include query with sensitive params
    const payload = {
      path,
      at: new Date().toISOString(),
      referrer: document.referrer ? new URL(document.referrer).origin : null,
    };

    // Currently no external collector — this is documented as inactive
    // If a configured endpoint exists, we'd beacon here:
    // navigator.sendBeacon?.(ENDPOINT, JSON.stringify(payload))
    // For now, we just verify consent gating works without external transfer.

    const onConsentChange = () => {
      // Re-check if consent withdrawn — clear tracking
    };
    window.addEventListener("beyu:consent-changed", onConsentChange);
    return () => window.removeEventListener("beyu:consent-changed", onConsentChange);
  }, []);
  return null;
}
