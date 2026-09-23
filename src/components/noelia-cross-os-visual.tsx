/**
 * <NoeliaCrossOSVisual /> — Cross-OS canonical visual resolution.
 *
 * Every OS context resolves to the SAME single canonical Noelia appearance
 * (/NOELIA.png) via the canonical asset mapping. Only contextual metadata
 * (label, caption) changes per OS — never the appearance asset.
 */
import { NOELIA_ASSET_MAPPING } from "@/lib/noelia/context-resolver";

export interface NoeliaCrossOSVisualProps {
  activeOS?: string;
  size?: number;
  state?: string;
  className?: string;
  alt?: string;
}

export function NoeliaCrossOSVisual({
  activeOS = "BEYU_OS",
  size = 168,
  state = "idle",
  className = "",
  alt,
}: NoeliaCrossOSVisualProps) {
  const mappingKey = (activeOS.toUpperCase() in NOELIA_ASSET_MAPPING) ? activeOS.toUpperCase() : "NOELIA_AI";
  const mapping = NOELIA_ASSET_MAPPING[mappingKey] ?? NOELIA_ASSET_MAPPING["NOELIA_AI"];

  const label = alt ?? `Noelia — ${mappingKey.replace("_", " ").toLowerCase()} context`;
  const title = `Noelia AI — canonical identity (${mappingKey.replace("_", " ")})`;

  return (
    <figure className={`inline-flex flex-col items-center ${className}`} aria-label={label}>
      <img
        src={mapping.path}
        alt={label}
        title={title}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="rounded-full object-cover shadow-md"
        loading="lazy"
      />
      <figcaption className="mt-2 text-[11px] font-medium tracking-wide beyu-muted">
        {mappingKey.replace("_", " ")}
      </figcaption>
      <span className="sr-only">Canonical visual identity preserved from {mapping.logicalId}.</span>
    </figure>
  );
}
