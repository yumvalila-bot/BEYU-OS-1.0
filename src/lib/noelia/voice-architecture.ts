/**
 * NOELIA VOICE ARCHITECTURE — Provider-Neutral Interfaces
 *
 * Architecture ready for future speech input/output providers.
 * No fake production voice integration is implemented.
 */

export interface VoiceProfile {
  voice_id: string;
  language: string; // BCP-47 language tag
  accent?: string; // Optional region subtag
  gender?: "feminine" | "masculine" | "neutral";
  speaking_rate?: number; // Optional (e.g., 1.0 = normal)
  pitch?: number; // Optional
  use_case?: "narration" | "conversational" | "educational" | "entertainment" | "advertising" | "characters";
}

export interface VoiceSessionState {
  sessionId: string;
  voiceProfile: VoiceProfile;
  speakingState: "speaking" | "listening" | "idle" | "interrupted" | "offline";
  streamActive: boolean;
  interruptionAllowed: boolean;
  language: string;
}

export interface SpeechInputProvider {
  startRecording(): Promise<{ status: "STARTED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string }>;
  stopRecording(): Promise<{ status: "COMPLETED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string; text?: string }>;
  stream(): AsyncIterable<string> | Promise<{ status: "NOT_CONFIGURED" | "UNAVAILABLE"; message: string }>;
  dispose(): void;
  getCapabilities(): { streamingSupported: boolean; languagesSupported: string[]; realTimeSupported: boolean };
}

export interface SpeechOutputProvider {
  speak(text: string, profile: VoiceProfile): Promise<{ status: "COMPLETED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string; audioUrl?: string; blob?: Blob }>;
  stream(text: string, profile: VoiceProfile): Promise<{ status: "COMPLETED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string; stream?: ReadableStream }>;
  stop(): Promise<{ status: "COMPLETED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string }>;
  dispose(): void;
  getCapabilities(): { languagesSupported: string[]; voicesAvailable: number; streamingSupported: boolean; interruptionSupported: boolean };
}

export interface LipSyncProvider {
  sync(text: string, profile?: VoiceProfile): Promise<{ status: "COMPLETED" | "NOT_CONFIGURED" | "NOT_SUPPORTED" | "UNAVAILABLE"; message: string; visemes?: Array<{ viseme: string; durationMs: number }> }>;
  stop(): Promise<{ status: "COMPLETED" | "NOT_CONFIGURED" | "NOT_SUPPORTED" | "UNAVAILABLE"; message: string }>;
  getCapabilities(): { formatsSupported: string[]; realTimeSupported: boolean; visemeMappingAvailable: boolean };
  dispose(): void;
}

export interface VoiceSession {
  sessionId: string;
  voiceProfile: VoiceProfile;
  inputProvider: SpeechInputProvider;
  outputProvider: SpeechOutputProvider;
  lipSyncProvider?: LipSyncProvider;
  interruptionAllowed: boolean;
  streamActive: boolean;
  speakingState: "speaking" | "listening" | "idle" | "interrupted" | "offline";
  start(): Promise<{ status: "STARTED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string }>;
  stop(): Promise<{ status: "STOPPED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string }>;
  interrupt(): Promise<{ status: "INTERRUPTED" | "NOT_SUPPORTED" | "UNAVAILABLE"; message: string }>;
  changeProfile(profile: VoiceProfile): Promise<{ status: "COMPLETED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string }>;
  getState(): VoiceSessionState;
  dispose(): void;
}

/** Default voice session — architecture ready, no production provider configured. */
export class DefaultVoiceSession implements VoiceSession {
  sessionId: string;
  voiceProfile: VoiceProfile;
  inputProvider: SpeechInputProvider;
  outputProvider: SpeechOutputProvider;
  lipSyncProvider?: LipSyncProvider;
  interruptionAllowed: boolean;
  streamActive: boolean = false;
  speakingState: "speaking" | "listening" | "idle" | "interrupted" | "offline" = "offline";

  constructor(
    sessionId: string,
    profile: VoiceProfile,
    inputProvider: SpeechInputProvider,
    outputProvider: SpeechOutputProvider,
    lipSyncProvider?: LipSyncProvider,
    interruptionAllowed = true,
  ) {
    this.sessionId = sessionId;
    this.voiceProfile = profile;
    this.inputProvider = inputProvider;
    this.outputProvider = outputProvider;
    this.lipSyncProvider = lipSyncProvider;
    this.interruptionAllowed = interruptionAllowed;
  }

  async start(): Promise<{ status: "STARTED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string }> {
    const inputStatus = await this.inputProvider.startRecording();
    const outputStatus = await this.outputProvider.speak("Initializing voice session.", this.voiceProfile);
    if (inputStatus.status === "NOT_CONFIGURED" || outputStatus.status === "NOT_CONFIGURED") {
      this.speakingState = "offline";
      return { status: "NOT_CONFIGURED", message: "No voice provider is configured. The architecture is ready for future providers." };
    }
    this.streamActive = true;
    this.speakingState = "idle";
    return { status: "STARTED", message: "Voice session started (architecture mode — no configured provider)." };
  }

  async stop(): Promise<{ status: "STOPPED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string }> {
    await this.outputProvider.stop();
    await this.inputProvider.stopRecording();
    this.streamActive = false;
    this.speakingState = "offline";
    return { status: "STOPPED", message: "Voice session stopped." };
  }

  async interrupt(): Promise<{ status: "INTERRUPTED" | "NOT_SUPPORTED" | "UNAVAILABLE"; message: string }> {
    if (!this.interruptionAllowed) {
      return { status: "NOT_SUPPORTED", message: "Interruption is not allowed for this session." };
    }
    await this.outputProvider.stop();
    this.speakingState = "interrupted";
    return { status: "INTERRUPTED", message: "Voice session interrupted." };
  }

  async changeProfile(profile: VoiceProfile): Promise<{ status: "COMPLETED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string }> {
    this.voiceProfile = profile;
    return { status: "COMPLETED", message: "Profile updated (no production provider to apply)." };
  }

  getState(): VoiceSessionState {
    return {
      sessionId: this.sessionId,
      voiceProfile: this.voiceProfile,
      speakingState: this.speakingState,
      streamActive: this.streamActive,
      interruptionAllowed: this.interruptionAllowed,
      language: this.voiceProfile.language,
    };
  }

  dispose(): void {
    this.inputProvider.dispose();
    this.outputProvider.dispose();
    this.lipSyncProvider?.dispose();
    this.streamActive = false;
    this.speakingState = "offline";
  }
}

/** Default speech input provider — returns NOT_CONFIGURED. */
export class DefaultSpeechInputProvider implements SpeechInputProvider {
  async startRecording(): Promise<{ status: "STARTED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string }> {
    return { status: "NOT_CONFIGURED", message: "No speech input provider configured." };
  }
  async stopRecording(): Promise<{ status: "COMPLETED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string; text?: string }> {
    return { status: "NOT_CONFIGURED", message: "No speech input provider configured." };
  }
  stream(): AsyncIterable<string> | Promise<{ status: "NOT_CONFIGURED" | "UNAVAILABLE"; message: string }> {
    return Promise.resolve({ status: "NOT_CONFIGURED", message: "No speech input provider configured." });
  }
  dispose(): void {}
  getCapabilities(): { streamingSupported: boolean; languagesSupported: string[]; realTimeSupported: boolean } {
    return { streamingSupported: false, languagesSupported: [], realTimeSupported: false };
  }
}

/** Default speech output provider — returns NOT_CONFIGURED. */
export class DefaultSpeechOutputProvider implements SpeechOutputProvider {
  async speak(_text: string, _profile: VoiceProfile): Promise<{ status: "COMPLETED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string; audioUrl?: string; blob?: Blob }> {
    return { status: "NOT_CONFIGURED", message: "No speech output provider configured." };
  }
  async stream(_text: string, _profile: VoiceProfile): Promise<{ status: "COMPLETED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string; stream?: ReadableStream }> {
    return { status: "NOT_CONFIGURED", message: "No speech output provider configured." };
  }
  async stop(): Promise<{ status: "COMPLETED" | "NOT_CONFIGURED" | "UNAVAILABLE"; message: string }> {
    return { status: "NOT_CONFIGURED", message: "No speech output provider configured." };
  }
  dispose(): void {}
  getCapabilities(): { languagesSupported: string[]; voicesAvailable: number; streamingSupported: boolean; interruptionSupported: boolean } {
    return { languagesSupported: [], voicesAvailable: 0, streamingSupported: false, interruptionSupported: false };
  }
}

/** Default lip-sync provider — returns NOT_SUPPORTED. */
export class DefaultLipSyncProvider implements LipSyncProvider {
  async sync(_text: string, _profile?: VoiceProfile): Promise<{ status: "COMPLETED" | "NOT_CONFIGURED" | "NOT_SUPPORTED" | "UNAVAILABLE"; message: string; visemes?: Array<{ viseme: string; durationMs: number }> }> {
    return { status: "NOT_SUPPORTED", message: "No lip-sync provider configured." };
  }
  async stop(): Promise<{ status: "COMPLETED" | "NOT_CONFIGURED" | "NOT_SUPPORTED" | "UNAVAILABLE"; message: string }> {
    return { status: "NOT_SUPPORTED", message: "No lip-sync provider configured." };
  }
  getCapabilities(): { formatsSupported: string[]; realTimeSupported: boolean; visemeMappingAvailable: boolean } {
    return { formatsSupported: [], realTimeSupported: false, visemeMappingAvailable: false };
  }
  dispose(): void {}
}
