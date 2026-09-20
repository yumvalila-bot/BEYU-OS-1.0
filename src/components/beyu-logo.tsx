import { BeyuOsLogo, type BeyuOsLogoProps } from "./beyu-os-logo";

/** @deprecated Use BeyuOsLogo. Legacy variants now present the same unmodified source. */
export type BeyuLogoVariant = "full" | "mark" | "light" | "dark";
export interface BeyuLogoProps extends BeyuOsLogoProps {
  variant?: BeyuLogoVariant;
}

/** Compatibility only: no separate artwork, geometry or institutional identity. */
export function BeyuLogo({ variant = "full", ariaLabel, ...props }: BeyuLogoProps) {
  return <BeyuOsLogo {...props} ariaLabel={ariaLabel ?? (props.href ? (variant === "mark" ? "BEYU home" : "BEYU OS home") : (variant === "mark" ? "BEYU" : "BEYU OS"))} />;
}
