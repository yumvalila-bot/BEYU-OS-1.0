"use client";
/**
 * BEYU OS — HOLOGRAPH phone-first 3D view (shared capability).
 *
 * Progressive enhancement over the governed manifest: an interactive WebGL
 * scene with touch, mouse and keyboard control, loaded ONLY when the user
 * opens it (this chunk is dynamically imported by the workspace, so the main
 * application bundle never pays for 3D).
 *
 * RULES BAKED IN
 * ──────────────
 *   • Capability probe FIRST (feature detection, fail-closed): no WebGL →
 *     clear explanation + one-click return to the 2D projection/table. Never
 *     an indefinite loader, never a blocked workspace.
 *   • The accessible table and 2D projection stay canonical — this panel is
 *     an enhancement layer, never the only channel (§26).
 *   • Honest labeling: this is a 3D visualization on the device's SCREEN.
 *     It is not an optical hologram, not AR/VR, not hardware-verified.
 *   • States reflect real renderer events only (initializing/ready/error/
 *     context-lost/restored) — no fabricated activity indicators.
 *   • Reduced motion: the renderer draws on demand; camera motion is only
 *     ever direct manipulation (no auto-rotation, no idle animation).
 *   • Selection mirrors the workspace inspector: choosing an object here is
 *     presentation only (viewing is not executing — interactions continue
 *     through the governed interaction ledger).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SceneManifest } from "@/lib/viz/scene-model";
import { sceneTextAlternative } from "@/lib/viz/accessibility";
import { detectDeviceProfile } from "@/lib/viz/capability";
import { resolveRenderer } from "@/lib/viz/renderers";
import { buildWebGLScene } from "@/lib/viz/webgl/scene";
import { HolographWebGLRenderer, type Scene3DEvent } from "@/lib/viz/webgl/renderer";

export type Scene3DProps = {
  manifest: SceneManifest;
  reducedMotion: boolean;
  selectedId: string | null;
  onSelect: (objectId: string) => void;
  /** Leave 3D mode (with an optional honest reason to surface upstream). */
  onExit: (reason?: string) => void;
};

type Phase = "preparing" | "ready" | "no-geometry" | "error";

const ORBIT_SPEED = 0.008; // radians per pointer pixel
const KEY_STEP = 0.14; // radians per key press
const ZOOM_STEP = 0.86;
const MAX_OBJECT_CHIPS = 60;

