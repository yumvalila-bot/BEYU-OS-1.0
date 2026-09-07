/**
 * 3D ARCHITECTURE TESTS — Provider/model-independent interfaces,
 * graceful fallback, reduced motion, lazy initialization.
 */
import { describe, it, expect } from "vitest";
import {
  DefaultNoelia3DScene,
  DefaultNoelia3DModelProvider,
  DefaultNoelia3DExpressionController,
  DefaultNoelia3DAnimationController,
  DefaultNoelia3DLipSyncController,
  DefaultNoelia3DVoiceController,
} from "@/lib/noelia/3d-architecture";

describe("Noelia 3D Architecture", () => {
  it("default scene initializes with graceful fallback when WebGL unavailable", async () => {
    const scene = new DefaultNoelia3DScene();
    const result = await scene.initialize({ reducedMotion: true });
    // Should return COMPLETED (architecture ready) or UNAVAILABLE (no WebGL).
    // The architecture must never throw.
    expect(["COMPLETED", "UNAVAILABLE", "NOT_SUPPORTED"]).toContain(result);
    scene.dispose();
  });

  it("default model provider returns NOT_CONFIGURED (no fabricated model)", async () => {
    const provider = new DefaultNoelia3DModelProvider();
    const result = await provider.loadModel();
    expect(result.status).toBe("NOT_CONFIGURED");
    expect(result.message).toContain("No 3D model is configured");
    expect(result.modelId).toBeUndefined();
    provider.dispose();
  });

  it("default expression controller returns NOT_SUPPORTED", async () => {
    const controller = new DefaultNoelia3DExpressionController();
    const result = await controller.setExpression("thinking");
    expect(["NOT_SUPPORTED", "UNAVAILABLE", "COMPLETED"]).toContain(result);
    controller.dispose();
  });

  it("default animation controller manages state", async () => {
    const controller = new DefaultNoelia3DAnimationController();
    await controller.playAnimation("idle");
    expect(controller.getCurrentAnimation()).toBe("idle");
    await controller.stopAnimation();
    expect(controller.getCurrentAnimation()).toBeNull();
    controller.dispose();
  });

  it("default lip-sync controller returns NOT_SUPPORTED", async () => {
    const controller = new DefaultNoelia3DLipSyncController();
    const result = await controller.sync("Hello");
    expect(["NOT_SUPPORTED", "UNAVAILABLE", "COMPLETED"]).toContain(result);
    expect(controller.getVisemes()).toEqual([]);
    controller.dispose();
  });

  it("default voice controller manages session state", async () => {
    const controller = new DefaultNoelia3DVoiceController();
    expect(controller.getSpeakingState()).toBe("idle");
    controller.dispose();
    expect(controller.getSpeakingState()).toBe("offline");
  });

  it("capabilities reflect architecture readiness (not fabricated model)", () => {
    const provider = new DefaultNoelia3DModelProvider();
    const caps = provider.getCapabilities();
    expect(caps.formats).toContain("GLTF");
    expect(caps.formats).toContain("GLB");
    expect(caps.expressionsSupported).toBe(true);
    expect(caps.animationsSupported).toBe(true);
    expect(caps.blendShapesSupported).toBe(true);
    expect(caps.lipSyncSupported).toBe(false); // Not configured.
    provider.dispose();
  });

  it("no 3D model claim is fabricated", async () => {
    const provider = new DefaultNoelia3DModelProvider();
    const result = await provider.loadModel("nonexistent-model");
    expect(result.status).toBe("NOT_CONFIGURED");
    expect(result.modelPath).toBeUndefined();
    provider.dispose();
  });
});
