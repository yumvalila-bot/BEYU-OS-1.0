"use client";

/**
 * Noelia shell — the governed AI identity inside the authenticated BEYU OS
 * shell.
 *
 * One entry point (header on desktop, floating compact entry on mobile) and
 * one assistant panel (right-docked or contextual on desktop, full-screen
 * sheet on mobile). Noelia is presented as the governed BEYU AI interface —
 * visually recognizable, subordinate to BEYU OS, and honest about her
 * runtime (deterministic HIVE analyst unless a real generative provider is
 * configured).
 *
 * Governance contract (Phase 6):
 *   • This component GRANTS NOTHING. The server-resolved `canQuery` flag only
 *     decides which governed STATE to display; every action the user can take
 *     (asking Noelia) goes through the existing governed API endpoint, which
 *     re-runs authentication, RBAC, ABAC, tenant scope, policy and audit.
 *   • The panel never renders a capability as available that the server has
 *     not authorized for this principal.
 *   • Appearance preferences (see noelia-appearance-store.ts) are
 *     presentation-only and never an authorization input.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { NOELIA_ASSETS } from "./brand-assets";
import {
  NOELIA_DISPLAY_IDENTITY,
  NOELIA_STATE_PRESENTATION,
  noeliaProviderCapabilityLabel,
  resolveNoeliaGovernedState,
  resolveNoeliaPresentation,
  type NoeliaGovernedState,
  type NoeliaProviderMode,
} from "@/lib/noelia/appearance";
import { useNoeliaAppearance } from "./noelia-appearance-store";
import { NoeliaAppearanceSettings } from "./noelia-appearance-settings";

/* ------------------------------------------------------------------ */
/* Canonical face at shell sizes (assets from the central registry).   */
/* ------------------------------------------------------------------ */

function NoeliaFace({
  px,
  useMark,
  state,
  decorative,
  className = "",
}: {
  px: number;
  useMark: boolean;
  state: NoeliaAvatarStateLocal;
  decorative?: boolean;
  className?: string;
}) {
  // Plain <img> by design: fixed-dimension canonical identity assets from
  // the central registry, exactly as NoeliaAvatar does for page surfaces.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={useMark ? NOELIA_ASSETS.icon : NOELIA_ASSETS.avatar}
      alt={decorative ? "" : "Noelia AI"}
      width={px}
      height={px}
      style={{ width: px, height: px }}
      draggable={false}
      className={`shrink-0 rounded-full object-cover ${state === "offline" ? "opacity-60 saturate-[0.55]" : ""} ${className}`}
    />
  );
}

type NoeliaAvatarStateLocal = "idle" | "thinking" | "offline";

/* ------------------------------------------------------------------ */
/* Governed state chip.                                                */
/* ------------------------------------------------------------------ */

