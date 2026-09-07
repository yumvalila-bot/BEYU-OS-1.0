# NOELIA VOICE ARCHITECTURE

## Status

**ARCHITECTURE READY · PRODUCTION VOICE EXTERNALLY DEPENDENT.**

Provider-neutral voice interfaces exist. No fake production voice integration
is implemented. The architecture is ready for future speech-to-text, text-to-speech,
voice selection, speaking state, interruption, streaming, and lip synchronization
providers.

## Provider-Neutral Interfaces

### `SpeechInputProvider`
- Input: audio stream or microphone access.
- Output: transcribed text (`string` or `AsyncIterable<string>` for streaming).
- Methods: `startRecording()`, `stopRecording()`, `stream()`, `dispose()`.
- Returns `NOT_CONFIGURED` when no provider is registered.

### `SpeechOutputProvider`
- Input: text + `VoiceProfile`.
- Output: audio stream (`Blob`, `ArrayBuffer`, or `HTMLAudioElement` source).
- Methods: `speak(text, profile)`, `stream(text, profile)`, `stop()`, `dispose()`.
- Returns `NOT_CONFIGURED` when no provider is registered.

### `VoiceProfile`
- Contains: `voice_id`, `language` (BCP-47), `accent` (optional region subtag),
  `gender` (`feminine` / `masculine` / `neutral`), `speaking_rate` (optional),
  `pitch` (optional), `use_case` (optional: `narration`, `conversational`, `educational`, etc.).
- Never hard-codes a vendor identity; the `voice_id` is a provider-neutral reference.

### `VoiceSession`
- Manages the lifecycle of a voice interaction.
- Contains: `sessionId`, `voiceProfile`, `inputProvider`, `outputProvider`,
  `interruptionAllowed`, `streamActive`, `speakingState` (`speaking` / `listening` / `idle` / `interrupted`).
- Provides interruption mechanism: `interrupt()` stops the current output and resets state.

### `LipSyncProvider`
- Input: audio stream or text + timing information.
- Output: viseme sequence (`Array<{viseme: string, durationMs: number}>`).
- Ready for future integration with speech output providers.
- Returns `NOT_SUPPORTED` until configured.

## Design Rules

1. **No vendor lock-in.** Every interface accepts a provider-agnostic contract.
2. **No hard-coded vendor.** The repository does not contain any external
   speech vendor API key, endpoint URL, or vendor-specific SDK initialization.
3. **No fabricated speech.** `SpeechOutputProvider.speak()` does not generate
   synthetic speech from a hard-coded message. It delegates to a registered
   provider or returns `NOT_CONFIGURED`.
4. **State awareness.** Voice sessions distinguish `speaking`, `listening`,
   `idle`, `interrupted`, and `offline` states. The UI (`NoeliaStatus`) reflects
   the voice session state when active.
5. **Accessibility.** Voice interaction provides a text-based alternative
   (`SpeechInputProvider` can be disabled; text input always available).
   Reduced-motion preferences disable non-essential voice-state animations.

## Integration Points

- `Noelia3DCharacter` uses `VoiceSession` and `LipSyncProvider` to drive
  3D facial expressions and animations.
- `NoeliaAvatar` uses `VoiceSession.speakingState` to update the `speaking`
  state indicator.
- `NoeliaPanel` displays voice session status (listening / speaking / idle / interrupted).
- Audit events: `NOELIA_VOICE_SESSION_STARTED`, `NOELIA_VOICE_SESSION_ENDED`,
  `NOELIA_VOICE_INTERRUPT`, `NOELIA_VOICE_STREAM_STARTED`, `NOELIA_VOICE_STREAM_ENDED`,
  `NOELIA_VOICE_ERROR`.

## Source of Truth

- Design: `docs/noelia/NOELIA_VOICE_ARCHITECTURE.md` (this file)
- Code interfaces: `src/lib/noelia/voice-architecture.ts`
- Tests: `tests/noelia/voice-architecture.test.ts` (to be added)
