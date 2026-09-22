"use client";
/**
 * BEYU OS — Universal Dimensional Graphics workspace (client).
 *
 * The ONE shared visualization surface for every canonical consumer (Health
 * OS, Finance OS, Agriculture OS, UJENZI OS — a full Sector OS — and the BEYU
 * Foundation). Design rules baked into this file:
 *
 *   • The accessible table equivalent of every scene is ALWAYS rendered —
 *     graphics are an enhancement, never the only channel (§26).
 *   • Every value carries its epistemic status badge (OBSERVED/DERIVED/
 *     FORECAST/UNAVAILABLE…): missing data reads UNAVAILABLE, never 0.
 *   • Withheld-by-classification counts are disclosed (the picture may be
 *     partial); the withheld rows themselves never reach this component.
 *   • Exports go through the governed ledger endpoint only (viewing is not
 *     exporting); the downloaded bytes are the same governed manifest.
 *   • Honest labels: WebGL 3D, XR, PDF/IFC export and Health clinical
 *     datasets are shown as PLANNED/NOT_IMPLEMENTED — the UI never implies
 *     capability the repository does not contain.
 *   • Reduced motion is honored (matchMedia + server hint); no decorative
 *     animation; keyboard operable through native controls.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, EmptyState, LoadingState, Panel, stateTone } from "@/components/brand";
import type { SceneLayer, SceneManifest } from "@/lib/viz/scene-model";
import type { AdapterDescriptor } from "@/lib/viz/adapters/types";
import type { DimensionDefinition, VizSectorCode } from "@/lib/viz/dimensions";
import {
  ACCESSIBLE_SERIES_PALETTE,
  KEYBOARD_CONTRACT,
  sceneTextAlternative,
} from "@/lib/viz/accessibility";

/* ─────────────────────────── prop shapes (serializable) ─────────────────────────── */

type SceneInfo = {
  id: string;
  name: string;
  sector: VizSectorCode;
  subjectType: string | null;
  subjectId: string | null;
  dimensions: string[];
  layers: SceneLayer[];
  status: "ACTIVE" | "ARCHIVED";
  classification: string;
  updatedAt: string;
};

type TwinInfo = {
  id: string;
  twinKey: string;
  sector: VizSectorCode;
  subjectType: string;
  subjectId: string;
  name: string;
  status: "REGISTERED" | "ARCHIVED";
  classification: string;
  createdAt: string;
};

type RendererInfo = {
  kind: string;
  contract: string;
  dimensions: string[];
  status: string;
  fallback: string | null;
  requirements: {
    webgl?: boolean;
    webgpu?: boolean;
    lowBandwidthCapable: boolean;
    reducedMotionCapable: boolean;
    mobileCapable: boolean;
  };
  futureDependencies: string[];
};

type SubsystemInfo = { subsystem: string; status: string; where: string };

type TwinProjection = {
  identity: { twinKey: string; sector: string; name: string; subjectType: string; subjectId: string };
  facets: string[];
  state: Array<{ code: string; reading: { value: unknown; status: string; unit: string | null } }>;
  relationships: Array<{ to: string; relation: string; status: string }>;
  geometry: { crs: string; latitude?: number | null; longitude?: number | null } | null;
  time: { registeredAt: string | null; lastObservedAt: string | null; recentEventRefs: string[] };
  measurements: Array<{ code: string; reading: { value: unknown; status: string; unit: string | null }; at: string | null }>;
  lifecycle: { currentStage: { value: unknown; status: string }; history: Array<{ stage: string; at: string | null; sourceStatus: string }> } | null;
  risk: { subjectKey: string; worstOpen: { value: unknown; status: string; unit: string | null }; open: number; closed: number; unknownState: number } | null;
  provenance: { sourceAdapter: string; systemOfRecord: string; collectedAt: string; epistemicStatus: string };
  accessibleText?: string;
};

type ExportRow = {
  id: string;
  format: string;
  contentHash: string;
  byteSize: number;
  rowCount: number;
  sector: string;
  createdAt: string;
};

export type VizWorkspaceProps = {
  registry: { dimensions: DimensionDefinition[]; canonicalCount: number; extensionCount: number };
  scenes: SceneInfo[];
  twins: TwinInfo[];
  adapters: AdapterDescriptor[];
  renderers: RendererInfo[];
  subsystems: SubsystemInfo[];
  permissions: { sceneRead: boolean; sceneManage: boolean; exportAllowed: boolean; dimensionManage: boolean };
};

