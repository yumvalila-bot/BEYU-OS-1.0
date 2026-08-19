import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "BEYU OS — Global Enterprise Control Plane",
  description:
    "BEYU OS is the constitutional, governance, identity, capital, risk, compliance, data and AI control plane of the BEYU ecosystem.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
