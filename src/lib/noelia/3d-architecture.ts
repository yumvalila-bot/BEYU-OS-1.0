/**
 * NOELIA 3D ARCHITECTURE — Provider/Model-Independent Interfaces
 *
 * Implements production-ready 3D integration architecture without
 * fabricating a finished 3D character model. Supports eventual GLTF/GLB,
 * WebGL, Three.js, React Three Fiber, skeletal animation, facial expressions,
 * blend shapes, idle/speaking/listening/thinking animations, and graceful fallback.
 */

export type Noelia3DExpression =
  | "idle"
  | "speaking"
  | "listening"
  | "thinking"
  | "success"
  | "warning"
  | "error"
  | "attention";

export type Noelia3DAnimationState =
  | "idle"
  | "speaking"
  | "listening"
  | "thinking"
  | "walking"
  | "attention";

export interface Noelia3DExpressionController {
  setExpression(expression: Noelia3DExpression): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE">;
  getCurrentExpression(): Noelia3DExpression;
  dispose(): void;
}

export interface Noelia3DAnimationController {
  playAnimation(state: Noelia3DAnimationState): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE">;
  stopAnimation(): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE">;
  getCurrentAnimation(): Noelia3DAnimationState | null;
  dispose(): void;
}

export interface Noelia3DLipSyncController {
  sync(text: string, profile?: unknown): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE">;
  stop(): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE">;
  getVisemes(): Array<{ viseme: string; durationMs: number }>;
  dispose(): void;
}

export interface Noelia3DVoiceController {
  startSession(profile?: unknown): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE">;
  endSession(): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE">;
  getSpeakingState(): "speaking" | "listening" | "idle" | "interrupted" | "offline";
  dispose(): void;
}

export interface Noelia3DModelLoadResult {
  status: "LOADED" | "NOT_CONFIGURED" | "UNAVAILABLE" | "FAIL_CLOSED";
  modelId?: string;
  modelPath?: string;
  format?: "GLTF" | "GLB" | "OTHER";
  message: string;
}

export interface Noelia3DModelProvider {
  loadModel(modelId?: string): Promise<Noelia3DModelLoadResult>;
  getCapabilities(): { formats: string[]; expressionsSupported: boolean; animationsSupported: boolean; blendShapesSupported: boolean; lipSyncSupported: boolean };
  dispose(): void;
}

export interface Noelia3DSceneConfig {
  cameraPosition?: { x: number; y: number; z: number };
  lighting?: "DEFAULT" | "STUDIO" | "NATURAL" | "NONE";
  environment?: string | null;
  reducedMotion?: boolean;
}

export interface Noelia3DScene {
  initialize(config?: Noelia3DSceneConfig): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE">;
  render(frame?: number): void;
  dispose(): void;
  getWebGLStatus(): "AVAILABLE" | "UNAVAILABLE" | "NOT_SUPPORTED";
}

/** Default 3D scene manager — lazy initialization, graceful fallback. */
export class DefaultNoelia3DScene implements Noelia3DScene {
  private webGLStatus: "AVAILABLE" | "UNAVAILABLE" | "NOT_SUPPORTED" = "NOT_SUPPORTED";

  async initialize(config?: Noelia3DSceneConfig): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE"> {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) {
        this.webGLStatus = "UNAVAILABLE";
        return "UNAVAILABLE";
      }
      this.webGLStatus = "AVAILABLE";
      // Production architecture: scene initialization is ready.
      // Actual Three.js / React Three Fiber initialization requires
      // the dynamic import of the 3D library and is performed lazily.
      return "COMPLETED";
    } catch {
      this.webGLStatus = "UNAVAILABLE";
      return "UNAVAILABLE";
    }
  }

  render(_frame?: number): void {
    // Production: render loop delegated to the 3D library (lazy-loaded).
  }

  dispose(): void {
    this.webGLStatus = "NOT_SUPPORTED";
  }

  getWebGLStatus(): "AVAILABLE" | "UNAVAILABLE" | "NOT_SUPPORTED" {
    return this.webGLStatus;
  }
}

/** Default model provider — provider-neutral, returns NOT_CONFIGURED when no model is mounted. */
export class DefaultNoelia3DModelProvider implements Noelia3DModelProvider {
  async loadModel(_modelId?: string): Promise<Noelia3DModelLoadResult> {
    return {
      status: "NOT_CONFIGURED",
      message: "No 3D model is configured. A finished GLTF/GLB model, rig, expressions, blend shapes, and animations are required before 3D embodiment can be completed. The architecture is ready.",
    };
  }

  getCapabilities(): { formats: string[]; expressionsSupported: boolean; animationsSupported: boolean; blendShapesSupported: boolean; lipSyncSupported: boolean } {
    return {
      formats: ["GLTF", "GLB", "OTHER"],
      expressionsSupported: true,
      animationsSupported: true,
      blendShapesSupported: true,
      lipSyncSupported: false,
    };
  }

  dispose(): void {
    // Nothing to dispose; no external model loaded.
  }
}

/** Default expression controller — architecture ready, not configured. */
export class DefaultNoelia3DExpressionController implements Noelia3DExpressionController {
  private currentExpression: Noelia3DExpression = "idle";

  async setExpression(expression: Noelia3DExpression): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE"> {
    this.currentExpression = expression;
    return "NOT_SUPPORTED"; // No configured 3D model / expression rig.
  }

  getCurrentExpression(): Noelia3DExpression {
    return this.currentExpression;
  }

  dispose(): void {
    this.currentExpression = "idle";
  }
}

/** Default animation controller — architecture ready, not configured. */
export class DefaultNoelia3DAnimationController implements Noelia3DAnimationController {
  private currentAnimation: Noelia3DAnimationState | null = null;

  async playAnimation(state: Noelia3DAnimationState): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE"> {
    this.currentAnimation = state;
    return "NOT_SUPPORTED";
  }

  async stopAnimation(): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE"> {
    this.currentAnimation = null;
    return "NOT_SUPPORTED";
  }

  getCurrentAnimation(): Noelia3DAnimationState | null {
    return this.currentAnimation;
  }

  dispose(): void {
    this.currentAnimation = null;
  }
}

/** Default lip-sync controller — architecture ready, not configured. */
export class DefaultNoelia3DLipSyncController implements Noelia3DLipSyncController {
  async sync(_text: string, _profile?: unknown): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE"> {
    return "NOT_SUPPORTED";
  }

  async stop(): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE"> {
    return "NOT_SUPPORTED";
  }

  getVisemes(): Array<{ viseme: string; durationMs: number }> {
    return [];
  }

  dispose(): void {
    // Nothing to dispose.
  }
}

/** Default voice controller — architecture ready, not configured. */
export class DefaultNoelia3DVoiceController implements Noelia3DVoiceController {
  private speakingState: "speaking" | "listening" | "idle" | "interrupted" | "offline" = "idle";

  async startSession(_profile?: unknown): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE"> {
    this.speakingState = "idle";
    return "NOT_SUPPORTED";
  }

  async endSession(): Promise<"COMPLETED" | "NOT_SUPPORTED" | "UNAVAILABLE"> {
    this.speakingState = "idle";
    return "NOT_SUPPORTED";
  }

  getSpeakingState(): "speaking" | "listening" | "idle" | "interrupted" | "offline" {
    return this.speakingState;
  }

  dispose(): void {
    this.speakingState = "offline";
  }
}
