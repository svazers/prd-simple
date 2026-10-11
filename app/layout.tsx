import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SvazerPRD: Bikin Plan, Desain, dan Coding Bareng AI — Gratis",
  description:
    "Dari ide jadi PRD, spec fitur dan task yang siap dipake AI coding agent. Gratis, tanpa login.",
};

export const viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
