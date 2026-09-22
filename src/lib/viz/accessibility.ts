/**
 * BEYU OS — VISUALIZATION ACCESSIBILITY LAYER (shared capability, §26).
 *
 * All 2D and applicable 3D interfaces must provide accessible alternatives.
 * The invariant enforced here: CRITICAL INFORMATION IS NEVER AVAILABLE ONLY
 * THROUGH GRAPHICS. Every governed manifest carries a complete accessible
 * table + per-object text alternative; every animated affordance honors
 * reduced motion; every palette is contrast-checked against the canonical
 * BEYU identity (Navy #0B1F4D / Gold #D4A017).
 */
import type { SceneManifest } from "./scene-model";

/** Canonical BEYU brand colors (identity preserved — §33). */
export const BEYU_BRAND = {
  navy: "#0B1F4D",
  gold: "#D4A017",
  motto: "Bridging Care. Building Trust.",
  noeliaMotto: "Intelligence • Governance • Care.",
} as const;

/**
 * Categorical series palette derived from the canonical identity. Every entry
 * is verified ≥ 4.5:1 contrast against white AND distinguishable under the
 * three common CVD prototypes at the luminance level (labels always accompany
 * color, so hue is never the sole channel — WCAG 1.4.1).
 */
export const ACCESSIBLE_SERIES_PALETTE: readonly string[] = Object.freeze([
  "#0B1F4D", // BEYU navy
  "#8A6D10", // darkened gold (4.5:1 on white)
  "#1F6F4A", // forest green
  "#8C3B12", // burnt sienna
  "#3D4E8C", // slate blue
  "#6B2D5C", // plum
  "#4A5A0F", // olive
  "#9A1B2F", // crimson
]);

/** Severity → color + ALWAYS a text label (dual channel). */
export const SEVERITY_PRESENTATION: Record<string, { color: string; label: string }> = {
  LOW: { color: "#1F6F4A", label: "Low severity" },
  MEDIUM: { color: "#8A6D10", label: "Medium severity" },
  HIGH: { color: "#8C3B12", label: "High severity" },
  CRITICAL: { color: "#9A1B2F", label: "Critical severity" },
  UNKNOWN: { color: "#4A5568", label: "Severity unknown (withheld or not observed)" },
};

/** Relative luminance (WCAG 2.x). */
export function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(clean.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA for normal text requires ≥ 4.5:1. */
export function meetsContrastAA(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= 4.5;
}

/**
 * Full text alternative for a manifest — the screen-reader and low-bandwidth
 * representation of the entire scene (§26/§27). Deterministic from the
 * governed manifest, so the text can never disclose more than the graphics.
 */
export function sceneTextAlternative(manifest: SceneManifest): string {
  const parts: string[] = [
    `Visualization: ${manifest.name}. Sector: ${manifest.sector}. Dimensions: ${manifest.dimensions.join(", ")}.`,
    `Layers: ${manifest.layers.map((l) => `${l.label} (${l.dimensionId}, ${l.kind})`).join("; ")}.`,
    `${manifest.objects.length} object(s) shown${manifest.withheldByClassification > 0 ? `; ${manifest.withheldByClassification} object(s) withheld by classification ceiling` : ""}.`,
    ...manifest.objects.slice(0, 50).map((o) => o.accessibleText),
    manifest.objects.length > 50 ? `…and ${manifest.objects.length - 50} more object(s), all present in the accessible table.` : "",
    `Data provenance: ${manifest.provenance.sourceAdapter} from ${manifest.provenance.systemOfRecord}; epistemic status ${manifest.provenance.epistemicStatus}; collected ${manifest.provenance.collectedAt}.`,
  ];
  return parts.filter(Boolean).join(" ");
}

/** Keyboard interaction contract published to every viz client component:
 * focusable controls, visible focus rings, and full operability without a
 * pointer (§26). Components assert against this contract in tests. */
export const KEYBOARD_CONTRACT = {
  sceneNavigation: ["Tab", "Shift+Tab"],
  objectSelection: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Space"],
  timelinePlayback: ["Home", "End", "ArrowLeft", "ArrowRight"],
  dimensionToggle: ["Enter", "Space"],
  escapePanel: ["Escape"],
} as const;

/** Reduced-motion policy: animation is an enhancement, never a channel.
 * Clients read `prefers-reduced-motion` AND the server-resolved presentation
 * hint; when either requests reduced motion, playback steps are manual. */
export function shouldAnimate(reducedMotionPreference: boolean, manifestReducedMotion: boolean): boolean {
  return !reducedMotionPreference && !manifestReducedMotion;
}
