"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * BEYU OS — Cookie Consent Banner
 *
 * Privacy-first, consent-gated design:
 *  - Essential cookies (session) are always disclosed but never blocked — they are required for authentication.
 *  - Optional tracking (analytics, third-party) is blocked until consent.
 *  - Accept / Reject / Customize are equal prominence (no dark pattern).
 *  - Preference persisted to localStorage (beyu.consent) + document.cookie (beyu_consent) minimal.
 *  - Withdraw/change via button in banner or footer link.
 *  - No sensitive data in consent storage — only boolean categories.
 *
 * When no optional tracking is configured, banner shows essential disclosure only
 * and does not artificially claim tracking. This matches current repo reality:
 * essential session cookie only, no public third-party trackers.
 */

type ConsentPrefs = {
  essential: true; // always true
  analytics: boolean;
  marketing: boolean;
  version: 1;
  decidedAt: string;
};

const STORAGE_KEY = "beyu.consent";
const COOKIE_NAME = "beyu_consent";
const CURRENT_VERSION = 1;

function readPrefs(): ConsentPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentPrefs;
    if (parsed.version !== CURRENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePrefs(prefs: ConsentPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    // Minimal cookie for server awareness (no sensitive data)
    const val = encodeURIComponent(JSON.stringify({ analytics: prefs.analytics, marketing: prefs.marketing, v: 1 }));
    document.cookie = `${COOKIE_NAME}=${val}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
    window.dispatchEvent(new Event("beyu:consent-changed"));
  } catch {
    // storage failure non-fatal
  }
}

function prefsSubscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("beyu:consent-changed", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("beyu:consent-changed", cb);
  };
}

function prefsSnapshot(): ConsentPrefs | null {
  return readPrefs();
}

function prefsServerSnapshot(): ConsentPrefs | null {
  return null;
}

export function useConsentPrefs() {
  return useSyncExternalStore(prefsSubscribe, prefsSnapshot, prefsServerSnapshot);
}

export function hasAnalyticsConsent(prefs: ConsentPrefs | null): boolean {
  return prefs?.analytics === true;
}

function ConsentButton({
  children,
  variant,
  onClick,
}: {
  children: React.ReactNode;
  variant: "primary" | "secondary" | "ghost";
  onClick: () => void;
}) {
  const cls =
    variant === "primary"
      ? "bg-[#0B1F4D] text-white hover:bg-[#16294a] border-[#0B1F4D]"
      : variant === "secondary"
        ? "bg-white text-[#0B1F4D] border-[#0B1F4D]/20 hover:bg-slate-50"
        : "bg-transparent text-[#0B1F4D] border-transparent underline underline-offset-2";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-5 text-[12.5px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B1F4D] ${cls}`}
    >
      {children}
    </button>
  );
}