const SECTORS: VizSectorCode[] = ["BEYU", "HEALTH", "FINANCE", "AGRICULTURE", "UJENZI", "FOUNDATION"];
const DEFAULT_DIMENSIONS = ["1D", "2D", "4D", "5D", "7D", "8D"];
const inputStyle = "rounded border border-slate-500/40 bg-transparent px-2 py-1.5 text-xs";

function statusBadge(status: string) {
  const tone =
    status === "OBSERVED" || status === "IMPLEMENTED" || status === "AVAILABLE"
      ? "green"
      : status === "DERIVED" || status === "EXPERIMENTAL" || status === "PARTIALLY_IMPLEMENTED" || status === "CLIENT_SIDE"
        ? "amber"
        : status === "FORECAST" || status === "SCENARIO" || status === "PLANNED"
          ? "gold"
          : stateTone(status);
  return <Badge tone={tone}>{status}</Badge>;
}

function formatValue(reading: { value: unknown; status: string; unit: string | null }): string {
  if (reading.value === null || reading.value === undefined) return "—";
  const unit = reading.unit ? ` ${reading.unit}` : "";
  return `${String(reading.value)}${unit}`;
}

/* ─────────────────────────── SVG 2D projection (renderer abstraction) ─────────────────────────── */

function SceneProjection({ manifest }: { manifest: SceneManifest }) {
  const located = manifest.objects.filter((o) => o.geometry && (o.geometry.latitude != null || (o.geometry.points && o.geometry.points.length > 0)));
  if (located.length === 0) {
    return (
      <p className="text-[11.5px] beyu-muted">
        No located geometry in this governed view — the sector adapter supplies geometry only where the
        authoritative records carry it (never fabricated coordinates). The accessible table below is the
        complete, canonical representation.
      </p>
    );
  }
  // Equirectangular fit into a 640×360 viewBox using the manifest bounds.
  const coords = located.flatMap((o) => {
    if (o.geometry?.latitude != null && o.geometry?.longitude != null) return [[o.geometry.longitude, o.geometry.latitude] as [number, number]];
    return (o.geometry?.points ?? []).map((p) => [p[0], p[1]] as [number, number]);
  });
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1, spanY = maxY - minY || 1;
  const project = (x: number, y: number): [number, number] => [
    24 + ((x - minX) / spanX) * 592,
    336 - ((y - minY) / spanY) * 312,
  ];
  return (
    <figure>
      <svg viewBox="0 0 640 360" role="img" aria-label={sceneTextAlternative(manifest)} className="w-full rounded border border-slate-500/25 bg-[#081733]">
        <title>{manifest.name} — 2D projection</title>
        {located.map((o, i) => {
          const color = ACCESSIBLE_SERIES_PALETTE[i % ACCESSIBLE_SERIES_PALETTE.length];
          const pts =
            o.geometry?.latitude != null && o.geometry?.longitude != null
              ? [project(o.geometry.longitude, o.geometry.latitude)]
              : (o.geometry?.points ?? []).map((p) => project(p[0], p[1]));
          if (pts.length === 1) {
            return <circle key={o.id} cx={pts[0][0]} cy={pts[0][1]} r={5} fill={color} stroke="#0B1F4D" strokeWidth={1}><title>{o.accessibleText}</title></circle>;
          }
          if (pts.length > 1) {
            return <polygon key={o.id} points={pts.map((p) => p.join(",")).join(" ")} fill={`${color}33`} stroke={color} strokeWidth={1.5}><title>{o.accessibleText}</title></polygon>;
          }
          return null;
        })}
      </svg>
      <figcaption className="mt-1 text-[10.5px] beyu-muted">
        2D projection of {located.length} located object(s) — equirectangular fit, CRS per object
        metadata. 3D (WebGL) rendering is PLANNED; this projection is its governed 2D foundation.
      </figcaption>
    </figure>
  );
}

/* ─────────────────────────── manifest view ─────────────────────────── */

