import type { Metadata } from "next";
import { canonicalHostForRequest, destinationHrefForRequest } from "@/lib/canonical-host";
import { CANONICAL_SURFACES, FOUNDATION_ORGANIZATION, SECTOR_OPERATING_SYSTEMS } from "@/lib/operating-system-catalog";
import CanonicalSignInPage from "./canonical-sign-in";
import { PublicHome } from "./public-home";
import "./public-home.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "BEYU — Bridging Care. Building Trust.",
  description: "Discover BEYU, an African-rooted constitutional enterprise ecosystem connecting governance, operations and intelligence across four sectors.",
  openGraph: {
    title: "BEYU — Bridging Care. Building Trust.",
    description: "A constitutional enterprise operating ecosystem, built for lasting impact.",
    images: [{ url: "/brand/beyu-os-logo.png", alt: "BEYU OS" }],
    type: "website",
  },
};

export default async function Home() {
  const host = await canonicalHostForRequest();
  // Destination hosts retain their independent, governed entry surface.
  if (host.kind === "SECTOR_OS" || host.kind === "SURFACE") return CanonicalSignInPage();
  const hrefFor = await destinationHrefForRequest();
  const links = Object.fromEntries(SECTOR_OPERATING_SYSTEMS.map((destination) => [destination.code, hrefFor(destination)]));
  const noelia = CANONICAL_SURFACES.find((destination) => destination.code === "NOELIA_AI");
  return <PublicHome sectorLinks={links} noeliaLink={noelia ? hrefFor(noelia) : "/sign-in"} foundationLink={hrefFor(FOUNDATION_ORGANIZATION)} />;
}