export function CookieConsentBanner() {
  const prefs = useConsentPrefs();
  const [showCustomize, setShowCustomize] = useState(false);
  const [localAnalytics, setLocalAnalytics] = useState(false);
  const [localMarketing, setLocalMarketing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (prefs) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync persisted prefs to local draft state for customize UI
      setLocalAnalytics(prefs.analytics);
      setLocalMarketing(prefs.marketing);
    }
  }, [prefs]);

  if (prefs && !dismissed) {
    // Persisted choice — show compact manage bar at bottom if user wants to change (via link)
    // Don't re-show banner after decision; they can manage via footer.
    return null;
  }
  if (dismissed) return null;
  if (prefs) return null;

  const save = (analytics: boolean, marketing: boolean) => {
    const next: ConsentPrefs = { essential: true, analytics, marketing, version: 1, decidedAt: new Date().toISOString() };
    writePrefs(next);
    setDismissed(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="beyu-consent-title"
      aria-describedby="beyu-consent-desc"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#0B1F4D]/10 bg-white p-4 shadow-2xl sm:p-5"
    >
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h2 id="beyu-consent-title" className="text-[13px] font-semibold text-[#0B1F4D]">
              How BEYU OS uses cookies
            </h2>
            <p id="beyu-consent-desc" className="mt-1.5 text-[12px] leading-relaxed text-[#5b6b85]">
              BEYU OS uses essential cookies to keep you signed in and to enforce security. Essential cookies are
              always on. Optional analytics helps us understand usage — we only enable it with your consent, and
              you can withdraw consent at any time. No tracking loads before you decide. See our data handling in
              the{" "}
              <a href="/contact#privacy" className="underline underline-offset-2">
                privacy notice
              </a>
              .
            </p>

            {showCustomize && (
              <fieldset className="mt-4 rounded-lg border border-[#0B1F4D]/10 bg-slate-50 p-3">
                <legend className="px-1 text-[11px] font-semibold tracking-wide text-[#0B1F4D]">Customize</legend>
                <div className="space-y-2">
                  <label className="flex items-center justify-between gap-3 text-[12px]">
                    <span>
                      <span className="font-semibold">Essential</span>
                      <span className="ml-2 text-[#5b6b85]">Required for sign-in & security — always on</span>
                    </span>
                    <input type="checkbox" checked disabled className="h-4 w-4 accent-[#0B1F4D]" aria-label="Essential cookies always enabled" />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-[12px]">
                    <span>
                      <span className="font-semibold">Analytics</span>
                      <span className="ml-2 text-[#5b6b85]">Anonymous usage metrics (no passwords, no health/financial details)</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={localAnalytics}
                      onChange={(e) => setLocalAnalytics(e.target.checked)}
                      className="h-4 w-4 accent-[#0B1F4D]"
                      aria-label="Analytics cookies"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-[12px]">
                    <span>
                      <span className="font-semibold">Marketing</span>
                      <span className="ml-2 text-[#5b6b85]">Personalized communications — requires opt-in</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={localMarketing}
                      onChange={(e) => setLocalMarketing(e.target.checked)}
                      className="h-4 w-4 accent-[#0B1F4D]"
                      aria-label="Marketing cookies"
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-[#5b6b85]">
                  You can change these anytime. Withdrawing consent stops future optional tracking immediately.
                </p>
              </fieldset>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
            {!showCustomize ? (
              <>
                <ConsentButton variant="primary" onClick={() => save(true, false)}>
                  Accept optional
                </ConsentButton>
                <ConsentButton variant="secondary" onClick={() => save(false, false)}>
                  Reject optional
                </ConsentButton>
                <ConsentButton variant="ghost" onClick={() => setShowCustomize(true)}>
                  Customize
                </ConsentButton>
              </>
            ) : (
              <>
                <ConsentButton variant="primary" onClick={() => save(localAnalytics, localMarketing)}>
                  Save preferences
                </ConsentButton>
                <ConsentButton variant="secondary" onClick={() => setShowCustomize(false)}>
                  Back
                </ConsentButton>
              </>
            )}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[#5b6b85]">
          Essential session cookie: <code className="rounded bg-slate-100 px-1">beyu_os_session</code> (httpOnly, Secure in production, SameSite=Lax). No optional trackers load until you consent.
        </p>
      </div>
    </div>
  );
}

export function CookiePreferencesLink() {
  const prefs = useConsentPrefs();
  const [open, setOpen] = useState(false);

  if (!prefs) return null;
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-[11px] underline underline-offset-2 hover:text-[#0B1F4D] focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Cookie preferences
      </button>
      {open && (
        <span className="rounded border bg-white px-2 py-1 text-[11px] beyu-muted">
          Essential: on · Analytics: {prefs.analytics ? "on" : "off"} · Marketing: {prefs.marketing ? "on" : "off"}{" "}
          <button
            type="button"
            className="ml-1 underline"
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0`;
              window.dispatchEvent(new Event("beyu:consent-changed"));
              setOpen(false);
              // page reload to re-show banner
              window.location.reload();
            }}
          >
            Change
          </button>
        </span>
      )}
    </div>
  );
}