function ManifestView({ manifest, onInspect }: { manifest: SceneManifest; onInspect: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px] beyu-muted">
        <span>System of record: <strong className="text-[11px]">{manifest.provenance.systemOfRecord}</strong></span>
        <span aria-hidden>·</span>
        <span>Collected {new Date(manifest.generatedAt).toISOString().replace("T", " ").slice(0, 19)} UTC</span>
        <span aria-hidden>·</span>
        {statusBadge(manifest.provenance.epistemicStatus)}
        {manifest.withheldByClassification > 0 && (
          <>
            <span aria-hidden>·</span>
            <Badge tone="gold">{manifest.withheldByClassification} object(s) withheld by classification</Badge>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {manifest.layers.map((l) => (
          <Badge key={l.id} tone={l.visible ? "navy" : "slate"}>
            {l.label} · {manifest.objects.filter((o) => o.layerId === l.id).length}
          </Badge>
        ))}
      </div>
      <SceneProjection manifest={manifest} />
      <div>
        <h3 className="beyu-kicker text-[#b08d1c]">Accessible table equivalent (always present)</h3>
        <div className="mt-2 max-h-80 overflow-auto rounded border border-slate-500/25">
          <table className="w-full text-left text-[11.5px]">
            <caption className="sr-only">{manifest.name} — governed scene data as a table</caption>
            <thead className="sticky top-0 bg-[#0B1F4D] text-white">
              <tr>{manifest.accessibleTable.columns.map((c) => <th key={c} scope="col" className="px-2 py-1.5 font-semibold">{c}</th>)}</tr>
            </thead>
            <tbody>
              {manifest.accessibleTable.rows.map((row, i) => (
                <tr key={i} className="border-t border-slate-500/15">
                  {row.map((cell, j) => <td key={j} className="px-2 py-1.5">{cell}</td>)}
                </tr>
              ))}
              {manifest.accessibleTable.rows.length === 0 && (
                <tr><td colSpan={manifest.accessibleTable.columns.length} className="px-2 py-3 beyu-muted">No governed objects in this view.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h3 className="beyu-kicker text-[#b08d1c]">Object inspector</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {manifest.objects.slice(0, 40).map((o) => (
            <button key={o.id} type="button" onClick={() => onInspect(o.id)} className="rounded border border-slate-500/40 px-2 py-1 text-[11px] hover:border-[#D4A017]">
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ObjectInspector({ manifest, objectId }: { manifest: SceneManifest; objectId: string | null }) {
  const object = manifest.objects.find((o) => o.id === objectId) ?? null;
  if (!object) return null;
  return (
    <Panel title={object.label} kicker="Inspected object — governed values only">
      <p className="text-[11.5px] beyu-muted">{object.accessibleText}</p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {Object.entries(object.values).map(([dim, reading]) => (
          <div key={dim} className="rounded border border-slate-500/25 px-3 py-2">
            <dt className="beyu-kicker beyu-muted">{dim}</dt>
            <dd className="mt-1 flex items-center gap-2 text-[12.5px]">
              <span className={reading.status === "UNAVAILABLE" ? "beyu-muted italic" : ""}>{formatValue(reading)}</span>
              {statusBadge(reading.status)}
            </dd>
          </div>
        ))}
      </dl>
      {object.status && <p className="mt-2 text-[11.5px]">Record status: <Badge tone={stateTone(object.status)}>{object.status}</Badge></p>}
      <p className="mt-2 text-[10.5px] beyu-muted">
        Tooltips and inspector values come from the same allowlisted projection as the table — no hidden
        layer, no metadata side-channel. Source record stays in its Sector OS.
      </p>
    </Panel>
  );
}

/* ─────────────────────────── twin view ─────────────────────────── */

function TwinView({ twin }: { twin: TwinProjection }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="navy">{twin.identity.sector}</Badge>
        <span className="font-mono text-[11.5px]">{twin.identity.twinKey}</span>
        {twin.facets.map((f) => <Badge key={f} tone="slate">{f}</Badge>)}
      </div>
      <p className="text-[12px] beyu-muted">{twin.accessibleText ?? `Digital twin of ${twin.identity.name}.`}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="State" kicker="Live readings — re-collected per request">
          {twin.state.length === 0 && <EmptyState message="No governed state readings for this subject." />}
          <dl className="space-y-1.5">
            {twin.state.map((v) => (
              <div key={v.code} className="flex items-center justify-between gap-2 text-[12px]">
                <dt className="beyu-muted">{v.code}</dt>
                <dd className="flex items-center gap-2"><span className={v.reading.status === "UNAVAILABLE" ? "beyu-muted italic" : ""}>{formatValue(v.reading)}</span>{statusBadge(v.reading.status)}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Measurements" kicker="5D/6D — read-governed quantities and performance">
          {twin.measurements.length === 0 && <EmptyState message="No governed measurements for this subject." />}
          <dl className="space-y-1.5">
            {twin.measurements.slice(0, 24).map((m) => (
              <div key={m.code} className="flex items-center justify-between gap-2 text-[12px]">
                <dt className="beyu-muted">{m.code}{m.at ? ` · ${m.at.slice(0, 10)}` : ""}</dt>
                <dd className="flex items-center gap-2"><span>{formatValue(m.reading)}</span>{statusBadge(m.reading.status)}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Lifecycle (7D)" kicker="From sector records — never inferred">
          {!twin.lifecycle && <EmptyState message="No governed lifecycle history for this subject." />}
          {twin.lifecycle && (
            <>
              <p className="text-[12px]">Current stage: <span className="font-semibold">{String(twin.lifecycle.currentStage.value ?? "UNAVAILABLE")}</span> {statusBadge(twin.lifecycle.currentStage.status)}</p>
              <ol className="mt-2 space-y-1">
                {twin.lifecycle.history.slice(-8).map((h, i) => (
                  <li key={i} className="text-[11.5px] beyu-muted">{h.at?.slice(0, 10) ?? "undated"} — {h.stage} (from “{h.sourceStatus}”)</li>
                ))}
              </ol>
            </>
          )}
        </Panel>
        <Panel title="Risk & compliance (8D)" kicker="Open posture from governed records">
          {!twin.risk && <EmptyState message="No governed risk points for this subject." />}
          {twin.risk && (
            <div className="space-y-2 text-[12px]">
              <p>Open {twin.risk.open} · Closed {twin.risk.closed} · Unknown state {twin.risk.unknownState}</p>
              <p>Worst open severity: <Badge tone={stateTone(String(twin.risk.worstOpen.value ?? ""))}>{String(twin.risk.worstOpen.value ?? "UNAVAILABLE")}</Badge> {statusBadge(twin.risk.worstOpen.status)}</p>
            </div>
          )}
        </Panel>
      </div>
      <Panel title="Provenance" kicker="Where every facet came from">
        <p className="text-[11.5px] beyu-muted">
          Adapter {twin.provenance.sourceAdapter} · system of record {twin.provenance.systemOfRecord} ·
          collected {twin.provenance.collectedAt.slice(0, 19).replace("T", " ")} UTC · dominant status{" "}
          {statusBadge(twin.provenance.epistemicStatus)}
        </p>
        <p className="mt-1 text-[11.5px] beyu-muted">
          Twins store identity bindings only; this projection was rebuilt live under your current
          authority. A stored twin can never serve stale or unauthorized sector truth.
        </p>
      </Panel>
    </div>
  );
}

/* ─────────────────────────── workspace ─────────────────────────── */

type Tab = "explore" | "scenes" | "twins" | "exports" | "registry" | "status";

export function VizWorkspace(props: VizWorkspaceProps) {
  const { registry, adapters, renderers, subsystems, permissions } = props;
  const [scenes, setScenes] = useState<SceneInfo[]>(props.scenes);
  const [twins, setTwins] = useState<TwinInfo[]>(props.twins);
  const [tab, setTab] = useState<Tab>("explore");
  const [sector, setSector] = useState<VizSectorCode>("UJENZI");
  const [dimensions, setDimensions] = useState<string[]>(DEFAULT_DIMENSIONS);
  const [manifest, setManifest] = useState<SceneManifest | null>(null);
  const [manifestSource, setManifestSource] = useState<{ sceneId?: string; twinId?: string } | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [twin, setTwin] = useState<TwinProjection | null>(null);
  const [exports, setExports] = useState<ExportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // Subscription-only synchronization: the initial value is picked up
    // asynchronously (avoids cascading renders), then follows the system
    // preference live. SSR always renders the reduced-motion-safe default.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", listener);
    const sync = window.setTimeout(() => setReducedMotion(mq.matches), 0);
    return () => {
      mq.removeEventListener("change", listener);
      window.clearTimeout(sync);
    };
  }, []);

  const selectableDimensions = useMemo(
    () => registry.dimensions.filter((d) => d.id !== "XD"),
    [registry.dimensions],
  );

  const api = useCallback(async function api<T>(path: string, init?: RequestInit): Promise<T> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(path, init);
      const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
      const body = isJson ? await res.json() : await res.text();
      if (!res.ok) {
        const message = isJson ? (body as { error?: { message?: string } })?.error?.message : undefined;
        throw new Error(message ?? `Request failed (${res.status}).`);
      }
      return body as T;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request could not be completed.");
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const buildManifest = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        sector,
        dimensions: dimensions.join(","),
        ...(reducedMotion ? { reducedMotion: "1" } : {}),
      });
      const data = await api<{ manifest: SceneManifest }>(`/api/v1/viz/manifest?${params.toString()}`);
      setManifest(data.manifest);
      setManifestSource(null);
      setInspectedId(null);
      setTab("explore");
    } catch { /* surfaced via error */ }
  }, [api, sector, dimensions, reducedMotion]);

  const loadScene = useCallback(async (id: string) => {
    try {
      const params = reducedMotion ? "?reducedMotion=1" : "";
      const data = await api<{ manifest: SceneManifest }>(`/api/v1/viz/scenes/${id}${params}`);
      setManifest(data.manifest);
      setManifestSource({ sceneId: id });
      setInspectedId(null);
      setTab("explore");
    } catch { /* surfaced via error */ }
  }, [api, reducedMotion]);

  const projectTwin = useCallback(async (id: string) => {
    try {
      const data = await api<{ twin: TwinProjection }>(`/api/v1/viz/twins/${id}`);
      setTwin(data.twin);
      setTab("twins");
    } catch { /* surfaced via error */ }
  }, [api]);

  async function createScene(form: FormData) {
    const name = String(form.get("name") ?? "");
    try {
      await api("/api/v1/viz/scenes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, sector, dimensions }),
      });
      const data = await api<{ scenes: SceneInfo[] }>("/api/v1/viz/scenes");
      setScenes(data.scenes);
      setNotice(`Scene “${name}” saved. Deep links re-authorize on every access.`);
    } catch { /* surfaced via error */ }
  }

  async function archiveScene(id: string) {
    try {
      await api(`/api/v1/viz/scenes/${id}`, { method: "POST" });
      const data = await api<{ scenes: SceneInfo[] }>("/api/v1/viz/scenes");
      setScenes(data.scenes);
      setNotice("Scene archived.");
    } catch { /* surfaced via error */ }
  }

  async function registerTwin(form: FormData) {
    try {
      await api("/api/v1/viz/twins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sector,
          subjectType: String(form.get("subjectType") ?? ""),
          subjectId: String(form.get("subjectId") ?? ""),
          name: String(form.get("name") ?? ""),
        }),
      });
      const data = await api<{ twins: TwinInfo[] }>("/api/v1/viz/twins");
      setTwins(data.twins);
      setNotice("Twin registered — an identity binding; every projection is rebuilt live.");
    } catch { /* surfaced via error */ }
  }

  async function exportNow(format: "JSON" | "CSV") {
    if (!manifestSource?.sceneId && !manifestSource?.twinId) {
      setError("Governed exports attach to a saved scene or registered twin. Save the scene (or open a twin) first — viewing is not exporting.");
      return;
    }
    try {
      const res = await fetch("/api/v1/viz/exports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(manifestSource.sceneId ? { sceneId: manifestSource.sceneId } : { twinId: manifestSource.twinId }),
          sector: manifest?.sector ?? sector,
          format,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? `Export refused (${res.status}).`);
      }
      const hash = res.headers.get("X-BEYU-Export-Hash") ?? "";
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `beyu-scene.${format.toLowerCase()}`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNotice(`Export ledgered — sha256 ${hash.slice(0, 16)}… The downloaded bytes are exactly the governed manifest.`);
      const ledger = await api<{ exports: ExportRow[] }>("/api/v1/viz/exports");
      setExports(ledger.exports);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    }
  }

  async function loadLedger() {
    try {
      const data = await api<{ exports: ExportRow[] }>("/api/v1/viz/exports");
      setExports(data.exports);
    } catch { /* surfaced via error */ }
  }

  const tabs: Array<{ id: Tab; label: string; show: boolean }> = [
    { id: "explore", label: "Explore", show: permissions.sceneRead },
    { id: "scenes", label: "Scenes", show: permissions.sceneRead },
    { id: "twins", label: "Digital twins", show: permissions.sceneRead },
    { id: "exports", label: "Exports", show: permissions.exportAllowed },
    { id: "registry", label: "Dimension registry", show: true },
    { id: "status", label: "Capability status", show: true },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Shared capability — one foundation, every Sector OS</div>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Dimensional Graphics &amp; Digital Twins</h1>
        <p className="mt-1 max-w-3xl text-[12.5px] beyu-muted">
          Universal 1D–8D (+ governed 9D+, XD) visualization over each sector&rsquo;s OWN authorized data.
          Read-governed everywhere; Finance visualization never posts (CAP_POSTING remains LOCKED); Health
          is federation-governed and never exposes PHI. Sector truth stays in its Sector OS — this layer
          projects it, it never copies it.
        </p>
      </header>

      {error && <p role="alert" className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">{error}</p>}
      {notice && <p role="status" className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">{notice}</p>}

      <nav aria-label="Visualization workspace sections" className="flex flex-wrap gap-1.5">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-3 py-1.5 text-[12px] ${tab === t.id ? "border-[#D4A017] bg-[#D4A017]/10 font-semibold" : "border-slate-500/40 hover:border-[#D4A017]"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {permissions.sceneRead && (tab === "explore" || tab === "scenes" || tab === "twins") && (
        <Panel title="Scene controls" kicker="Sector selection never changes the security boundary — every adapter re-authorizes">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              Sector
              <select className={inputStyle} value={sector} onChange={(e) => setSector(e.target.value as VizSectorCode)}>
                {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <fieldset className="flex flex-wrap gap-1.5">
              <legend className="sr-only">Dimensions to activate</legend>
              {selectableDimensions.map((d) => (
                <label key={d.id} className={`flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-[11px] ${dimensions.includes(d.id) ? "border-[#D4A017] bg-[#D4A017]/10" : "border-slate-500/40"}`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={dimensions.includes(d.id)}
                    onChange={(e) =>
                      setDimensions((prev) => (e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id)))
                    }
                  />
                  {d.id}
                </label>
              ))}
            </fieldset>
            <button type="button" onClick={() => void buildManifest()} disabled={busy || dimensions.length === 0} className="rounded bg-[#0B1F4D] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? "Building…" : "Build governed scene"}
            </button>
            {permissions.exportAllowed && manifest && (
              <span className="flex gap-1.5">
                <button type="button" onClick={() => void exportNow("JSON")} disabled={busy} className="rounded border border-slate-500/40 px-2.5 py-1.5 text-[11px] disabled:opacity-50">Export JSON</button>
                <button type="button" onClick={() => void exportNow("CSV")} disabled={busy} className="rounded border border-slate-500/40 px-2.5 py-1.5 text-[11px] disabled:opacity-50">Export CSV</button>
              </span>
            )}
          </div>
          {dimensions.length === 0 && <p className="mt-2 text-[11px] beyu-muted">Activate at least one dimension — unknown or empty combinations are rejected, never assumed.</p>}
        </Panel>
      )}

      {busy && <LoadingState label="Re-authorizing and collecting through the governed adapter" />}

      {tab === "explore" && permissions.sceneRead && !busy && (
        manifest ? (
          <>
            <Panel
              title={manifest.name}
              kicker={`${manifest.sector} · ${manifest.dimensions.join(" + ")}`}
              action={<Badge tone="slate">{manifest.objects.length} object(s)</Badge>}
            >
              <ManifestView manifest={manifest} onInspect={setInspectedId} />
            </Panel>
            <ObjectInspector manifest={manifest} objectId={inspectedId} />
          </>
        ) : (
          <EmptyState message="Build a governed scene, open a saved scene, or project a digital twin. Nothing is preloaded — every dataset is collected live under your authority." />
        )
      )}

      {tab === "scenes" && permissions.sceneRead && (
        <div className="space-y-4">
          <Panel title="Saved scenes" kicker="Configurations are references — deep links re-authorize on every access">
            {scenes.length === 0 && <EmptyState message="No saved scenes yet." />}
            <ul className="divide-y divide-slate-500/15">
              {scenes.map((sc) => (
                <li key={sc.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <button type="button" onClick={() => void loadScene(sc.id)} className="text-left text-[13px] font-medium hover:text-[#a8830f]">
                      {sc.name}
                    </button>
                    <div className="text-[11px] beyu-muted">{sc.sector} · {sc.dimensions.join("+")} · updated {sc.updatedAt.slice(0, 10)} · <Badge tone={stateTone(sc.classification)}>{sc.classification}</Badge></div>
                  </div>
                  {permissions.sceneManage && sc.status === "ACTIVE" && (
                    <button type="button" onClick={() => void archiveScene(sc.id)} disabled={busy} className="rounded border border-slate-500/40 px-2 py-1 text-[11px] disabled:opacity-50">Archive</button>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
          {permissions.sceneManage && (
            <Panel title="Save current scene" kicker="Creating a scene requires the sector's own read boundary too">
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createScene(new FormData(e.currentTarget));
                  e.currentTarget.reset();
                }}
              >
                <label className="flex flex-col gap-1 text-xs">
                  Scene name
                  <input name="name" className={inputStyle} required minLength={2} maxLength={200} />
                </label>
                <span className="text-[11px] beyu-muted">{sector} · {dimensions.join("+") || "no dimensions"}</span>
                <button type="submit" disabled={busy || dimensions.length === 0} className="rounded bg-[#0B1F4D] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Save scene</button>
              </form>
            </Panel>
          )}
        </div>
      )}

      {tab === "twins" && permissions.sceneRead && (
        <div className="space-y-4">
          {permissions.sceneManage && (
            <Panel title="Register a digital twin" kicker="Identity binding only — state is projected live, never cached">
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void registerTwin(new FormData(e.currentTarget));
                  e.currentTarget.reset();
                }}
              >
                <span className="text-[11px] beyu-muted">Sector {sector}</span>
                <label className="flex flex-col gap-1 text-xs">
                  Subject type
                  <input name="subjectType" className={inputStyle} required maxLength={120} placeholder="PROJECT / FIELD / FOUNDATION…" />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Subject id
                  <input name="subjectId" className={inputStyle} required maxLength={200} />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Twin name
                  <input name="name" className={inputStyle} required minLength={2} maxLength={200} />
                </label>
                <button type="submit" disabled={busy} className="rounded bg-[#0B1F4D] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Register twin</button>
              </form>
            </Panel>
          )}
          <Panel title="Registered twins" kicker="Every projection re-runs the sector adapter under your current authority">
            {twins.length === 0 && <EmptyState message="No registered twins yet." />}
            <ul className="divide-y divide-slate-500/15">
              {twins.map((tw) => (
                <li key={tw.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <button type="button" onClick={() => void projectTwin(tw.id)} className="text-left text-[13px] font-medium hover:text-[#a8830f]">{tw.name}</button>
                    <div className="font-mono text-[10.5px] beyu-muted">{tw.twinKey}</div>
                  </div>
                  <Badge tone={stateTone(tw.status)}>{tw.status}</Badge>
                </li>
              ))}
            </ul>
          </Panel>
          {twin && !busy && (
            <Panel title={twin.identity.name} kicker="Live digital-twin projection">
              <TwinView twin={twin} />
            </Panel>
          )}
        </div>
      )}

      {tab === "exports" && permissions.exportAllowed && (
        <div className="space-y-4">
          <Panel title="Governed export ledger" kicker="Every export is reconstructible evidence: format, sha256, size, rows, requester"
            action={<button type="button" onClick={() => void loadLedger()} disabled={busy} className="rounded border border-slate-500/40 px-2 py-1 text-[11px] disabled:opacity-50">Refresh</button>}>
            {exports === null && <EmptyState message="Load the ledger to see audited exports." />}
            {exports !== null && exports.length === 0 && <EmptyState message="No exports recorded yet." />}
            {exports !== null && exports.length > 0 && (
              <ul className="divide-y divide-slate-500/15 text-[11.5px]">
                {exports.map((ex) => (
                  <li key={ex.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{ex.createdAt.slice(0, 19).replace("T", " ")} UTC · {ex.sector} · {ex.format} · {ex.rowCount} row(s) · {ex.byteSize} B</span>
                    <span className="font-mono beyu-muted">sha256 {ex.contentHash.slice(0, 20)}…</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] beyu-muted">
              Server-side artifacts: JSON and CSV of the governed manifest. SVG/PNG can be saved
              client-side from the identical manifest. PDF and IFC export are NOT_IMPLEMENTED — declared,
              not hidden. Exports never widen the view: one projection, one allowlist.
            </p>
          </Panel>
        </div>
      )}

      {tab === "registry" && (
        <div className="space-y-4">
          <Panel title="Universal Dimension Registry" kicker={`${registry.canonicalCount} canonical (1D–8D + XD) · ${registry.extensionCount} governed tenant extension(s)`}>
            <div className="overflow-auto rounded border border-slate-500/25">
              <table className="w-full text-left text-[11.5px]">
                <caption className="sr-only">Dimension registry — capabilities and honest status per dimension</caption>
                <thead className="bg-[#0B1F4D] text-white">
                  <tr><th scope="col" className="px-2 py-1.5">Dimension</th><th scope="col" className="px-2 py-1.5">Activation</th><th scope="col" className="px-2 py-1.5">Lifecycle</th><th scope="col" className="px-2 py-1.5">Status</th></tr>
                </thead>
                <tbody>
                  {registry.dimensions.map((d) => (
                    <tr key={d.id} className="border-t border-slate-500/15">
                      <td className="px-2 py-1.5 font-semibold">{d.id} — {d.name}</td>
                      <td className="px-2 py-1.5 beyu-muted">{d.description}</td>
                      <td className="px-2 py-1.5">{statusBadge(d.lifecycleState)}</td>
                      <td className="px-2 py-1.5">{statusBadge(d.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!permissions.dimensionManage && (
              <p className="mt-2 text-[11px] beyu-muted">
                Registering 9D+ extensions requires viz:dimension.manage (HIGH-RISK, MFA step-up). The
                extension mechanism means a new dimension never redesigns the database.
              </p>
            )}
          </Panel>
          <Panel title="Sector adapter matrix" kicker="Honest per-sector supply — what exists today, what is declared NOT_IMPLEMENTED">
            <div className="grid gap-3 md:grid-cols-2">
              {adapters.map((a) => (
                <article key={a.sector} className="rounded border border-slate-500/25 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[12.5px] font-semibold">{a.sector}</h3>
                    {statusBadge(a.status)}
                  </div>
                  <p className="mt-1 text-[11px] beyu-muted">Supplies: {a.suppliedDimensions.length > 0 ? a.suppliedDimensions.join(", ") : "nothing yet"}</p>
                  <p className="text-[11px] beyu-muted">System of record: {a.systemOfRecord}</p>
                  {a.notImplemented.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-[10.5px] beyu-muted">
                      {a.notImplemented.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="Renderer abstraction" kicker="Requested renderer → resolved renderer with honest fallbacks">
            <div className="overflow-auto rounded border border-slate-500/25">
              <table className="w-full text-left text-[11.5px]">
                <caption className="sr-only">Renderer capability matrix</caption>
                <thead className="bg-[#0B1F4D] text-white">
                  <tr><th scope="col" className="px-2 py-1.5">Renderer</th><th scope="col" className="px-2 py-1.5">Dimensions</th><th scope="col" className="px-2 py-1.5">Status</th><th scope="col" className="px-2 py-1.5">Fallback</th></tr>
                </thead>
                <tbody>
                  {renderers.map((r) => (
                    <tr key={r.kind} className="border-t border-slate-500/15">
                      <td className="px-2 py-1.5 font-semibold">{r.kind}</td>
                      <td className="px-2 py-1.5 beyu-muted">{r.dimensions.join(", ")}</td>
                      <td className="px-2 py-1.5">{statusBadge(r.status)}</td>
                      <td className="px-2 py-1.5 beyu-muted">{r.fallback ?? "none (terminal renderer)"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] beyu-muted">
              XR (AR/VR/MR/spatial) runs through the same abstraction: today the repository ships the
              governed contract and a fail-closed null adapter — NO XR runtime is bundled
              (NOT_IMPLEMENTED, declared honestly).
            </p>
          </Panel>
          <Panel title="Keyboard & accessibility contract" kicker="Graphics are an enhancement — the table equivalent is canonical">
            <ul className="list-disc space-y-1 pl-4 text-[11.5px] beyu-muted">
              {Object.entries(KEYBOARD_CONTRACT).map(([k, v]) => <li key={k}><span className="font-semibold">{k}</span> — {(v as readonly string[]).join(", ")}</li>)}
              <li>Reduced motion: {reducedMotion ? "honored (system preference detected)" : "available (system preference not set)"} — no decorative animation is used regardless.</li>
              <li>Low bandwidth: pass ?lowBandwidth=1 on deep links; the server lowers the object ceiling (120 vs 300), it never lowers security.</li>
            </ul>
          </Panel>
        </div>
      )}

      {tab === "status" && (
        <Panel title="Capability status (honest)" kicker="IMPLEMENTED / PARTIALLY_IMPLEMENTED / PLANNED / NOT_IMPLEMENTED — repository truth, never aspiration">
          <div className="overflow-auto rounded border border-slate-500/25">
            <table className="w-full text-left text-[11.5px]">
              <caption className="sr-only">Subsystem implementation status</caption>
              <thead className="bg-[#0B1F4D] text-white">
                <tr><th scope="col" className="px-2 py-1.5">Subsystem</th><th scope="col" className="px-2 py-1.5">Status</th><th scope="col" className="px-2 py-1.5">Where</th></tr>
              </thead>
              <tbody>
                {subsystems.map((s) => (
                  <tr key={s.subsystem} className="border-t border-slate-500/15">
                    <td className="px-2 py-1.5 font-medium">{s.subsystem}</td>
                    <td className="px-2 py-1.5">{statusBadge(s.status)}</td>
                    <td className="px-2 py-1.5 font-mono text-[10.5px] beyu-muted">{s.where}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] beyu-muted">
            UJENZI OS is a canonical Sector OS and a first-class consumer of this foundation — the
            foundation is never a Ujenzi subsystem, and no BIM/GIS/Digital-Twin/XR &ldquo;OS&rdquo; exists or
            is implied. Foundation (the sister nonprofit) consumes the same capability within its own
            scope. Finance visualization is READ-GOVERNED: it reuses the trial-balance reporting engine
            and can never post — CAP_POSTING remains LOCKED.
          </p>
        </Panel>
      )}
    </div>
  );
}
