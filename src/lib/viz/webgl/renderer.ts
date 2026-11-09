/**
 * BEYU OS — DEPENDENCY-FREE WEBGL RENDERER (shared capability, WEBGL_3D).
 *
 * Renders an already-governed `WebGLScene` (see ./scene.ts) on an ordinary
 * phone or desktop browser using WebGL1 only — no third-party graphics
 * library, no binary model assets, no textures, no external requests. The
 * scene arrives fully authorized; this class decides only HOW to draw it
 * (the renderer is never an authorization boundary).
 *
 * DESIGN RULES
 * ─────────────
 *   • PROGRESSIVE ENHANCEMENT. If WebGL cannot be created, `init()` fails
 *     with a reason and the caller keeps the 2D projection/table channel —
 *     never an infinite loader, never a blocked Noelia interaction.
 *   • RENDER ON DEMAND. There is no requestAnimationFrame loop: a frame is
 *     drawn when the scene, camera, size or selection changes. Reduced
 *     motion is honored structurally (nothing animates by itself).
 *   • CONTEXT LOSS FAILS CLOSED. `webglcontextlost` emits an event (the UI
 *     falls back to 2D); at most one restore attempt is made — repeated
 *     re-initialization is never attempted.
 *   • MOBILE-SAFE. Device pixel ratio capped at 2; passive wheel handling;
 *     all camera inputs clamped (NaN never reaches the GPU).
 *   • DOM-LEAN. The class touches only the canvas it is given; input event
 *     wiring lives in the UI component so this module stays testable.
 *
 * This file is loaded ONLY in the browser (the workspace imports the 3D
 * panel lazily); nothing here executes during server rendering.
 */
import {
  clamp,
  createOrbitCamera,
  isFiniteVec3,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  mat4Scaling,
  mat4Translation,
  orbitBy,
  orbitEye,
  panBy,
  zoomBy,
  type Mat4,
  type OrbitCamera,
} from "./math";
import type { WebGLScene } from "./scene";

export type Scene3DStatus =
  | "initializing"
  | "ready"
  | "error"
  | "context-lost"
  | "context-restored";

export type Scene3DEvent = {
  status: Scene3DStatus;
  /** Honest, user-presentable reason (present for error/context states). */
  reason?: string;
};

export type RendererInitResult =
  | { ok: true }
  | { ok: false; reason: string };

const VERTEX_SHADER = `
attribute vec3 aPos;
uniform mat4 uMVP;
uniform mat4 uModel;
void main() {
  gl_Position = uMVP * uModel * vec4(aPos, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform vec4 uColor;
void main() {
  gl_FragColor = uColor;
}
`;

/** Unit cube centered at origin (36 indices). */
const CUBE_POSITIONS = new Float32Array([
  // +X
  0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5,
  // -X
  -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5,
  // +Y
  -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
  // -Y
  -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
  // +Z
  -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
  // -Z
  0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
]);

const CUBE_INDICES = new Uint16Array([
  0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19,
  20, 21, 22, 20, 22, 23,
]);

type RGBA = [number, number, number, number];

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function hexToRgba(hex: string, alpha = 1): RGBA {
  if (typeof hex !== "string" || !HEX_COLOR.test(hex)) return [0.043, 0.122, 0.302, alpha]; // fallback: BEYU navy
  const clean = hex.slice(1);
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
    alpha,
  ];
}

const BG: RGBA = [0.031, 0.09, 0.2, 1]; // #081733 — same navy as the 2D projection panel
const GOLD: RGBA = hexToRgba("#D4A017", 1);
const GRID_COLOR: RGBA = [0.831, 0.627, 0.09, 0.28]; // gold at low alpha

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  // Shaders are no longer needed once linked.
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * Probe-only check (detached canvas, no lasting context on the view): can
 * this browser produce a WebGL context right now? Used by the UI before
 * constructing the renderer. Uses a throwaway canvas so probing can never
 * poison the real view's context.
 */
export function probeCanvasWebGL(): RendererInitResult {
  try {
    if (typeof document === "undefined") {
      return { ok: false, reason: "There is no browser runtime for 3D rendering." };
    }
    const probe = document.createElement("canvas");
    const gl = (probe.getContext("webgl2") ??
      probe.getContext("webgl") ??
      probe.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) {
      return { ok: false, reason: "This device or browser did not provide a WebGL context." };
    }
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { ok: true };
  } catch {
    return { ok: false, reason: "WebGL initialization was refused by the browser." };
  }
}

