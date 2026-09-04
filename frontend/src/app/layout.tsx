import type { Metadata } from "next";
import type { Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], display: "swap", variable: "--font-sans" });
const display = Fraunces({ subsets: ["latin"], display: "swap", variable: "--font-display" });

export const metadata: Metadata = {
  title: "Call Break - Scorekeeper",
  description: "Track Call Break scores, bids, tricks, penalties and final settlement.",
  icons: { icon: "/icons/call-break.svg" },
};

export const viewport: Viewport = {
  themeColor: "#155c37",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
