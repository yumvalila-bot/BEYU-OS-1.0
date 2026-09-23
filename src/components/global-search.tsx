"use client";

/**
 * BEYU OS — Shared Search UI: the single global search control.
 *
 * This EXTENDS the existing OS shell header (right cluster); there is no other
 * search bar in the product. It is a presentation layer over the ONE governed
 * endpoint `GET /api/v1/search`:
 *
 *   - the request carries the session cookie and NOTHING else (no tenant,
 *     entity, clearance or scope parameter exists to send);
 *   - results are grouped by the `os` of each hit — the groups that appear
 *     are exactly the ones the authorized backend returned. OS display names
 *     come from the canonical operating-system catalogue; nothing here is a
 *     hardcoded list of searchable OS groups;
 *   - a result link is navigation only. The destination page re-runs its own
 *     server-side guard, so the URL never authorizes anything;
 *   - 300 ms debounce + AbortController keep the request stream bounded; the
 *     API itself bounds query length, page size and per-source volume.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BEYU_CONTROL_PLANE,
  SECTOR_OPERATING_SYSTEMS,
} from "@/lib/operating-system-catalog";

type SearchHit = {
  type: string;
  os: string;
  id: string;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  classification: string | null;
  deepLink: string;
  rank: number;
};

type SearchResponse = {
  data: {
    query: string;
    results: SearchHit[];
    total: number;
    limit: number;
    offset: number;
    sourcesSearched: string[];
  };
  meta?: { traceId?: string };
};

/** Canonical catalogue → display name. Unknown codes fall back to the code. */
const OS_LABELS: Record<string, string> = {
  [BEYU_CONTROL_PLANE.code]: BEYU_CONTROL_PLANE.name,
  ...Object.fromEntries(SECTOR_OPERATING_SYSTEMS.map((os) => [os.code, os.name])),
};

const DEBOUNCE_MS = 300;
const MIN_QUERY = 2;

/**
 * `visible` is presentation only: the layout hides the control for principals
 * that hold no search grant, so the shell never advertises a capability the
 * session cannot exercise. Authorization is enforced by the API regardless.
 */
export function GlobalSearch({ visible = true }: { visible?: boolean }) {
  if (!visible) return null;
  return <GlobalSearchControl />;
}

function GlobalSearchControl() {
  const router = useRouter();
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = query.trim();
  const shouldSearch = trimmed.length >= MIN_QUERY;

  const runSearch = useCallback(
    async (q: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams({ q, limit: "20" });
        const res = await fetch(`/api/v1/search?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          // 401/403/429/422 all mean "nothing to show" for a read surface;
          // never surface response bodies (they may describe the boundary).
          setHits([]);
          setError(true);
          return;
        }
        const body = (await res.json()) as SearchResponse;
        setHits(body.data.results);
        setActiveIndex(body.data.results.length > 0 ? 0 : -1);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setHits([]);
        setError(true);
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    },
    [],
  );

  // Abort in-flight work on unmount (the close effect already does this when
  // the panel closes; this covers the component unmounting while open).
  useEffect(() => () => abortRef.current?.abort(), []);

  // Debounce input → search. State resets happen in the handler, the effect
  // only schedules bounded external work.
  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setQuery(value);
    const q = value.trim();
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < MIN_QUERY) {
      abortRef.current?.abort();
      setHits(null);
      setLoading(false);
      setError(false);
      return;
    }
    timerRef.current = setTimeout(() => void runSearch(q), DEBOUNCE_MS);
  };

  // Close on outside click; abort in-flight work when closing.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      abortRef.current?.abort();
    };
  }, [open]);

  const openSearch = () => {
    setOpen(true);
    // Focus lands on the input once the effect below has rendered it.
  };

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else triggerRef.current?.focus();
  }, [open]);

  const choose = (hit: SearchHit) => {
    setOpen(false);
    setQuery("");
    setHits(null);
    router.push(hit.deepLink);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!hits || hits.length === 0) return;
      event.preventDefault();
      setActiveIndex((current) => {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next = current < 0 ? (delta === 1 ? 0 : hits.length - 1) : (current + delta + hits.length) % hits.length;
        return next;
      });
    } else if (event.key === "Enter") {
      if (activeIndex >= 0 && hits && hits[activeIndex]) {
        event.preventDefault();
        choose(hits[activeIndex]);
      }
    }
  };

  // Group hits by their result `os` — derived from the authorized response,
  // never a fixed list. Stable ordering: first-appearance order of groups.
  const groups: Array<{ os: string; label: string; items: SearchHit[] }> = [];
  if (hits) {
    for (const hit of hits) {
      let group = groups.find((g) => g.os === hit.os);
      if (!group) {
        group = { os: hit.os, label: OS_LABELS[hit.os] ?? hit.os, items: [] };
        groups.push(group);
      }
      group.items.push(hit);
    }
  }

  const activeId = hits && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;
  let flatIndex = -1;

  return (
    <div ref={rootRef} className="relative shrink-0 print:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Search"
        title="Search"
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-white/20 px-3 text-xs font-medium text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37]"
      >
        <span aria-hidden="true">⌕</span>
        <span className="hidden sm:inline">Search</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Global search"
          className="absolute right-0 top-full z-50 mt-2 w-[26rem] max-w-[92vw] rounded-md border border-white/15 bg-[#0d2140] shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
            <span aria-hidden="true" className="text-white/50">
              ⌕
            </span>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              role="combobox"
              aria-expanded={true}
              aria-controls={listboxId}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Search tenants, entities, documents, resolutions, projects…"
              value={query}
              onChange={onChange}
              onKeyDown={onKeyDown}
              className="w-full bg-transparent text-xs text-white placeholder:text-white/35 focus:outline-none"
            />
            {loading && <span aria-hidden="true" className="text-[10px] text-white/40">…</span>}
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-label="Search results"
            className="max-h-96 overflow-y-auto py-1"
          >
            {!shouldSearch && (
              <p className="px-3 py-4 text-[11.5px] text-white/45">
                Search across the operating systems you are authorized for. Type at least {MIN_QUERY} characters.
              </p>
            )}
            {shouldSearch && loading && hits === null && (
              <p className="px-3 py-4 text-[11.5px] text-white/45">Searching…</p>
            )}
            {shouldSearch && error && (
              <p className="px-3 py-4 text-[11.5px] text-white/45">Search is unavailable right now.</p>
            )}
            {shouldSearch && !error && hits && hits.length === 0 && (
              <p className="px-3 py-4 text-[11.5px] text-white/45">No results in your authorized scope.</p>
            )}
            {groups.map((group) => (
              <div key={group.os}>
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[#efd98f]">
                  {group.label}
                </p>
                {group.items.map((hit) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={`${hit.type}-${hit.id}`}
                      type="button"
                      id={`${listboxId}-option-${index}`}
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => choose(hit)}
                      className={`block w-full px-3 py-2 text-left transition ${
                        active ? "bg-[#d4af37]/15" : "hover:bg-white/5"
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-medium text-white">{hit.title}</span>
                        {hit.classification && (
                          <span className="shrink-0 text-[9.5px] uppercase tracking-wide text-white/35">
                            {hit.classification}
                          </span>
                        )}
                      </span>
                      {hit.subtitle && (
                        <span className="mt-0.5 block truncate text-[10.5px] text-white/50">{hit.subtitle}</span>
                      )}
                      {hit.snippet && (
                        <span className="mt-0.5 line-clamp-2 block text-[10.5px] text-white/60">{hit.snippet}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
