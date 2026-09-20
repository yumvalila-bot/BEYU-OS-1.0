import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { BEYU_BRAND_ASSETS, BEYU_OS_ASSETS } from "@/components/brand-assets";
import { DevicePreferenceInitializer } from "@/components/device-preferences";

export const metadata: Metadata = {
  metadataBase: new URL("https://beyu-os-1-0.vercel.app"),
  applicationName: "BEYU OS",
  title: { default: "BEYU OS — Global Enterprise Control Plane", template: "%s | BEYU OS" },
  openGraph: {
    siteName: "BEYU OS",
    title: "BEYU OS — Global Enterprise Control Plane",
    description: "Bridging Care. Building Trust.",
    images: [{ url: BEYU_OS_ASSETS.official, width: 1254, height: 1254, alt: "BEYU OS" }],
    type: "website",
  },
  description:
    "BEYU OS is the constitutional, governance, identity, capital, risk, compliance, data and AI control plane of the BEYU ecosystem.",
  icons: {
    icon: BEYU_BRAND_ASSETS.favicon,
    apple: BEYU_BRAND_ASSETS.appIcon192,
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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <DevicePreferenceInitializer />
        {children}
      </body>
    </html>
  );
}