export class HolographWebGLRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly reducedMotion: boolean;
  private readonly onEvent: (event: Scene3DEvent) => void;

  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private cubeBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private gridBuffer: WebGLBuffer | null = null;
  private gridVertexCount = 0;

  private aPos = -1;
  private uMVP: WebGLUniformLocation | null = null;
  private uModel: WebGLUniformLocation | null = null;
  private uColor: WebGLUniformLocation | null = null;

  private scene: WebGLScene | null = null;
  private camera: OrbitCamera | null = null;
  private selectedId: string | null = null;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private restoreAttempts = 0;
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    opts: { reducedMotion?: boolean; onEvent?: (event: Scene3DEvent) => void } = {},
  ) {
    this.canvas = canvas;
    this.reducedMotion = opts.reducedMotion === true;
    this.onEvent = opts.onEvent ?? (() => {});
  }

  /** Create the context and GPU resources. Never throws; fails closed. */
  init(): RendererInitResult {
    if (this.disposed) return { ok: false, reason: "The 3D renderer was already disposed." };
    try {
      const gl = (this.canvas.getContext("webgl", {
        antialias: true,
        alpha: false,
        depth: true,
        // Keep the context out of power-saving trouble on phones: we render
        // on demand and never loop.
        powerPreference: "low-power",
        preserveDrawingBuffer: false,
      }) ??
        this.canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
      if (!gl) {
        return { ok: false, reason: "This device or browser did not provide a WebGL context." };
      }
      this.gl = gl;

      const program = createProgram(gl);
      if (!program) {
        this.gl = null;
        return { ok: false, reason: "The 3D shader program could not be compiled on this device." };
      }
      this.program = program;
      this.aPos = gl.getAttribLocation(program, "aPos");
      this.uMVP = gl.getUniformLocation(program, "uMVP");
      this.uModel = gl.getUniformLocation(program, "uModel");
      this.uColor = gl.getUniformLocation(program, "uColor");

      const cube = gl.createBuffer();
      const indices = gl.createBuffer();
      if (!cube || !indices) {
        this.release();
        return { ok: false, reason: "GPU buffers could not be allocated." };
      }
      this.cubeBuffer = cube;
      this.indexBuffer = indices;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, CUBE_POSITIONS, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, CUBE_INDICES, gl.STATIC_DRAW);

      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(BG[0], BG[1], BG[2], BG[3]);

      this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
      this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);

      this.onEvent({ status: "initializing" });
      return { ok: true };
    } catch {
      this.release();
      return { ok: false, reason: "WebGL initialization failed unexpectedly." };
    }
  }

  private handleContextLost = (event: Event): void => {
    // Per spec the listener must preventDefault or restoration never fires.
    event.preventDefault();
    this.gl = null;
    this.program = null;
    this.onEvent({
      status: "context-lost",
      reason: "The 3D graphics context was lost (common under memory pressure on phones). The 2D view remains available.",
    });
  };

  private handleContextRestored = (): void => {
    if (this.disposed) return;
    this.restoreAttempts += 1;
    if (this.restoreAttempts > 1) {
      this.onEvent({
        status: "error",
        reason: "The 3D graphics context could not be restored reliably; staying on the 2D view.",
      });
      return;
    }
    const again = this.init();
    if (!again.ok) {
      this.onEvent({ status: "error", reason: again.reason });
      return;
    }
    if (this.scene) this.setScene(this.scene);
    this.onEvent({ status: "context-restored" });
    this.render();
  };

  /** Upload a scene (allocates the ground grid from scene bounds). */
  setScene(scene: WebGLScene): void {
    if (!this.gl || !this.cubeBuffer) return;
    this.scene = scene;
    this.camera = createOrbitCamera({ target: scene.center, radius: scene.radius });
    this.buildGrid(scene);
    this.render();
  }

  private buildGrid(scene: WebGLScene): void {
    const gl = this.gl;
    if (!gl) return;
    const { min, max } = scene.bounds;
    const y = min[1] - scene.radius * 0.02;
    const lines: number[] = [];
    const DIV = 8;
    for (let i = 0; i <= DIV; i++) {
      const t = i / DIV;
      const x = min[0] + (max[0] - min[0]) * t;
      const z = min[2] + (max[2] - min[2]) * t;
      lines.push(x, y, min[2], x, y, max[2]);
      lines.push(min[0], y, z, max[0], y, z);
    }
    if (!this.gridBuffer) this.gridBuffer = gl.createBuffer();
    if (!this.gridBuffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
    this.gridVertexCount = lines.length / 3;
  }

  /** Resize the drawing buffer (CSS size × capped DPR). */
  resize(cssWidth: number, cssHeight: number, dpr?: number): void {
    const w = Math.max(1, Math.floor(cssWidth));
    const h = Math.max(1, Math.floor(cssHeight));
    // DPR cap at 2: a 3× phone retina buffer triples fill-rate for no
    // visible gain at this scene complexity.
    const ratio = clamp(Number.isFinite(dpr) ? (dpr as number) : 1, 0.5, 2);
    if (this.width === w && this.height === h && this.dpr === ratio) return;
    this.width = w;
    this.height = h;
    this.dpr = ratio;
    this.canvas.width = Math.floor(w * ratio);
    this.canvas.height = Math.floor(h * ratio);
    this.render();
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    this.render();
  }

  orbit(dYawRad: number, dPitchRad: number): void {
    if (!this.camera) return;
    this.camera = orbitBy(this.camera, dYawRad, dPitchRad);
    this.render();
  }

  zoom(factor: number): void {
    if (!this.camera) return;
    this.camera = zoomBy(this.camera, factor);
    this.render();
  }

  pan(dxPx: number, dyPx: number): void {
    if (!this.camera) return;
    if (!Number.isFinite(dxPx) || !Number.isFinite(dyPx)) return;
    this.camera = panBy(this.camera, dxPx, dyPx);
    this.render();
  }

  resetCamera(): void {
    if (!this.scene) return;
    this.camera = createOrbitCamera({ target: this.scene.center, radius: this.scene.radius });
    this.render();
  }

  /** Reduced-motion policy accessor (manual camera moves are always allowed;
   * nothing here ever auto-animates, so this is informational for the UI). */
  get prefersReducedMotion(): boolean {
    return this.reducedMotion;
  }

  /** Draw exactly one frame. Safe to call often; does nothing when disposed. */
  render(): void {
    const gl = this.gl;
    const scene = this.scene;
    const camera = this.camera;
    if (this.disposed || !gl || !scene || !camera || !this.program) return;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const projection = mat4Perspective(Math.PI / 4, aspect, Math.max(scene.radius * 0.01, 0.001), scene.radius * 40 + 10);
    const eye = orbitEye(camera);
    if (!isFiniteVec3(eye)) return;
    const view = mat4LookAt(eye, camera.target, [0, 1, 0]);
    const vp = mat4Multiply(projection, view);

    gl.useProgram(this.program);

    // Ground grid first (lines).
    if (this.gridBuffer && this.gridVertexCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gridBuffer);
      gl.enableVertexAttribArray(this.aPos);
      gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(this.uMVP, false, vp);
      gl.uniformMatrix4fv(this.uModel, false, mat4Translation(0, 0, 0));
      gl.uniform4fv(this.uColor, GRID_COLOR);
      gl.drawArrays(gl.LINES, 0, this.gridVertexCount);
    }

    // Nodes (unit cube × per-node transform).
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuffer!);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer!);
    gl.uniformMatrix4fv(this.uMVP, false, vp);

    for (const node of scene.nodes) {
      const model = mat4Multiply(
        mat4Translation(node.position[0], node.position[1], node.position[2]),
        mat4Scaling(node.size[0], node.size[1], node.size[2]),
      );
      const color: RGBA =
        node.id === this.selectedId ? GOLD : hexToRgba(node.color, 1);
      gl.uniformMatrix4fv(this.uModel, false, model);
      gl.uniform4fv(this.uColor, color);
      gl.drawElements(gl.TRIANGLES, CUBE_INDICES.length, gl.UNSIGNED_SHORT, 0);
    }
  }

  private release(): void {
    const gl = this.gl;
    try {
      if (gl) {
        if (this.cubeBuffer) gl.deleteBuffer(this.cubeBuffer);
        if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
        if (this.gridBuffer) gl.deleteBuffer(this.gridBuffer);
        if (this.program) gl.deleteProgram(this.program);
      }
    } catch {
      /* release must never throw */
    }
    this.cubeBuffer = null;
    this.indexBuffer = null;
    this.gridBuffer = null;
    this.program = null;
    this.gridVertexCount = 0;
    this.gl = null;
  }

  /** Full cleanup — canvas listeners, GPU resources, state. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.release();
    this.gl = null;
    this.scene = null;
    this.camera = null;
  }
}
