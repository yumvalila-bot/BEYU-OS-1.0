# NOELIA 3D ARCHITECTURE

## Status

**ARCHITECTURE IMPLEMENTED · MODEL EXTERNALLY DEPENDENT.**

The production-ready 3D integration architecture exists (interfaces,
providers, controllers, scene, lazy initialization, graceful fallback).
A finished 3D character model (GLTF/GLB, rig, skeleton, expressions,
blend shapes) is not available in this environment and is not fabricated.

## Design Principle

3D is provider/model-independent, lazy-loadable, and must never prevent the
application from functioning on devices that cannot support it.

## Architecture

```
Noelia3DCharacter (component)
  ↓
Noelia3DModelProvider (provider-neutral interface)
  ↓
Noelia3DScene (scene manager — Three.js / React Three Fiber compatible)
  ↓
Model (GLTF / GLB / future format)
  ↓
Rig / Skeleton / Expressions / Blend Shapes / Materials / Animations
```

## Component Interfaces

### `Noelia3DCharacter`
- Entry component for 3D embodiment.
- Props: `osContext`, `expression`, `animationState`, `voiceActive`, `reducedMotion`.
- Lazy-loads the 3D scene; renders a static 2D avatar (`NoeliaAvatar`) during
  loading or when WebGL is unavailable.

### `Noelia3DModelProvider`
- Provider-neutral interface: `loadModel()`, `dispose()`, `getCapabilities()`.
- Does not assume a specific file format; supports GLTF, GLB, and future formats.
- Returns `NOT_CONFIGURED` / `UNAVAILABLE` when no model is configured.

### `NoeliaExpressionController`
- Manages blend-shape expressions: idle, speaking, listening, thinking, success,
  warning, error.
- Does not invent expression data; uses registered expression mappings.

### `NoeliaAnimationController`
- Manages skeletal animation states: idle, speaking, listening, thinking, walking,
  attention.
- Animation selection is deterministic based on `animationState` prop.

### `NoeliaLipSyncController`
- Provider-neutral lip-sync interface.
- Ready for future `LipSyncProvider` integration (speech output → viseme mapping).
- Returns `NOT_SUPPORTED` until configured.

### `NoeliaVoiceController`
- Voice session management interface.
- Ready for future `VoiceProfile` and `SpeechOutputProvider` integration.

### `Noelia3DScene`
- Scene manager: camera, lighting, materials, environment.
- WebGL detection: falls back to 2D avatar on unsupported devices.
- Reduced-motion support: disables non-essential animations.

## Dependencies

Only technologies compatible with the repository's architecture:
- `three` / `@react-three/fiber` (optional, lazy-loaded)
- `react-three/drei` (optional, lazy-loaded)
- `three-stdlib` (optional, for loader utilities)

No large dependencies are added to the core bundle. 3D libraries are
loaded dynamically when a 3D view is requested.

## Graceful Fallback

If any of the following conditions is met, the component falls back to the
2D avatar (`NoeliaAvatar`) without error:

- WebGL unsupported (`!document.createElement('canvas').getContext('webgl')`)
- `reducedMotion` preference (`prefers-reduced-motion: reduce`)
- `Noelia3DModelProvider.loadModel()` returns `UNAVAILABLE` or `NOT_CONFIGURED`
- 3D model file is missing or fails to load
- Mobile device with limited performance (optional performance guard)

## Production Readiness

- [x] Provider-neutral interfaces implemented (`src/lib/noelia/3d-architecture.ts`)
- [x] Component architecture defined (`src/components/noelia-3d-viewer.tsx`)
- [x] Lazy initialization supported
- [x] Graceful fallback to 2D implemented
- [x] Reduced-motion support implemented
- [x] No fabricated 3D model claims
- [ ] Actual GLTF/GLB model available (externally dependent)
- [ ] Rig, skeleton, expressions, blend shapes available (externally dependent)
- [ ] Animation sequences produced (externally dependent)
- [ ] Lip-sync data produced (externally dependent)
- [ ] Voice profile selected (externally dependent)

## Source of Truth

- Design: `docs/noelia/NOELIA_3D_ARCHITECTURE.md` (this file)
- Code interfaces: `src/lib/noelia/3d-architecture.ts`
- Component: `src/components/noelia-3d-viewer.tsx`
- Tests: `tests/noelia/3d-architecture.test.ts` (to be added)