export function Scene3DPanel({ manifest, reducedMotion, selectedId, onSelect, onExit }: Scene3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<HolographWebGLRenderer | null>(null);

  const scene = useMemo(() => buildWebGLScene(manifest), [manifest]);

  /** Static pre-flight (render-time, deterministic): decide BEFORE the effect
   * whether this device/scene can even attempt 3D. Deriving these outcomes
   * outside the effect keeps the effect free of synchronous state writes. */
  const preflight = useMemo<{ phase: Phase; message: string | null }>(() => {
    if (scene.nodes.length === 0) {
      return { phase: "no-geometry", message: null };
    }
    const profile = detectDeviceProfile();
    const resolution = resolveRenderer("WEBGL_3D", profile);
    if (resolution.primary.kind !== "WEBGL_3D") {
      return {
        phase: "error",
        message: `3D rendering is unavailable on this device: ${resolution.reason} The 2D projection and accessible table remain fully available.`,
      };
    }
    return { phase: "preparing", message: null };
  }, [scene]);

  const [phase, setPhase] = useState<Phase>(preflight.phase);
  const [message, setMessage] = useState<string | null>(preflight.message);

  /* ── lifecycle: init → resize/selection wiring → dispose ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    // Pre-flight said no: nothing to initialize (state already reflects it).
    if (preflight.phase !== "preparing") return;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    // Single transition funnel: every phase write flows through this nested
    // callback (renderer events, init outcome, first-frame readiness).
    const handleEvent = (event: Scene3DEvent) => {
      if (disposed) return;
      if (event.status === "initializing") {
        setPhase("preparing");
      } else if (event.status === "ready" || event.status === "context-restored") {
        setPhase("ready");
        setMessage(null);
      } else if (event.status === "context-lost" || event.status === "error") {
        setPhase("error");
        setMessage(event.reason ?? "The 3D view could not continue on this device.");
      }
    };

    const renderer = new HolographWebGLRenderer(canvas, { reducedMotion, onEvent: handleEvent });
    const init = renderer.init();
    if (!init.ok) {
      renderer.dispose();
      handleEvent({ status: "error", reason: init.reason });
      return;
    }
    rendererRef.current = renderer;
    renderer.setScene(scene);
    renderer.setSelected(selectedId);

    // Size: draw at the container's box × capped device pixel ratio.
    const applySize = () => {
      const rect = container.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, typeof window !== "undefined" ? window.devicePixelRatio : 1);
    };
    applySize();
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(applySize);
      resizeObserver.observe(container);
    }

    /* ── pointer controls: 1-finger/mouse orbit, 2-finger pinch zoom ── */
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchStart = 0;

    const distance = () => {
      const pts = [...pointers.values()];
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };

    const onPointerDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) pinchStart = distance();
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        renderer.orbit(dx * ORBIT_SPEED, -dy * ORBIT_SPEED);
      } else if (pointers.size === 2) {
        const now = distance();
        if (pinchStart > 0 && now > 0) {
          renderer.zoom(pinchStart / now);
          pinchStart = now;
        }
      }
    };
    const onPointerEnd = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = 0;
    };
    const onWheel = (e: WheelEvent) => {
      // Non-passive so the page does not scroll while zooming the scene.
      e.preventDefault();
      renderer.zoom(e.deltaY > 0 ? 1.12 : 0.89);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const step = KEY_STEP;
      switch (e.key) {
        case "ArrowLeft":
          renderer.orbit(-step, 0);
          break;
        case "ArrowRight":
          renderer.orbit(step, 0);
          break;
        case "ArrowUp":
          renderer.orbit(0, step);
          break;
        case "ArrowDown":
          renderer.orbit(0, -step);
          break;
        case "+":
        case "=":
          renderer.zoom(ZOOM_STEP);
          break;
        case "-":
        case "_":
          renderer.zoom(1 / ZOOM_STEP);
          break;
        case "0":
          renderer.resetCamera();
          break;
        default:
          return; // let the browser handle Tab/Esc/etc.
      }
      e.preventDefault();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerEnd);
    canvas.addEventListener("pointercancel", onPointerEnd);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKeyDown);

    handleEvent({ status: "ready" });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKeyDown);
      renderer.dispose();
      rendererRef.current = null;
    };
    // The panel is remounted per manifest (keyed by generatedAt upstream), so
    // scene identity changes come with a fresh lifecycle by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, reducedMotion]);

  useEffect(() => {
    rendererRef.current?.setSelected(selectedId);
  }, [selectedId]);

  const zoomIn = useCallback(() => rendererRef.current?.zoom(ZOOM_STEP), []);
  const zoomOut = useCallback(() => rendererRef.current?.zoom(1 / ZOOM_STEP), []);
  const resetView = useCallback(() => rendererRef.current?.resetCamera(), []);

  const locatedObjects = scene.nodes.slice(0, MAX_OBJECT_CHIPS);

  return (
    <section aria-label="Interactive 3D view (WebGL)" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="beyu-kicker text-[#b08d1c]">Interactive 3D view (WebGL, progressive enhancement)</h3>
        <span className="text-[10.5px] beyu-muted" data-testid="scene3d-phase">
          {phase === "preparing" && "Preparing 3D…"}
          {phase === "ready" && `${scene.nodes.length} located object(s) · drag or arrow keys to orbit`}
          {phase === "no-geometry" && "No located geometry"}
          {phase === "error" && "3D unavailable"}
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative aspect-[16/10] w-full overflow-hidden rounded border border-slate-500/25 bg-[#081733]"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017]"
          tabIndex={0}
          role="img"
          aria-label={sceneTextAlternative(manifest)}
          data-testid="scene3d-canvas"
        />
        {phase === "preparing" && (
          <div role="status" className="absolute inset-0 grid place-items-center text-[12px] text-white/85">
            <p className="rounded bg-[#0B1F4D]/85 px-3 py-2">Preparing the 3D view…</p>
          </div>
        )}
        {phase === "no-geometry" && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            <div className="max-w-md space-y-2 rounded border border-slate-500/40 bg-[#0B1F4D]/90 p-3 text-[11.5px] text-white/90">
              <p>
                No located geometry in this governed view ({scene.unlocatedCount} object(s) carry no geometry) —
                the sector adapter never fabricates coordinates. The 2D projection and the accessible table
                below remain the complete representation.
              </p>
              <button
                type="button"
                onClick={() => onExit("3D closed — this view has no located geometry.")}
                className="rounded border border-[#D4A017] px-2.5 py-1 text-[11px] font-semibold text-[#D4A017]"
              >
                Return to 2D view
              </button>
            </div>
          </div>
        )}
        {phase === "error" && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            <div role="alert" className="max-w-md space-y-2 rounded border border-rose-500/40 bg-[#0B1F4D]/90 p-3 text-[11.5px] text-white/90">
              <p>{message ?? "The 3D view could not start on this device."}</p>
              <button
                type="button"
                onClick={() => onExit(message ?? "3D unavailable.")}
                className="rounded border border-[#D4A017] px-2.5 py-1 text-[11px] font-semibold text-[#D4A017]"
              >
                Return to 2D view
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={zoomIn}
          disabled={phase !== "ready"}
          className="rounded border border-slate-500/40 px-2.5 py-1 text-[11px] hover:border-[#D4A017] disabled:opacity-50"
          aria-label="Zoom in"
        >
          Zoom in
        </button>
        <button
          type="button"
          onClick={zoomOut}
          disabled={phase !== "ready"}
          className="rounded border border-slate-500/40 px-2.5 py-1 text-[11px] hover:border-[#D4A017] disabled:opacity-50"
          aria-label="Zoom out"
        >
          Zoom out
        </button>
        <button
          type="button"
          onClick={resetView}
          disabled={phase !== "ready"}
          className="rounded border border-slate-500/40 px-2.5 py-1 text-[11px] hover:border-[#D4A017] disabled:opacity-50"
          aria-label="Reset the 3D camera"
        >
          Reset view
        </button>
        <button
          type="button"
          onClick={() => onExit()}
          className="rounded border border-slate-500/40 px-2.5 py-1 text-[11px] hover:border-[#D4A017]"
          aria-label="Exit the 3D view and return to the 2D projection"
        >
          Exit 3D
        </button>
        <span className="text-[10.5px] beyu-muted">
          Keyboard: arrows orbit · +/− zoom · 0 reset
          {reducedMotion ? " · reduced motion honored (no automatic animation)" : ""}
        </span>
      </div>

      {locatedObjects.length > 0 && (
        <div>
          <h4 className="beyu-kicker text-[#b08d1c]">Select a located object (accessible alternative to tapping the scene)</h4>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {locatedObjects.map((node) => (
              <button
                key={node.id}
                type="button"
                aria-pressed={selectedId === node.id}
                onClick={() => onSelect(node.id)}
                className={`rounded border px-2 py-1 text-[11px] ${
                  selectedId === node.id
                    ? "border-[#D4A017] bg-[#D4A017]/10 text-[#b08d1c]"
                    : "border-slate-500/40 hover:border-[#D4A017]"
                }`}
              >
                {node.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10.5px] beyu-muted">
        This is an interactive 3D visualization rendered on this device&apos;s screen — it is not an optical
        hologram and not an AR/VR session. {scene.unlocatedCount > 0 && `${scene.unlocatedCount} object(s) without geometry are shown only in the table below. `}
        {scene.cappedCount > 0 && `${scene.cappedCount} located object(s) beyond the client display cap are omitted here (the table below lists all authorized rows). `}
        Rendering reads only the governed manifest above; it never authorizes actions or additional data.
      </p>
    </section>
  );
}
