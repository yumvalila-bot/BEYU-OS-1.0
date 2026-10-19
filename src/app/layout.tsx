import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { BEYU_BRAND_ASSETS, BEYU_OS_ASSETS } from "@/components/brand-assets";
import { DevicePreferenceInitializer } from "@/components/device-preferences";
import { CookieConsentBanner } from "@/components/cookie-consent";
import { OfflineIndicator } from "@/components/offline-indicator";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0B1F4D",
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://beyu-os-1-0.vercel.app"),
  applicationName: "BEYU OS",
  title: { default: "BEYU OS — Global Enterprise Control Plane", template: "%s | BEYU OS" },
  description:
    "BEYU OS is the constitutional, governance, identity, capital, risk, compliance, data and AI control plane of the BEYU ecosystem.",
  keywords: ["BEYU OS", "enterprise control plane", "governance", "Tanzania", "Health OS", "Finance OS"],
  authors: [{ name: "BEYU Family Trust" }],
  creator: "BEYU OS",
  publisher: "BEYU OS",
  formatDetection: { email: false, address: false, telephone: false },
  openGraph: {
    siteName: "BEYU OS",
    title: "BEYU OS — Global Enterprise Control Plane",
    description: "Bridging Care. Building Trust.",
    url: "https://beyu-os-1-0.vercel.app",
    images: [{ url: BEYU_OS_ASSETS.official, width: 1254, height: 1254, alt: "BEYU OS — Bridging Care. Building Trust." }],
    type: "website",
    locale: "en_TZ",
  },
  twitter: {
    card: "summary_large_image",
    title: "BEYU OS — Global Enterprise Control Plane",
    description: "Bridging Care. Building Trust.",
    images: [BEYU_OS_ASSETS.official],
    creator: "@beyu_os",
  },
  icons: {
    icon: [
      { url: BEYU_BRAND_ASSETS.favicon, type: "image/png", sizes: "32x32" },
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: BEYU_BRAND_ASSETS.appIcon192, sizes: "192x192", type: "image/png" },
      { url: BEYU_BRAND_ASSETS.appIcon512, sizes: "512x512", type: "image/png" },
    ],
    shortcut: BEYU_BRAND_ASSETS.favicon,
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BEYU OS",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  alternates: {
    canonical: "https://beyu-os-1-0.vercel.app",
  },
  category: "enterprise",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preload critical brand asset */}
        <link rel="preload" as="image" href={BEYU_BRAND_ASSETS.favicon} type="image/png" />
      </head>
      <body className="antialiased">
        <DevicePreferenceInitializer />
        <ServiceWorkerRegister />
        {children}
        <OfflineIndicator />
        <CookieConsentBanner />
      </body>
    </html>
  );
}
