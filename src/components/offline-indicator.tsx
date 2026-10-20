"use client";

import { useEffect, useState } from "react";

/**
 * Network status indicator — accessible, reduced-motion safe.
 * Shows only when offline or reconnecting; never implies success when queued.
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialise from navigator.onLine on mount (external system)
    setOnline(navigator.onLine);
    const onOnline = () => {
      setOnline(true);
      setShowReconnected(true);
      window.setTimeout(() => setShowReconnected(false), 3000);
    };
    const onOffline = () => {
      setOnline(false);
      setShowReconnected(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (online && !showReconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border px-4 py-2 text-[12px] font-semibold shadow-lg motion-safe:transition-all ${
        online
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {online ? (
        <span>✓ Back online — reconnecting securely…</span>
      ) : (
        <span>● You are offline — some actions require connection and will resume when online.</span>
      )}
    </div>
  );
}
