import { BeyuOsLogo } from "../../../../src/components/beyu-os-logo";

type Props = {
  variant?: "full" | "mark" | "stacked" | "white";
  size?: number;
  className?: string;
  showTagline?: boolean;
};

/** Existing Health presentation API; institutional artwork is shared, never redrawn. */
export function Logo({ variant = "full", size = 56, className = "", showTagline = false }: Props) {
  return (
    <div className={`inline-flex ${variant === "stacked" ? "flex-col items-center gap-1" : "items-center gap-3"} ${className}`}>
      <BeyuOsLogo size={size} decorative={variant !== "mark"} />
      {variant !== "mark" && (
        <div style={{ color: variant === "white" ? "#ffffff" : "#0B1F4D" }}>
          <div className="font-display font-semibold">Health OS</div>
          {showTagline && <div className="mt-2 text-[10px]">Bridging Care. Building Trust.</div>}
        </div>
      )}
    </div>
  );
}
