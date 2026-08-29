import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { BEYU_BRAND_ASSETS } from "@/components/brand-assets";

export const metadata: Metadata = {
  title: "BEYU OS — Global Enterprise Control Plane",
  description:
    "BEYU OS is the constitutional, governance, identity, capital, risk, compliance, data and AI control plane of the BEYU ecosystem.",
  icons: {
    icon: BEYU_BRAND_ASSETS.favicon,
    apple: BEYU_BRAND_ASSETS.favicon,
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BEYU OS",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