const STATE_TONE_CLASS: Record<string, string> = {
  sage: "border-[#4c6f4e]/60 bg-[#4c6f4e]/15 text-[#3c593e] dark:text-[#9cc79e]",
  amber: "border-amber-500/60 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  gold: "border-[#d4a017]/60 bg-[#d4a017]/15 text-[#8a6d10] dark:text-[#efd98f]",
  sky: "border-sky-500/60 bg-sky-500/15 text-sky-800 dark:text-sky-300",
  slate: "border-slate-400/60 bg-slate-400/15 text-slate-600 dark:text-slate-300",
};

/* Static per-tone dot classes (Tailwind requires literal class names). */
const STATE_DOT_CLASS: Record<string, string> = {
  sage: "bg-[#4c6f4e]",
  amber: "bg-amber-500",
  gold: "bg-[#d4a017]",
  sky: "bg-sky-500",
  slate: "bg-slate-400",
};

function StateChip({ state, compact }: { state: NoeliaGovernedState; compact?: boolean }) {
  const meta = NOELIA_STATE_PRESENTATION[state];
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide ${STATE_TONE_CLASS[meta.tone]} ${
        compact ? "px-2 py-[2px] text-[9.5px]" : "px-2.5 py-[3px] text-[10.5px]"
      }`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATE_DOT_CLASS[meta.tone]}`} />
      {meta.label}
      <span className="sr-only">: {meta.description}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Answer contract — identical to the governed /api/v1/ai/noelia route */
/* ------------------------------------------------------------------ */

type NoeliaPanelAnswer = {
  decisionId: string;
  engine: string;
  outputClass: string;
  headline: string;
  findings: { label: string; value: string; kind: string }[];
  narrative: string;
  sources: { kind: string; ref: string; label: string; authority: string }[];
  confidence: number;
  humanReviewRequired: boolean;
  deniedScopes: string[];
  policyDecision: string;
  toolsUsed: string[];
  latencyMs: number;
};

type NoeliaNotice = {
  id: number;
  severity: "info" | "important";
  text: string;
};

const SUGGESTIONS = [
  "Summarize what is awaiting human decision in my scope.",
  "Which of my authorized obligations are closest to their deadline?",
];

export interface NoeliaShellProps {
  /** ai:noelia.query resolved server-side for this principal. Display-only. */
  canQuery: boolean;
  /** Session MFA posture resolved server-side. Display-only. */
  mfaSatisfied: boolean;
  /** Honest runtime capability, resolved server-side. */
  providerMode: NoeliaProviderMode;
  /** Principal display name for the greeting (server-resolved). */
  principalName: string | null;
}

export function NoeliaShell({ canQuery, mfaSatisfied, providerMode, principalName }: NoeliaShellProps) {
  const { prefs } = useNoeliaAppearance();
  const presentation = useMemo(
    () => resolveNoeliaPresentation(prefs),
    [prefs],
  );

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"assistant" | "appearance">("assistant");

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<NoeliaPanelAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notices, setNotices] = useState<NoeliaNotice[]>([]);
  const [speaking, setSpeaking] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const noticeId = useRef(0);

  /* Governed state — server facts only. The client may only DOWNGRADE
     honesty (runtime error → UNAVAILABLE), never upgrade it. */
  const baseState = useMemo(
    () =>
      resolveNoeliaGovernedState({
        canQuery,
        mfaSatisfied,
        runtimeAvailable: true, // layout DB is up; HIVE analyst is registry-backed
      }),
    [canQuery, mfaSatisfied],
  );
  const governedState: NoeliaGovernedState = !canQuery
    ? baseState
    : error
      ? "UNAVAILABLE"
      : answer?.humanReviewRequired
        ? "REVIEW_REQUIRED"
        : baseState;

  const faceState: NoeliaAvatarStateLocal = !canQuery
    ? "idle"
    : error
      ? "offline"
      : busy
        ? "thinking"
        : "idle";

  const entryState = governedState;
  const entryDot =
    faceState === "offline"
      ? "bg-slate-400"
      : faceState === "thinking"
        ? "bg-[#d4af37] motion-safe:animate-noelia-think"
        : entryState === "RESTRICTED"
            ? "bg-amber-500"
            : entryState === "AUTHORIZATION_REQUIRED"
              ? "bg-sky-500"
              : entryState === "REVIEW_REQUIRED"
                ? "bg-[#d4a017]"
                : entryState === "UNAVAILABLE"
                  ? "bg-slate-400"
                  : "bg-[#4c6f4e]";

  function pushNotice(severity: NoeliaNotice["severity"], text: string) {
    setNotices((current) => [{ id: ++noticeId.current, severity, text }, ...current].slice(0, 8));
  }

  const visibleNotices = useMemo(() => {
    if (presentation.notificationFilter === "off") return [];
    if (presentation.notificationFilter === "important-only")
      return notices.filter((n) => n.severity === "important");
    return notices;
  }, [notices, presentation.notificationFilter]);

  /* ------------------------------ panel behaviour ------------------------------ */

  const openPanel = useCallback(() => setOpen(true), []);

  const closePanel = useCallback(() => {
    setOpen(false);
    // Restore focus to the entry that is visible at this viewport width.
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    (isDesktop ? triggerRef : mobileTriggerRef).current?.focus();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    return () => window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    if (!open) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0);
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
  }, [open, closePanel]);

  /* --------------------------------- asking --------------------------------- */

  async function ask(q: string) {
    if (!canQuery) return; // the form itself is not rendered; belt and braces
    if (q.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/ai/noelia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message =
          json?.error?.message ?? "Noelia could not process the request under your current grants.";
        setError(message);
        setAnswer(null);
        pushNotice("important", "Request declined: " + message);
        return;
      }
      const data = json.data as NoeliaPanelAnswer;
      setAnswer(data);
      pushNotice(
        data.humanReviewRequired ? "important" : "info",
        data.humanReviewRequired
          ? "Human review required before this output may be relied upon."
          : `Noelia answered (${data.outputClass}, ${Math.round(data.confidence * 100)}% confidence).`,
      );
    } catch {
      setError("The HIVE runtime is unreachable.");
      setAnswer(null);
      pushNotice("important", "The HIVE runtime is unreachable.");
    } finally {
      setBusy(false);
    }
  }

  function readAloud() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!answer) return;
    const utterance = new SpeechSynthesisUtterance(`${answer.headline}. ${answer.narrative}`);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  /* --------------------------------- render --------------------------------- */

  const entryLabel =
    prefs.presenceMode === "minimal"
      ? "Open Noelia — governed AI assistant"
      : `Open Noelia — Governed AI, state ${NOELIA_STATE_PRESENTATION[entryState].label}`;

  return (
    <div className={presentation.motionClass}>
      {/* ------------------------------ header entry ------------------------------ */}
      <button
        ref={triggerRef}
        type="button"
        onClick={openPanel}
        aria-label={entryLabel}
        aria-expanded={open}
        aria-controls="noelia-assistant-panel"
        className="hidden min-h-10 items-center gap-2.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-left transition hover:border-[#d4af37]/50 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37] md:inline-flex"
      >
        <span className="relative inline-flex">
          <NoeliaFace px={presentation.entryAvatarPx} useMark={presentation.entryUsesMark} state={faceState} decorative={prefs.presenceMode !== "full"} />
          {presentation.entryShowsState && (
            <span
              aria-hidden="true"
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#0b1d3a] ${entryDot}`}
            />
          )}
        </span>
        {presentation.entryShowsText && (
          <span className="leading-none">
            <span className="block text-[12px] font-semibold text-white">
              Noelia
              {presentation.entryShowsState && (
                <span className="ml-1.5 hidden text-[9.5px] font-semibold tracking-[0.14em] text-[#efd98f] lg:inline">
                  {NOELIA_STATE_PRESENTATION[entryState].label}
                </span>
              )}
            </span>
            <span className="mt-[3px] block text-[9.5px] tracking-[0.14em] text-white/55">
              Governed AI
            </span>
          </span>
        )}
      </button>

      {/* --------------------------- mobile floating entry --------------------------- */}
      <button
        ref={mobileTriggerRef}
        type="button"
        onClick={openPanel}
        aria-label={entryLabel}
        aria-expanded={open}
        aria-controls="noelia-assistant-panel"
        tabIndex={open ? -1 : 0}
        className={`fixed bottom-4 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#d4af37]/50 bg-[#0b1d3a] shadow-lg transition hover:border-[#d4af37] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37] md:hidden ${open ? "pointer-events-none opacity-0" : ""}`}
      >
        <span className="relative inline-flex">
          <NoeliaFace px={44} useMark={false} state={faceState} decorative />
          <span
            aria-hidden="true"
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0b1d3a] ${entryDot}`}
          />
        </span>
        <span className="sr-only">
          Noelia — Governed AI. State {NOELIA_STATE_PRESENTATION[entryState].label}.
        </span>
      </button>

      {/* --------------------------------- panel --------------------------------- */}
      {open && (
        <div
          ref={panelRef}
          id="noelia-assistant-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Noelia assistant"
          className={`fixed z-50 flex flex-col border-[color:var(--beyu-line)] bg-[color:var(--beyu-card)] text-[color:var(--beyu-text)] shadow-2xl
            inset-0
            md:inset-auto ${
              presentation.panelPosition === "contextual"
                ? "md:bottom-24 md:right-4 md:max-h-[72vh] md:w-[420px] md:max-w-[calc(100vw-2rem)] md:rounded-xl"
                : "md:inset-y-0 md:right-0 md:w-[420px] md:max-w-[calc(100vw-2rem)]"
            }`}
        >
          {/* header */}
          <header className="beyu-shell px-5 py-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <span className="relative inline-flex">
                  <NoeliaFace
                    px={presentation.entryAvatarPx + 16}
                    useMark={presentation.entryUsesMark}
                    state={faceState}
                  />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[16px] font-semibold tracking-[0.18em]">
                      {NOELIA_DISPLAY_IDENTITY.name}
                    </span>
                    <StateChip state={governedState} compact />
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/65">
                    {NOELIA_DISPLAY_IDENTITY.subtitle} · {NOELIA_DISPLAY_IDENTITY.motto}
                  </div>
                </div>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={closePanel}
                aria-label="Close Noelia assistant"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37]"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4.5 w-4.5">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <p className="mt-2.5 text-[10px] leading-relaxed tracking-wide text-white/50">
              {noeliaProviderCapabilityLabel(providerMode)}
            </p>
          </header>

          {/* tabs */}
          <div role="tablist" aria-label="Noelia sections" className="flex gap-1 border-b border-[color:var(--beyu-line)] px-3 pt-2">
            {(
              [
                { id: "assistant", label: "Assistant" },
                { id: "appearance", label: "Appearance" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`noelia-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`noelia-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    const next = tab === "assistant" ? "appearance" : "assistant";
                    setTab(next);
                    document.getElementById(`noelia-tab-${next}`)?.focus();
                  }
                }}
                className={`rounded-t-lg px-3.5 py-2 text-[12px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#d4af37] ${
                  tab === t.id
                    ? "border border-b-0 border-[color:var(--beyu-line)] bg-[color:var(--beyu-card)] text-[color:var(--beyu-text)]"
                    : "text-[color:var(--beyu-muted)] hover:text-[color:var(--beyu-text)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* body */}
          <div className="noelia-scroll min-h-0 flex-1 overflow-y-auto">
            {tab === "assistant" ? (
              <div
                id="noelia-panel-assistant"
                role="tabpanel"
                aria-labelledby="noelia-tab-assistant"
                className={`px-4 ${presentation.panelDensity === "compact" ? "py-3" : "py-4"}`}
              >
                <p className="text-[12.5px] leading-relaxed">{presentation.greeting(principalName)}</p>

                {/* governed notices (presentation filter) */}
                {visibleNotices.length > 0 && (
                  <ul aria-label="Noelia session notices" className="mt-3 space-y-1.5">
                    {visibleNotices.map((n) => (
                      <li
                        key={n.id}
                        className={`rounded-md border px-2.5 py-1.5 text-[11px] leading-snug ${
                          n.severity === "important"
                            ? "border-[#d4a017]/50 bg-[#d4a017]/10"
                            : "border-[color:var(--beyu-line)] beyu-muted"
                        }`}
                      >
                        {n.text}
                      </li>
                    ))}
                  </ul>
                )}

                {canQuery ? (
                  <>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setQuestion(s);
                            void ask(s);
                          }}
                          className="rounded-full border border-[color:var(--beyu-line)] px-2.5 py-1 text-[10.5px] transition hover:border-[#d4af37]/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d4af37]"
                        >
                          {s}
                        </button>
                      ))}
                    </div>

                    <form
                      className="mt-3 flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void ask(question);
                      }}
                    >
                      <label htmlFor="noelia-panel-question" className="sr-only">
                        Ask Noelia
                      </label>
                      <input
                        id="noelia-panel-question"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="Ask Noelia within your authority…"
                        className="min-w-0 flex-1 rounded-lg border border-[color:var(--beyu-line)] bg-transparent px-3 py-2.5 text-[12.5px] outline-none focus:border-[#d4af37]"
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className="rounded-lg bg-[#d4af37] px-4 py-2.5 text-[12px] font-semibold text-[#0b1d3a] transition hover:bg-[#e2c25f] disabled:opacity-60"
                      >
                        {busy ? "Thinking…" : "Ask"}
                      </button>
                    </form>

                    {error && (
                      <div
                        role="alert"
                        className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-700 dark:text-rose-300"
                      >
                        {error}
                      </div>
                    )}

                    {answer && (
                      <div className="mt-3 rounded-xl border border-[color:var(--beyu-line)] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[13px] font-semibold">{answer.headline}</div>
                          <div className="flex flex-wrap gap-1 text-[9.5px]">
                            <span className="rounded-full border border-current/30 px-2 py-[2px] font-semibold">
                              {answer.outputClass}
                            </span>
                            <span className="rounded-full border border-[color:var(--beyu-line)] px-2 py-[2px]">
                              {answer.engine}
                            </span>
                            <span className="rounded-full border border-[color:var(--beyu-line)] px-2 py-[2px]">
                              confidence {Math.round(answer.confidence * 100)}%
                            </span>
                          </div>
                        </div>

                        {answer.findings.length > 0 && (
                          <dl className="mt-2.5 space-y-1.5">
                            {answer.findings.map((f, i) => (
                              <div key={i} className="rounded-md border border-[color:var(--beyu-line)] px-2.5 py-1.5">
                                <dt className="beyu-kicker beyu-muted text-[8.5px]">
                                  {f.kind} · {f.label}
                                </dt>
                                <dd className="mt-0.5 text-[11.5px] font-medium">{f.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}

                        <p className="mt-2.5 text-[12px] leading-relaxed">{answer.narrative}</p>

                        <div className="mt-2.5 space-y-1 text-[10.5px] beyu-muted">
                          <div>
                            <span className="beyu-kicker">Sources </span>
                            {answer.sources.length > 0
                              ? answer.sources.map((s) => `${s.kind}:${s.ref} (${s.authority})`).join(" · ")
                              : "no authoritative source retrieved"}
                          </div>
                          <div>
                            <span className="beyu-kicker">Policy </span>
                            {answer.policyDecision} · decision {answer.decisionId.slice(0, 18)}… ·{" "}
                            {answer.latencyMs}ms
                          </div>
                        </div>

                        {answer.deniedScopes.length > 0 && (
                          <div className="mt-2.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px]">
                            Scopes withheld from this answer: {answer.deniedScopes.join(", ")}
                          </div>
                        )}

                        {answer.humanReviewRequired && (
                          <div className="mt-2.5 rounded-md border border-[#d4a017]/50 bg-[#d4a017]/10 px-2.5 py-1.5 text-[11px] font-medium">
                            HUMAN REVIEW REQUIRED — this output may not be relied upon for a material
                            decision until an accountable human reviews and disposes it in the AI
                            decision register.
                          </div>
                        )}

                        {presentation.voiceAffordance && (
                          <button
                            type="button"
                            onClick={readAloud}
                            className="mt-2.5 rounded-md border border-[color:var(--beyu-line)] px-2.5 py-1.5 text-[10.5px] font-semibold transition hover:border-[#d4af37]/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#d4af37]"
                          >
                            {speaking ? "Stop reading" : "Read aloud (this device)"}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-800 dark:text-amber-300">
                    <strong className="font-semibold">RESTRICTED —</strong>{" "}
                    {NOELIA_STATE_PRESENTATION.RESTRICTED.description} Ask Noelia is available through
                    the Noelia page once your grants include{" "}
                    <code className="font-mono text-[10.5px]">ai:noelia.query</code>. Nothing in this
                    panel changes that decision; the server remains authoritative.
                  </div>
                )}

                <Link
                  href="/os/noelia"
                  className="mt-3 inline-block text-[11px] font-semibold text-[#8a6d10] underline decoration-[#d4a017]/50 underline-offset-2 transition hover:text-[#0b1f4d] dark:text-[#efd98f] dark:hover:text-white"
                >
                  Open the Noelia console →
                </Link>
              </div>
            ) : (
              <div
                id="noelia-panel-appearance"
                role="tabpanel"
                aria-labelledby="noelia-tab-appearance"
                className="px-4 py-4"
              >
                <NoeliaAppearanceSettings />
              </div>
            )}
          </div>

          {/* footer */}
          <footer className="border-t border-[color:var(--beyu-line)] px-4 py-2.5 text-[9.5px] leading-relaxed beyu-muted">
            Noelia inherits your identity, roles, tenant and clearance — and can never exceed them.
            Advisory only: material decisions require human accountability.
          </footer>
        </div>
      )}
    </div>
  );
}
