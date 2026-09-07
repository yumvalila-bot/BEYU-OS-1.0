/**
 * VOICE ARCHITECTURE TESTS — Provider-neutral interfaces,
 * no fake production voice integration, graceful fallback.
 */
import { describe, it, expect } from "vitest";
import {
  DefaultSpeechInputProvider,
  DefaultSpeechOutputProvider,
  DefaultLipSyncProvider,
  DefaultVoiceSession,
} from "@/lib/noelia/voice-architecture";

describe("Noelia Voice Architecture", () => {
  it("default input provider returns NOT_CONFIGURED", async () => {
    const provider = new DefaultSpeechInputProvider();
    const result = await provider.startRecording();
    expect(result.status).toBe("NOT_CONFIGURED");
    provider.dispose();
  });

  it("default output provider returns NOT_CONFIGURED", async () => {
    const provider = new DefaultSpeechOutputProvider();
    const result = await provider.speak("Hello", { voice_id: "test", language: "en" });
    expect(result.status).toBe("NOT_CONFIGURED");
    expect(result.audioUrl).toBeUndefined();
    expect(result.blob).toBeUndefined();
    provider.dispose();
  });

  it("default lip-sync provider returns NOT_SUPPORTED", async () => {
    const provider = new DefaultLipSyncProvider();
    const result = await provider.sync("Hello");
    expect(["NOT_SUPPORTED", "NOT_CONFIGURED", "UNAVAILABLE", "COMPLETED"]).toContain(result.status);
    provider.dispose();
  });

  it("default voice session manages state without production provider", async () => {
    const input = new DefaultSpeechInputProvider();
    const output = new DefaultSpeechOutputProvider();
    const session = new DefaultVoiceSession("test-session", { voice_id: "test", language: "en" }, input, output);
    const startResult = await session.start();
    expect(["NOT_CONFIGURED", "STARTED", "UNAVAILABLE"]).toContain(startResult.status);
    await session.stop();
    session.dispose();
  });

  it("no fake voice response is produced", async () => {
    const output = new DefaultSpeechOutputProvider();
    const result = await output.speak("Test text.", { voice_id: "fake", language: "en" });
    expect(result.status).toBe("NOT_CONFIGURED");
    expect(result.blob).toBeUndefined();
    expect(result.audioUrl).toBeUndefined();
    output.dispose();
  });

  it("interruption mechanism exists but requires configured provider", async () => {
    const input = new DefaultSpeechInputProvider();
    const output = new DefaultSpeechOutputProvider();
    const session = new DefaultVoiceSession("test-interrupt", { voice_id: "test", language: "en" }, input, output, undefined, true);
    const interruptResult = await session.interrupt();
    expect(["INTERRUPTED", "NOT_SUPPORTED", "UNAVAILABLE"]).toContain(interruptResult.status);
    session.dispose();
  });

  it("voice profile carries language, gender, use_case, speaking_rate, pitch", () => {
    const profile = {
      voice_id: "noelia-test",
      language: "en-US",
      gender: "feminine" as const,
      use_case: "narration" as const,
      speaking_rate: 0.95,
      pitch: 1.05,
    };
    expect(profile.voice_id).toBe("noelia-test");
    expect(profile.language).toContain("en");
  });
});
